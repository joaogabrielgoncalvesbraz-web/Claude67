import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; msgId: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id, msgId } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const { pinned } = z.object({ pinned: z.boolean() }).parse(await body(req));
  const db = supabaseAdmin();
  if (pinned) {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("group_id", id).eq("pinned", true);
    if ((count ?? 0) >= 20) throw new HttpError(400, "Máximo de 20 mensagens fixadas.");
  }
  const { error } = await db.from("messages").update({ pinned }).eq("id", msgId).eq("group_id", id);
  if (error) throw error;
  return ok();
});

/** Apaga uma mensagem: o autor humano apaga a sua; o dono apaga as da sua IA; o admin apaga qualquer uma. */
export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id, msgId } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const db = supabaseAdmin();
  const { data: m } = await db.from("messages").select("user_id, sender_type").eq("id", msgId).eq("group_id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Mensagem não encontrada.");
  if (me.role !== "admin" && m.user_id !== user.id) throw new HttpError(403, "Você só pode apagar suas mensagens ou as da sua IA.");
  await db.from("messages").delete().eq("id", msgId);
  return ok();
});
