import { z } from "zod";
import { route, ok, body, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { newInviteCode } from "@/lib/groups";

export const GET = route(async () => {
  const user = await requireUser();
  const { data, error } = await supabaseAdmin()
    .from("group_members")
    .select("role, groups!inner(id, name, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return ok({ groups: (data ?? []).map((r: any) => ({ ...r.groups, role: r.role })) });
});

const Create = z.object({ name: z.string().trim().min(1).max(60) });

export const POST = route(async (req) => {
  const user = await requireUser();
  const { name } = Create.parse(await body(req));
  const db = supabaseAdmin();
  const { count } = await db.from("group_members").select("group_id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 30) throw new HttpError(400, "Você atingiu o limite de 30 grupos.");
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from("groups").insert({ name, owner_id: user.id, invite_code: newInviteCode() }).select("*").single();
    if (error?.code === "23505") continue; // código repetido, tenta outro
    if (error) throw error;
    await db.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "admin" });
    await db.from("ai_runs").insert({ group_id: data.id });
    await db.from("group_memory").insert({ group_id: data.id });
    await db.from("messages").insert({ group_id: data.id, sender_type: "system", content: `🎉 Grupo "${name}" criado! Código de convite: ${data.invite_code}` });
    return ok({ group: data }, 201);
  }
  throw new HttpError(500, "Não foi possível gerar um código de convite.");
});
