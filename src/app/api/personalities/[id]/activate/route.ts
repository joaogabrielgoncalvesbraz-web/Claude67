import { route, ok, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Define qual personalidade salva a sua IA usa nos grupos. */
export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const db = supabaseAdmin();
  const { data: p } = await db.from("personalities").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!p) throw new HttpError(404, "Personalidade não encontrada.");
  const { error } = await db.from("ai_settings").upsert({ user_id: user.id, active_personality_id: id, updated_at: new Date().toISOString() });
  if (error) throw error;
  return ok();
});
