import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { AiRun, Message } from "./types";
import { getOrCreateRun, loadGroupAis, settingsOf, systemMessage, updateRun, type AiProfile } from "./groups";
import { buildSystemPrompt } from "./personality";
import { generate, ProviderError } from "./providers";
import { getApiKey, logUsage, markKeyError, usageSnapshot } from "./usage";
import { buildUserTurn, formatTranscript, getMemory, maybeSummarize, recentMessages, relevantOldMessages } from "./context";
import {
  chooseResponders, isRepetitive, naturalDelay, parseMentions, pickFreeSpeaker, sanitizeReply, temperatureFor,
  type MentionTarget,
} from "./orchestrator";

const LOCK_SECONDS = 100;

export interface TickResult {
  status: AiRun["status"] | "busy";
  continue: boolean;
  delayMs: number;
  spoke?: string | null;
}

function isReady(ai: AiProfile | undefined): ai is AiProfile {
  return !!ai && !!ai.personality && !!ai.provider && !!ai.model && ai.hasKey && ai.enabled;
}

function mentionTargets(members: Awaited<ReturnType<typeof loadGroupAis>>["members"]): MentionTarget[] {
  return members.map((m) => ({ user_id: m.user_id, ai_name: m.ai_name, display_name: m.display_name, nickname: m.nickname, username: m.username }));
}

/** Coloca IAs na fila para responder (mensagem humana, @menção ou botão "chamar IA"). */
export async function enqueueResponders(groupId: string, responders: string[], startedBy: string) {
  const run = await getOrCreateRun(groupId);
  if (responders.length === 0) return run;
  if (run.status === "running" || run.status === "paused") {
    // em andamento: chamados explícitos entram no começo da fila; cadeia de IAs reinicia a contagem
    const queue = [...responders, ...run.queue.filter((q) => !responders.includes(q))];
    await updateRun(groupId, { queue, chain_turns: run.mode === "reply" ? 0 : run.chain_turns });
    return { ...run, queue };
  }
  const patch: Partial<AiRun> = {
    mode: "reply", status: "running", queue: responders, chain_turns: 0, turns_done: 0, topic: null,
    participants: [], max_turns: 0, ends_at: null, paused_remaining_ms: null,
    next_tick_at: new Date().toISOString(), stop_reason: null, started_by: startedBy, thinking_user_id: null,
  };
  await updateRun(groupId, patch);
  return { ...run, ...patch } as AiRun;
}

/** Decide (pelas personalidades) quais IAs reagem a uma mensagem humana. */
export async function respondToHumanMessage(groupId: string, msg: Message) {
  const { members, ais } = await loadGroupAis(groupId);
  const g = await supabaseAdmin().from("groups").select("settings").eq("id", groupId).single();
  const settings = settingsOf(g.data?.settings);
  const mentions = parseMentions(msg.content, mentionTargets(members), msg.user_id);
  const run = await getOrCreateRun(groupId);
  const ready = members.filter((m) => isReady(ais.get(m.user_id)));
  const recent = await recentMessages(groupId, 8);
  const recentAiSpeakers = recent.filter((m) => m.sender_type === "ai").reverse().map((m) => m.user_id!);

  // Durante a conversa livre, o humano só "puxa" IAs que chamou explicitamente.
  if (run.status === "running" && run.mode === "free") {
    const forced = (mentions.all ? ready.map((m) => m.user_id) : mentions.aiTargets).filter((id) => ready.some((r) => r.user_id === id));
    if (forced.length) await enqueueResponders(groupId, forced, msg.user_id!);
    return forced;
  }

  const responders = chooseResponders({
    trigger: "human",
    candidates: ready.map((m) => ({
      userId: m.user_id,
      participation: ais.get(m.user_id)!.personality!.traits.participation,
      silent: m.ai_silent,
    })),
    mentions,
    isQuestion: /\?\s*$/.test(msg.content.trim()),
    chainTurns: 0,
    maxChain: settings.max_ai_chain,
    maxResponders: settings.max_responders,
    lastSpeaker: null,
    recentAiSpeakers,
  });
  if (responders.length) await enqueueResponders(groupId, responders, msg.user_id!);
  return responders;
}

