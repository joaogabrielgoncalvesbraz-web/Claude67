import { z } from "zod";
import { route, ok, body, requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { usageSnapshot } from "@/lib/usage";

/** Configurações de IA do usuário + status das chaves (sem nunca devolver a chave). */
export const GET = route(async () => {
  const user = await requireUser();
  const db = supabaseAdmin();
  const [{ data: settings }, { data: keys }] = await Promise.all([
    db.from("ai_settings").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("api_keys").select("provider, last4, status, last_error, models, last_tested_at").eq("user_id", user.id),
  ]);
  const usage = await usageSnapshot(user.id, settings);
  return ok({ settings, keys: keys ?? [], usage });
});

const Patch = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]).nullable().optional(),
  model: z.string().trim().min(1).max(100).regex(/^[\w.\-:/@]+$/, "nome de modelo inválido").nullable().optional(),
  enabled: z.boolean().optional(),
  max_messages_per_day: z.number().int().min(1).max(100000).optional(),
  daily_token_limit: z.number().int().min(1000).max(100000000).optional(),
  monthly_budget_usd: z.number().min(0).max(100000).nullable().optional(),
  price_input_per_m: z.number().min(0).max(10000).nullable().optional(),
  price_output_per_m: z.number().min(0).max(10000).nullable().optional(),
  max_output_tokens: z.number().int().min(50).max(8000).optional(),
  warn_percent: z.number().int().min(10).max(100).optional(),
  disable_on_limit: z.boolean().optional(),
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = Patch.parse(await body(req));
  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  if (input.provider !== undefined && input.model === undefined) patch.model = null; // trocou provedor: escolha o modelo de novo
  const { data, error } = await supabaseAdmin().from("ai_settings").upsert({ user_id: user.id, ...patch }).select("*").single();
  if (error) throw error;
  return ok({ settings: data });
});
