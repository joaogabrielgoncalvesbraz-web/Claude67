import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureAdminOrDelete, systemMessage } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string; userId: string }> };

const Patch = z.object({
  ai_enabled: z.boolean().optional(),   // admin
  role: z.enum(["admin", "member"]).optional(), // admin
  ai_silent: z.boolean().optional(),    // o próprio dono
  nickname: z.string().trim().max(30).nullable().optional(), // o próprio ou admin
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const { id, userId } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  await requireMember(id, userId);
  const input = Patch.parse(await body(req));
  const isSelf = user.id === userId;
  const isAdmin = me.role === "admin";
  const patch: Record<string, unknown> = {};
  if (input.ai_enabled !== undefined) { if (!isAdmin) throw new HttpError(403, "Só o admin ativa/desativa IAs."); patch.ai_enabled = input.ai_enabled; }
  if (input.role !== undefined) { if (!isAdmin) throw new HttpError(403, "Só o admin muda cargos."); patch.role = input.role; }
  if (input.ai_silent !== undefined) { if (!isSelf && !isAdmin) throw new HttpError(403, "Você só controla a sua IA."); patch.ai_silent = input.ai_silent; }
  if (input.nickname !== undefined) { if (!isSelf && !isAdmin) throw new HttpError(403, "Sem permissão."); patch.nickname = input.nickname || null; }
  const { error } = await supabaseAdmin().from("group_members").update(patch).eq("group_id", id).eq("user_id", userId);
  if (error) throw error;
  if (input.role === "member") await ensureAdminOrDelete(id);
  return ok();
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { id, userId } = await params;
  const user = await requireUser();
  const me = await requireMember(id, user.id);
  if (me.role !== "admin") throw new HttpError(403, "Só o admin remove participantes.");
  if (userId === user.id) throw new HttpError(400, "Para sair, use 'Sair do grupo'.");
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("display_name").eq("id", userId).single();
  await db.from("group_members").delete().eq("group_id", id).eq("user_id", userId);
  await systemMessage(id, `❌ ${prof?.display_name ?? "Participante"} foi removido do grupo.`);
  return ok();
});
