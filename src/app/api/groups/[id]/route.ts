import { z } from "zod";
import { route, ok, body, requireUser, requireMember, requireAdmin } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateRun, loadGroupAis, newInviteCode, settingsOf } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

/** Dados do grupo + membros + info PÚBLICA das IAs (nunca chaves ou instruções privadas). */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  const db = supabaseAdmin();
  const { data: group, error } = await db.from("groups").select("id,name,invite_code,owner_id,settings,created_at").eq("id", id).single();
  if (error) throw error;
  const { members } = await loadGroupAis(id);
  const run = await getOrCreateRun(id);
  return ok({ group: { ...group, settings: settingsOf(group.settings) }, members, run, me });
});

const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  regenerateCode: z.boolean().optional(),
  settings: z.object({
    max_ai_chain: z.number().int().min(0).max(10),
    max_responders: z.number().int().min(1).max(12),
    human_msgs_per_minute: z.number().int().min(1).max(120),
    ai_msgs_per_hour: z.number().int().min(1).max(2000),
    free_default_turns: z.number().int().min(2).max(200),
    free_default_minutes: z.number().int().min(1).max(120),
    max_free_turns: z.number().int().min(2).max(200),
  }).partial().optional(),
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireAdmin(id, user.id);
  const input = Patch.parse(await body(req));
  const db = supabaseAdmin();
  const { data: g } = await db.from("groups").select("settings").eq("id", id).single();
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.settings) patch.settings = { ...settingsOf(g?.settings), ...input.settings };
  if (input.regenerateCode) patch.invite_code = newInviteCode();
  const { data, error } = await db.from("groups").update(patch).eq("id", id).select("id,name,invite_code,settings").single();
  if (error) throw error;
  return ok({ group: data });
});
