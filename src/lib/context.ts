import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { Message } from "./types";
import type { AiProfile } from "./groups";
import { generate } from "./providers";
import { logUsage } from "./usage";
import { normalizeName } from "./personality";

export const RECENT_WINDOW = 30;      // mensagens recentes enviadas na íntegra
const SUMMARIZE_AFTER = 40;           // mensagens fora da janela antes de resumir
const MAX_SUMMARY_CHARS = 1500;

const STOPWORDS = new Set(("de da do das dos que pra para com uma um uns umas por mais mas nao sim isso essa esse esta este voce voces " +
  "ele ela eles elas tem ter vai vou foi era ser sao como quando onde qual quem kkkk kkk aqui ali agora entao tipo mano cara").split(" "));

function hhmm(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function speakerLabel(m: Message, ais: Map<string, AiProfile>, viewerAiOwner: string | null): string {
  if (m.sender_type === "system") return "[sistema]";
  if (m.sender_type === "human") return ais.get(m.user_id ?? "")?.ownerName ?? "Alguém";
  const owner = ais.get(m.user_id ?? "")?.ownerName ?? "?";
  if (m.user_id && m.user_id === viewerAiOwner) return `${m.ai_name} (você)`;
  return `${m.ai_name} (IA do ${owner})`;
}

export function formatTranscript(msgs: Message[], ais: Map<string, AiProfile>, viewerAiOwner: string | null): string {
  const byId = new Map(msgs.map((m) => [m.id, m]));
  return msgs
    .map((m) => {
      let line = `[${hhmm(m.created_at)}] ${speakerLabel(m, ais, viewerAiOwner)}: ${m.content}`;
      if (m.reply_to_id) {
        const r = byId.get(m.reply_to_id);
        if (r) line += `  (respondendo a ${speakerLabel(r, ais, viewerAiOwner)}: "${r.content.slice(0, 80)}")`;
      }
      return line;
    })
    .join("\n");
}

export async function recentMessages(groupId: string, limit = RECENT_WINDOW): Promise<Message[]> {
  const { data } = await supabaseAdmin()
    .from("messages")
    .select("id,group_id,sender_type,user_id,ai_name,ai_avatar,ai_color,content,reply_to_id,mentions,pinned,meta,created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Message[]).reverse();
}

/** Busca mensagens ANTIGAS relevantes ao assunto atual (full-text search em português). */
export async function relevantOldMessages(groupId: string, recent: Message[], max = 5): Promise<Message[]> {
  if (recent.length === 0) return [];
  const oldest = recent[0].created_at;
  const text = recent.slice(-3).map((m) => m.content).join(" ");
  const words = Array.from(new Set(
    normalizeName(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  )).slice(0, 8);
  if (words.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .select("id,group_id,sender_type,user_id,ai_name,ai_avatar,ai_color,content,reply_to_id,mentions,pinned,meta,created_at")
    .eq("group_id", groupId)
    .lt("created_at", oldest)
    .neq("sender_type", "system")
    .textSearch("fts", words.join(" | "), { config: "portuguese" })
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) return [];
  return ((data ?? []) as Message[]).reverse();
}

export async function getMemory(groupId: string): Promise<{ summary: string; summarized_until: string | null }> {
  const { data } = await supabaseAdmin().from("group_memory").select("summary, summarized_until").eq("group_id", groupId).maybeSingle();
  return { summary: data?.summary ?? "", summarized_until: data?.summarized_until ?? null };
}

export function buildUserTurn(opts: {
  aiName: string;
  transcript: string;
  oldRelevant: string;
  calledDirectly: boolean;
  free?: { topic: string; turn: number; max: number } | null;
  extra?: string;
}): string {
  const parts: string[] = [];
  if (opts.oldRelevant) parts.push("TRECHOS ANTIGOS DO GRUPO QUE PODEM SER RELEVANTES:\n" + opts.oldRelevant, "");
  parts.push("HISTÓRICO RECENTE DO GRUPO (mais antigo primeiro):", opts.transcript || "(ainda não há mensagens)", "");
  if (opts.free) parts.push(`Conversa livre sobre "${opts.free.topic}" — turno ${opts.free.turn} de ${opts.free.max}.`);
  if (opts.calledDirectly) parts.push(`Você (${opts.aiName}) foi chamado diretamente. Responda a quem te chamou.`);
  if (opts.extra) parts.push(opts.extra);
  parts.push(`Agora escreva SOMENTE a próxima mensagem de ${opts.aiName}. Sem prefixo de nome.`);
  return parts.join("\n");
}

/**
 * Resume mensagens antigas para a memória de longo prazo do grupo
 * (assim não enviamos o histórico inteiro a cada requisição).
 * Usa a chave da IA que está falando, e registra o consumo como "summary".
 */
export async function maybeSummarize(groupId: string, ai: AiProfile, apiKey: string, ais: Map<string, AiProfile>) {
  const db = supabaseAdmin();
  const mem = await getMemory(groupId);
  const recent = await recentMessages(groupId, RECENT_WINDOW);
  if (recent.length < RECENT_WINDOW) return;
  const windowStart = recent[0].created_at;
  let q = db
    .from("messages")
    .select("id,group_id,sender_type,user_id,ai_name,ai_avatar,ai_color,content,reply_to_id,mentions,pinned,meta,created_at")
    .eq("group_id", groupId)
    .lt("created_at", windowStart)
    .order("created_at", { ascending: true })
    .limit(200);
  if (mem.summarized_until) q = q.gt("created_at", mem.summarized_until);
  const { data } = await q;
  const pending = (data ?? []) as Message[];
  if (pending.length < SUMMARIZE_AFTER) return;

  const system =
    "Você mantém a MEMÓRIA de um grupo de amigos e suas IAs. Atualize o resumo com os fatos importantes: " +
    "quem disse o quê, assuntos discutidos, opiniões de cada um, piadas internas, apelidos, preferências e promessas. " +
    `Escreva em português, em tópicos curtos, no máximo ${MAX_SUMMARY_CHARS} caracteres. Responda só com o novo resumo.`;
  const user = `RESUMO ATUAL:\n${mem.summary || "(vazio)"}\n\nNOVAS MENSAGENS:\n${formatTranscript(pending, ais, null)}`;
  const r = await generate({
    provider: ai.provider!, model: ai.model!, apiKey, system,
    messages: [{ role: "user", content: user }], maxTokens: 700, temperature: 0.3,
  });
  await logUsage({ userId: ai.userId, groupId, provider: ai.provider!, model: ai.model!, kind: "summary",
    inputTokens: r.inputTokens, outputTokens: r.outputTokens, settings: ai.settings });
  if (!r.text) return;
  await db.from("group_memory").upsert({
    group_id: groupId,
    summary: r.text.slice(0, MAX_SUMMARY_CHARS * 2),
    summarized_until: pending[pending.length - 1].created_at,
    updated_at: new Date().toISOString(),
  });
}
