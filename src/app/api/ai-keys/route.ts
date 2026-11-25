import { z } from "zod";
import { route, ok, body, requireUser, HttpError, memoryRateLimit } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, last4 } from "@/lib/crypto";
import { listModels, ProviderError } from "@/lib/providers";

const Save = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  key: z.string().trim().min(10).max(300).regex(/^[\w\-.:]+$/, "a chave contém caracteres inválidos"),
});

/** Salva (ou substitui) a chave: testa no provedor, criptografa e guarda. A chave nunca volta para o navegador. */
export const POST = route(async (req) => {
  const user = await requireUser();
  memoryRateLimit("keys:" + user.id, 20, 10 * 60_000);
  const { provider, key } = Save.parse(await body(req));
  let models: string[] = [];
  let status: "ok" | "error" = "ok";
  let lastError: string | null = null;
  try {
    models = await listModels(provider, key);
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403 || (e.status === 400 && /chave/i.test(e.message)))) {
      throw new HttpError(400, e.message); // chave inválida: nem salva
    }
    status = "error";
    lastError = e instanceof Error ? e.message : "falha ao testar";
  }
  const enc = encryptSecret(key);
  const db = supabaseAdmin();
  const { error } = await db.from("api_keys").upsert({
    user_id: user.id, provider, ...enc, last4: last4(key), status, last_error: lastError, models, last_tested_at: new Date().toISOString(),
  });
  if (error) throw error;
  // se ainda não há provedor escolhido, usa este
  const { data: s } = await db.from("ai_settings").select("provider").eq("user_id", user.id).maybeSingle();
  if (!s?.provider) await db.from("ai_settings").upsert({ user_id: user.id, provider, model: null });
  return ok({ provider, last4: last4(key), status, last_error: lastError, models });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const provider = z.enum(["openai", "anthropic", "gemini"]).parse(new URL(req.url).searchParams.get("provider"));
  await supabaseAdmin().from("api_keys").delete().eq("user_id", user.id).eq("provider", provider);
  return ok();
});
