import { z } from "zod";
import { route, ok, body, requireUser, HttpError, memoryRateLimit } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Join = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/, "código inválido") });

export const POST = route(async (req) => {
  const user = await requireUser();
  memoryRateLimit("join:" + user.id, 15, 10 * 60_000); // dificulta adivinhar códigos
  const { code } = Join.parse(await body(req));
  const db = supabaseAdmin();
  const { data: group } = await db.from("groups").select("id, name").eq("invite_code", code).maybeSingle();
  if (!group) throw new HttpError(404, "Nenhum grupo encontrado com esse código.");
  const { data: already } = await db.from("group_members").select("user_id").eq("group_id", group.id).eq("user_id", user.id).maybeSingle();
  if (already) return ok({ group, already: true });
  const { count } = await db.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", group.id);
  if ((count ?? 0) >= 12) throw new HttpError(400, "Este grupo está cheio (máximo de 12 participantes).");
  const { error } = await db.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "member" });
  if (error) throw error;
  const { data: prof } = await db.from("profiles").select("display_name").eq("id", user.id).single();
  await db.from("messages").insert({ group_id: group.id, sender_type: "system", content: `👋 ${prof?.display_name ?? "Alguém"} entrou no grupo.` });
  return ok({ group });
});
