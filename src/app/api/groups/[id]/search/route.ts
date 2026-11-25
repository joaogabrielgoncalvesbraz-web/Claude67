import { route, ok, requireUser, requireMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Pesquisa no histórico (texto parcial, sem diferenciar maiúsculas). */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return ok({ results: [] });
  const pattern = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const { data, error } = await supabaseAdmin().from("messages")
    .select("id,sender_type,user_id,ai_name,ai_avatar,ai_color,content,created_at")
    .eq("group_id", id).ilike("content", pattern)
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return ok({ results: data });
});
