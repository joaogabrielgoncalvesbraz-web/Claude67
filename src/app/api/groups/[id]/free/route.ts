import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError, cleanText } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateRun, loadGroupAis, settingsOf, systemMessage, updateRun } from "@/lib/groups";
import { stopRun } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    topic: z.string().min(2).max(300),
    participants: z.array(z.string().uuid()).min(2).max(12),
    maxTurns: z.number().int().min(2).max(200),
    minutes: z.number().int().min(1).max(120),
  }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("stop") }),
]);

export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const input = Input.parse(await body(req));
  const run = await getOrCreateRun(id);
  const { data: prof } = await supabaseAdmin().from("profiles").select("display_name").eq("id", user.id).single();
  const who = prof?.display_name ?? "Alguém";

  if (input.action === "start") {
    if (run.status === "running" && run.mode === "free") throw new HttpError(409, "Já existe uma conversa livre em andamento.");
    const { data: g } = await supabaseAdmin().from("groups").select("settings").eq("id", id).single();
    const settings = settingsOf(g?.settings);
    const { members } = await loadGroupAis(id);
    const ready = members.filter((m) => m.ai_ready && input.participants.includes(m.user_id));
    if (ready.length < 2) {
      const problems = members.filter((m) => input.participants.includes(m.user_id) && !m.ai_ready)
        .map((m) => `${m.ai_name ?? m.display_name}: ${m.ai_ready_reason}`).join("; ");
      throw new HttpError(400, `São necessárias pelo menos 2 IAs prontas. ${problems}`);
    }
    const topic = cleanText(input.topic);
    const maxTurns = Math.min(input.maxTurns, settings.max_free_turns);
    await updateRun(id, {
      mode: "free", status: "running", topic, participants: ready.map((m) => m.user_id), queue: [],
      max_turns: maxTurns, turns_done: 0, chain_turns: 0,
      ends_at: new Date(Date.now() + input.minutes * 60_000).toISOString(), paused_remaining_ms: null,
      next_tick_at: new Date().toISOString(), last_speaker: null, stop_reason: null, started_by: user.id, thinking_user_id: null,
    });
    await systemMessage(id, `🎙️ ${who} iniciou uma CONVERSA LIVRE.\nAssunto: ${topic}\nIAs: ${ready.map((m) => m.ai_name).join(", ")} · até ${maxTurns} turnos · ${input.minutes} min`);
    return ok({ started: true });
  }

  if (run.mode !== "free" && input.action !== "stop") throw new HttpError(400, "Não há conversa livre ativa.");

  if (input.action === "pause") {
    if (run.status !== "running") throw new HttpError(400, "A conversa não está rodando.");
    const remaining = run.ends_at ? Math.max(0, new Date(run.ends_at).getTime() - Date.now()) : null;
    await updateRun(id, { status: "paused", paused_remaining_ms: remaining, thinking_user_id: null });
    await systemMessage(id, `⏸️ ${who} pausou a conversa livre.`);
  } else if (input.action === "resume") {
    if (run.status !== "paused") throw new HttpError(400, "A conversa não está pausada.");
    await updateRun(id, {
      status: "running", next_tick_at: new Date().toISOString(),
      ends_at: run.paused_remaining_ms != null ? new Date(Date.now() + Number(run.paused_remaining_ms)).toISOString() : run.ends_at,
      paused_remaining_ms: null,
    });
    await systemMessage(id, `▶️ ${who} retomou a conversa livre.`);
  } else {
    await stopRun(id, `interrompida por ${who}`, user.id);
  }
  return ok();
});
