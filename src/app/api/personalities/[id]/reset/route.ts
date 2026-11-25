import { route, ok, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { defaultDraftFor } from "@/lib/personality";

type Ctx = { params: Promise<{ id: string }> };

/** Restaura a personalidade para o padrão do modelo (preset) de onde ela veio. */
export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const db = supabaseAdmin();
  const { data: p } = await db.from("personalities").select("preset").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!p) throw new HttpError(404, "Personalidade não encontrada.");
  const draft = defaultDraftFor(p.preset) ?? defaultDraftFor("personalizado")!;
  const { data, error } = await db.from("personalities")
    .update({ ...draft, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  return ok({ personality: data });
});
