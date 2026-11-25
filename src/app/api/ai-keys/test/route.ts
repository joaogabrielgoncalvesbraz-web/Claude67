import { z } from "zod";
import { route, ok, body, requireUser, HttpError, memoryRateLimit } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generate, listModels, ProviderError } from "@/lib/providers";
import { getApiKey, logUsage } from "@/lib/usage";

export const maxDuration = 60;

/**
 * Testa a conexão: (1) lista modelos (gratuito) e, se pedido, (2) faz uma chamada real
 * mínima ao modelo escolhido (gasta poucos tokens, registrados no histórico de uso).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  memoryRateLimit("keytest:" + user.id, 20, 10 * 60_000);
  const { provider, model } = z.object({
    provider: z.enum(["openai", "anthropic", "gemini"]),
    model: z.string().trim().max(100).optional(),
  }).parse(await body(req));
  const db = supabaseAdmin();
  const apiKey = await getApiKey(user.id, provider);
  if (!apiKey) throw new HttpError(400, "Nenhuma chave cadastrada para esse provedor.");
  const now = new Date().toISOString();
  try {
    const models = await listModels(provider, apiKey);
    let sample: string | null = null;
    if (model) {
      const { data: s } = await db.from("ai_settings").select("*").eq("user_id", user.id).maybeSingle();
      const r = await generate({
        provider, model, apiKey, system: "Você é um teste de conexão.",
        messages: [{ role: "user", content: "Responda apenas: conexão ok" }], maxTokens: 30,
      });
      await logUsage({ userId: user.id, provider, model, kind: "test", inputTokens: r.inputTokens, outputTokens: r.outputTokens, settings: s });
      sample = r.text || "(resposta vazia, mas a chamada funcionou)";
    }
    await db.from("api_keys").update({ status: "ok", last_error: null, models, last_tested_at: now }).eq("user_id", user.id).eq("provider", provider);
    return ok({ status: "ok", models, sample });
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "Falha inesperada ao testar.";
    await db.from("api_keys").update({ status: "error", last_error: msg, last_tested_at: now }).eq("user_id", user.id).eq("provider", provider);
    throw new HttpError(400, msg);
  }
});
