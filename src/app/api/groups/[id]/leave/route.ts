import { route, ok, requireUser, requireMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureAdminOrDelete, systemMessage } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("display_name").eq("id", user.id).single();
  await db.from("group_members").delete().eq("group_id", id).eq("user_id", user.id);
  await ensureAdminOrDelete(id);
  const { data: still } = await db.from("groups").select("id").eq("id", id).maybeSingle();
  if (still) await systemMessage(id, `🚪 ${prof?.display_name ?? "Alguém"} saiu do grupo.`);
  return ok();
});
