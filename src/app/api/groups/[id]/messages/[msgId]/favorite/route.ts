import { route, ok, requireUser, requireMember, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const { id, msgId } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const db = supabaseAdmin();
  const { data: m } = await db.from("messages").select("id").eq("id", msgId).eq("group_id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Mensagem não encontrada.");
  const { data: fav } = await db.from("favorites").select("message_id").eq("message_id", msgId).eq("user_id", user.id).maybeSingle();
  if (fav) await db.from("favorites").delete().eq("message_id", msgId).eq("user_id", user.id);
  else await db.from("favorites").insert({ message_id: msgId, user_id: user.id });
  return ok({ favorite: !fav });
});
