import { z } from "zod";
import { route, ok, body, requireUser, requireAdmin } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { systemMessage, updateRun } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

/** Ações administrativas: limpar histórico, reiniciar memória, reiniciar conversa. */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireAdmin(id, user.id);
  const { action } = z.object({ action: z.enum(["clear_history", "reset_memory", "restart"]) }).parse(await body(req));
  const db = supabaseAdmin();
  const resetMemory = () => db.from("group_memory").upsert({ group_id: id, summary: "", summarized_until: null, updated_at: new Date().toISOString() });
  const resetRun = () => updateRun(id, { status: "idle", mode: "reply", queue: [], participants: [], topic: null, thinking_user_id: null, chain_turns: 0, turns_done: 0, lock_until: null, stop_reason: "reiniciado" });

  if (action === "clear_history") {
    await db.from("messages").delete().eq("group_id", id);
    await resetMemory();
    await systemMessage(id, "🧹 O histórico foi limpo pelo administrador.");
  } else if (action === "reset_memory") {
    await resetMemory();
    await systemMessage(id, "🧠 A memória das IAs foi reiniciada (o histórico visível continua).");
  } else {
    await resetRun();
    await db.from("messages").delete().eq("group_id", id);
    await resetMemory();
    await systemMessage(id, "🔄 Conversa reiniciada do zero.");
  }
  return ok();
});
