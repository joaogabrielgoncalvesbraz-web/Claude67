import { z } from "zod";
import { route, ok, body, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DraftSchema } from "../schema";
import { buildSystemPrompt } from "@/lib/personality";
import { generate, ProviderError } from "@/lib/providers";
import { getApiKey, logUsage, usageSnapshot } from "@/lib/usage";
import { sanitizeReply, temperatureFor } from "@/lib/orchestrator";
import type { Provider } from "@/lib/types";

export const maxDuration = 60;

const Input = z.object({
  personality: DraftSchema,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(30),
});

/** TESTAR PERSONALIDADE: conversa real com a IA usando o rascunho (sem salvar). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { personality, messages } = Input.parse(await body(req));
  const db = supabaseAdmin();
  const [{ data: s }, { data: prof }] = await Promise.all([
    db.from("ai_settings").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);
  if (!s?.provider || !s?.model) throw new HttpError(400, "Configure provedor, chave e modelo em Configurações de IA antes de testar.");
  const provider = s.provider as Provider;
  const apiKey = await getApiKey(user.id, provider);
  if (!apiKey) throw new HttpError(400, "Você ainda não cadastrou a chave de API desse provedor.");
  const usage = await usageSnapshot(user.id, s);
  if (usage.blocked) throw new HttpError(429, `Sua IA está pausada: ${usage.reason}.`);

  const owner = prof?.display_name ?? "Dono";
  const system = buildSystemPrompt(personality, {
    ownerName: owner, otherAis: [], humans: [owner], groupName: "Teste de personalidade", isTest: true,
  });
  try {
    const r = await generate({
      provider, model: s.model, apiKey, system,
      messages: messages.map((m) => ({ role: m.role, content: m.role === "user" ? `${owner}: ${m.content}` : m.content })),
      maxTokens: s.max_output_tokens ?? 400,
      temperature: temperatureFor(personality.traits.creativity),
    });
    await logUsage({ userId: user.id, provider, model: s.model, kind: "test", inputTokens: r.inputTokens, outputTokens: r.outputTokens, settings: s });
    const clean = sanitizeReply(r.text, personality.ai_name, [owner]);
    return ok({ reply: clean.text || "(a IA respondeu vazio)", usage: { input: r.inputTokens, output: r.outputTokens }, provider, model: s.model });
  } catch (e) {
    if (e instanceof ProviderError) throw new HttpError(502, e.message);
    throw e;
  }
});
