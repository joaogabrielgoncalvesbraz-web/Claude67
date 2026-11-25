import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

/** Liga/desliga uma reação. */
export const POST = route(async (req, { params }: Ctx) => {
  const { id, msgId } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const { emoji } = z.object({ emoji: z.string().min(1).max(16) }).parse(await body(req));
  if (/[a-z0-9<>]/i.test(emoji)) throw new HttpError(400, "Reação inválida.");
  const db = supabaseAdmin();
  const { data: m } = await db.from("messages").select("id").eq("id", msgId).eq("group_id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Mensagem não encontrada.");
  const { data: existing } = await db.from("reactions").select("emoji").eq("message_id", msgId).eq("user_id", user.id).eq("emoji", emoji).maybeSingle();
  if (existing) await db.from("reactions").delete().eq("message_id", msgId).eq("user_id", user.id).eq("emoji", emoji);
  else await db.from("reactions").insert({ message_id: msgId, group_id: id, user_id: user.id, emoji });
  return ok({ active: !existing });
});