export async function stopRun(groupId: string, reason: string, by?: string) {
  const run = await getOrCreateRun(groupId);
  const wasFree = run.mode === "free" && (run.status === "running" || run.status === "paused");
  await updateRun(groupId, { status: "stopped", queue: [], thinking_user_id: null, stop_reason: reason, lock_until: null, next_tick_at: null });
  if (wasFree) await systemMessage(groupId, `⏹️ Conversa livre encerrada (${reason}).`, { by });
}

async function finishFree(groupId: string, reason: string) {
  await updateRun(groupId, { status: "idle", queue: [], thinking_user_id: null, stop_reason: reason, lock_until: null });
  await systemMessage(groupId, `🏁 Conversa livre encerrada: ${reason}.`);
}

/**
 * Processa UMA fala de IA. Chamado repetidamente pelos navegadores conectados enquanto
 * houver rodada ativa. Uma trava atômica no banco garante que só um processo fale por vez.
 */
export async function tick(groupId: string): Promise<TickResult> {
  const db = supabaseAdmin();
  const { data: locked, error: lockErr } = await db.rpc("acquire_ai_lock", { p_group: groupId, p_seconds: LOCK_SECONDS });
  if (lockErr) throw lockErr;
  if (!locked) {
    const run = await getOrCreateRun(groupId);
    const wait = run.next_tick_at ? Math.max(0, new Date(run.next_tick_at).getTime() - Date.now()) : 1500;
    return { status: run.status === "running" ? "busy" : run.status, continue: run.status === "running", delayMs: Math.max(wait, 1200) };
  }

  let run = await getOrCreateRun(groupId);
  try {
    if (run.status !== "running") return { status: run.status, continue: false, delayMs: 0 };

    const { data: group } = await db.from("groups").select("name, settings").eq("id", groupId).single();
    const settings = settingsOf(group?.settings);
    const { members, ais } = await loadGroupAis(groupId);

    // limites da conversa livre
    if (run.mode === "free") {
      if (run.turns_done >= run.max_turns) { await finishFree(groupId, `limite de ${run.max_turns} turnos atingido`); return { status: "idle", continue: false, delayMs: 0 }; }
      if (run.ends_at && new Date(run.ends_at).getTime() <= Date.now()) { await finishFree(groupId, "tempo esgotado"); return { status: "idle", continue: false, delayMs: 0 }; }
    }

    // limite global de mensagens de IA por hora no grupo (anti-spam / custo)
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: aiLastHour } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("group_id", groupId).eq("sender_type", "ai").gte("created_at", hourAgo);
    if ((aiLastHour ?? 0) >= settings.ai_msgs_per_hour) {
      await updateRun(groupId, { status: "stopped", queue: [], stop_reason: "limite de mensagens de IA por hora do grupo", thinking_user_id: null });
      await systemMessage(groupId, `⏸️ As IAs atingiram o limite de ${settings.ai_msgs_per_hour} mensagens por hora deste grupo (o admin pode mudar isso).`);
      return { status: "stopped", continue: false, delayMs: 0 };
    }

    // quem fala agora?
    const recent = await recentMessages(groupId);
    const lastMsg = recent[recent.length - 1];
    const recentAiSpeakers = recent.filter((m) => m.sender_type === "ai").reverse().map((m) => m.user_id!);
    let queue = [...run.queue];
    let speaker: string | null = null;
    let calledDirectly = false;
    if (queue.length) {
      speaker = queue.shift()!;
      calledDirectly = run.mode === "reply" && run.chain_turns === 0;
    } else if (run.mode === "free") {
      const lastMentions = lastMsg ? parseMentions(lastMsg.content, mentionTargets(members), lastMsg.user_id) : null;
      speaker = pickFreeSpeaker({
        participants: run.participants.filter((id) => isReady(ais.get(id))).map((id) => ({ userId: id, participation: ais.get(id)!.personality!.traits.participation })),
        lastSpeaker: run.last_speaker,
        recentSpeakers: recentAiSpeakers,
        provoked: lastMentions ? [...lastMentions.aiTargets, ...lastMentions.ownersReferenced] : [],
      });
      if (!speaker) { await finishFree(groupId, "nenhuma IA disponível"); return { status: "idle", continue: false, delayMs: 0 }; }
    } else {
      await updateRun(groupId, { status: "idle", thinking_user_id: null });
      return { status: "idle", continue: false, delayMs: 0 };
    }

    const ai = ais.get(speaker);
    const advance = async (extra: Partial<AiRun> = {}) => {
      const status = queue.length || run.mode === "free" ? "running" : "idle";
      await updateRun(groupId, { queue, status, thinking_user_id: null, next_tick_at: new Date().toISOString(), ...extra });
      return { status, continue: status === "running", delayMs: 300 } as TickResult;
    };
    if (!isReady(ai)) return await advance();

    // limites individuais do dono da IA
    const usage = await usageSnapshot(speaker, ai.settings);
    if (usage.blocked) {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("group_id", groupId).eq("sender_type", "system").eq("meta->>limit_user", speaker).eq("meta->>day", today);
      if (!count) await systemMessage(groupId, `⛔ ${ai.personality!.ai_name} foi pausada: ${usage.reason}. O dono pode ajustar em Configurações de IA.`, { limit_user: speaker, day: today });
      if (run.mode === "free") run = { ...run, participants: run.participants.filter((p) => p !== speaker) };
      return await advance(run.mode === "free" ? { participants: run.participants } : {});
    }

    const apiKey = await getApiKey(speaker, ai.provider!);
    if (!apiKey) return await advance();

    await updateRun(groupId, { thinking_user_id: speaker });

    // monta o contexto
    const mem = await getMemory(groupId);
    const old = await relevantOldMessages(groupId, recent);
    const p = ai.personality!;
    const otherAis = members.filter((m) => m.user_id !== speaker && m.ai_name).map((m) => ({ ai_name: m.ai_name!, ownerName: ais.get(m.user_id)!.ownerName }));
    const system = buildSystemPrompt(p, {
      ownerName: ai.ownerName,
      otherAis,
      humans: members.map((m) => ais.get(m.user_id)!.ownerName),
      groupName: group?.name ?? "grupo",
      memorySummary: mem.summary,
      freeTopic: run.mode === "free" ? run.topic : null,
    });
    const transcript = formatTranscript(recent, ais, speaker);
    const oldRelevant = old.length ? formatTranscript(old, ais, speaker) : "";
    const free = run.mode === "free" ? { topic: run.topic ?? "", turn: run.turns_done + 1, max: run.max_turns } : null;
    const otherNames = [
      ...otherAis.map((a) => a.ai_name),
      ...members.map((m) => ais.get(m.user_id)!.ownerName),
    ];
    const recentAiTexts = recent.filter((m) => m.sender_type === "ai").slice(-8).map((m) => m.content);

    let reply = { text: "", ended: false };
    let inTok = 0, outTok = 0;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await generate({
          provider: ai.provider!, model: ai.model!, apiKey, system,
          messages: [{
            role: "user",
            content: buildUserTurn({
              aiName: p.ai_name, transcript, oldRelevant, calledDirectly, free,
              extra: attempt > 0 ? "ATENÇÃO: sua resposta anterior repetiu algo já dito. Diga algo diferente." : undefined,
            }),
          }],
          maxTokens: ai.settings?.max_output_tokens ?? 400,
          temperature: temperatureFor(p.traits.creativity),
        });
        inTok += r.inputTokens; outTok += r.outputTokens;
        reply = sanitizeReply(r.text, p.ai_name, otherNames);
        if (reply.text && !isRepetitive(reply.text, recentAiTexts)) break;
        reply = { text: "", ended: reply.ended };
      }
    } catch (e) {
      const msg = e instanceof ProviderError ? e.message : "erro inesperado ao chamar o provedor";
      if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) await markKeyError(speaker, ai.provider!, msg);
      await systemMessage(groupId, `⚠️ ${p.ai_name} não conseguiu responder. ${msg}`);
      if (run.mode === "free") run = { ...run, participants: run.participants.filter((x) => x !== speaker) };
      return await advance(run.mode === "free" ? { participants: run.participants } : {});
    } finally {
      if (inTok || outTok) {
        await logUsage({ userId: speaker, groupId, provider: ai.provider!, model: ai.model!, kind: run.mode === "free" ? "free" : "chat",
          inputTokens: inTok, outputTokens: outTok, settings: ai.settings });
      }
    }

    // a rodada pode ter sido interrompida enquanto a IA "pensava"
    const fresh = await getOrCreateRun(groupId);
    if (fresh.status !== "running") {
      await updateRun(groupId, { thinking_user_id: null });
      return { status: fresh.status, continue: false, delayMs: 0 };
    }
    // fila local (sem o falante atual) + quem foi chamado enquanto a IA pensava
    const added = fresh.queue.filter((q) => !run.queue.includes(q));
    queue = [...added, ...queue].filter((q, i, arr) => arr.indexOf(q) === i);

    let spokeText: string | null = null;
    if (reply.text) {
      const mentions = parseMentions(reply.text, mentionTargets(members), speaker);
      const { error } = await db.from("messages").insert({
        group_id: groupId, sender_type: "ai", user_id: speaker,
        ai_name: p.ai_name, ai_avatar: p.avatar_emoji, ai_color: p.color,
        content: reply.text, mentions: mentions.aiTargets,
        meta: { provider: ai.provider, model: ai.model, mode: run.mode },
      });
      if (error) throw error;
      spokeText = reply.text;

      // próximos passos
      if (run.mode === "reply" && queue.length === 0) {
        const ready = members.filter((m) => isReady(ais.get(m.user_id)));
        const next = chooseResponders({
          trigger: "ai",
          candidates: ready.map((m) => ({ userId: m.user_id, participation: ais.get(m.user_id)!.personality!.traits.participation, silent: m.ai_silent })),
          mentions,
          isQuestion: /\?\s*$/.test(reply.text),
          chainTurns: run.chain_turns + 1,
          maxChain: settings.max_ai_chain,
          maxResponders: 1,
          lastSpeaker: speaker,
          recentAiSpeakers: [speaker, ...recentAiSpeakers],
        });
        queue.push(...next);
      }
    }

    // memória de longo prazo (resumo) — melhor esforço
    try { await maybeSummarize(groupId, ai, apiKey, ais); } catch (e) { console.warn("[memória] resumo falhou", e); }

    if (run.mode === "free") {
      const turns = run.turns_done + (reply.text ? 1 : 0);
      if (reply.ended && turns >= 3) {
        await updateRun(groupId, { turns_done: turns, last_speaker: speaker });
        await finishFree(groupId, "o debate chegou a uma conclusão natural");
        return { status: "idle", continue: false, delayMs: 0, spoke: spokeText };
      }
      const delay = naturalDelay("free");
      await updateRun(groupId, {
        turns_done: turns, last_speaker: speaker, queue, thinking_user_id: null,
        participants: run.participants, next_tick_at: new Date(Date.now() + delay).toISOString(),
      });
      return { status: "running", continue: true, delayMs: delay, spoke: spokeText };
    }

    const status = queue.length ? "running" : "idle";
    const delay = naturalDelay("reply");
    await updateRun(groupId, {
      queue, status, chain_turns: run.chain_turns + (reply.text ? 1 : 0), last_speaker: speaker, thinking_user_id: null,
      next_tick_at: new Date(Date.now() + delay).toISOString(),
    });
    return { status, continue: status === "running", delayMs: delay, spoke: spokeText };
  } finally {
    await db.from("ai_runs").update({ lock_until: null }).eq("group_id", groupId);
  }
}
