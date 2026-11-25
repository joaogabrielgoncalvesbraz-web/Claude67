import { route, ok, body, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DraftSchema } from "./schema";

export const GET = route(async () => {
  const user = await requireUser();
  const db = supabaseAdmin();
  const [{ data: list }, { data: settings }] = await Promise.all([
    db.from("personalities").select("*").eq("user_id", user.id).order("created_at"),
    db.from("ai_settings").select("active_personality_id").eq("user_id", user.id).maybeSingle(),
  ]);
  return ok({ personalities: list ?? [], activeId: settings?.active_personality_id ?? null });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const draft = DraftSchema.parse(await body(req));
  const db = supabaseAdmin();
  const { count } = await db.from("personalities").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 30) throw new HttpError(400, "Limite de 30 personalidades salvas.");
  const { data, error } = await db.from("personalities").insert({ ...draft, user_id: user.id }).select("*").single();
  if (error) throw error;
  return ok({ personality: data }, 201);
});
