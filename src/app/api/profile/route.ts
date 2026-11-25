import { z } from "zod";
import { route, ok, body, requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const GET = route(async () => {
  const user = await requireUser();
  const { data } = await supabaseAdmin().from("profiles").select("*").eq("id", user.id).single();
  return ok({ profile: data });
});

const Patch = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  avatar_emoji: z.string().min(1).max(16).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  theme: z.enum(["roxo", "azul", "verde", "laranja", "rosa"]).optional(),
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = Patch.parse(await body(req));
  const { data, error } = await supabaseAdmin().from("profiles").update(input).eq("id", user.id).select("*").single();
  if (error) throw error;
  return ok({ profile: data });
});
