import { route, ok, body, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DraftSchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

/** Cada usuário só edita/exclui as PRÓPRIAS personalidades. */
async function own(id: string, userId: string) {
  const { data } = await supabaseAdmin().from("personalities").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Personalidade não encontrada.");
  return data;
}

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await own(id, user.id);
  const draft = DraftSchema.parse(await body(req));
  const { data, error } = await supabaseAdmin().from("personalities")
    .update({ ...draft, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  return ok({ personality: data });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await own(id, user.id);
  const db = supabaseAdmin();
  const { data: all } = await db.from("personalities").select("id").eq("user_id", user.id).order("created_at");
  if ((all ?? []).length <= 1) throw new HttpError(400, "Você precisa ter pelo menos uma personalidade.");
  const { data: s } = await db.from("ai_settings").select("active_personality_id").eq("user_id", user.id).maybeSingle();
  if (s?.active_personality_id === id) {
    const next = (all ?? []).find((p: any) => p.id !== id)!;
    await db.from("ai_settings").update({ active_personality_id: next.id }).eq("user_id", user.id);
  }
  await db.from("personalities").delete().eq("id", id).eq("user_id", user.id);
  return ok();
});
