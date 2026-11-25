import { route, ok, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const db = supabaseAdmin();
  const { data: p } = await db.from("personalities").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!p) throw new HttpError(404, "Personalidade não encontrada.");
  const { count } = await db.from("personalities").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 30) throw new HttpError(400, "Limite de 30 personalidades salvas.");
  const { id: _omit, created_at: _c, updated_at: _u, ...rest } = p;
  const { data, error } = await db.from("personalities")
    .insert({ ...rest, ai_name: `${p.ai_name} (cópia)`.slice(0, 30) }).select("*").single();
  if (error) throw error;
  return ok({ personality: data }, 201);
});
