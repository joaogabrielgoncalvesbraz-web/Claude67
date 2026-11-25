import type { Provider } from "../types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateInput {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class ProviderError extends Error {
  constructor(public status: number, message: string, public raw?: string) {
    super(message);
  }
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
};

export const PROVIDER_KEY_URL: Record<Provider, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/app/apikey",
};

const TIMEOUT_MS = 45_000;

/** Modelos de raciocínio da OpenAI gastam tokens "pensando": precisam de teto maior. */
function isOpenAiReasoning(model: string) {
  return /^(o\d|gpt-5)/i.test(model);
}

function friendly(provider: Provider, status: number, body: string): string {
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message || j?.message || j?.error?.status || body;
  } catch { /* texto puro */ }
  msg = String(msg).slice(0, 300);
  const name = PROVIDER_LABEL[provider];
  if (status === 401 || status === 403) return `${name}: chave de API inválida ou sem permissão. (${msg})`;
  if (status === 429) return `${name}: limite de uso/cota atingido ou sem créditos na conta da API. (${msg})`;
  if (status === 404) return `${name}: modelo não encontrado ou indisponível para esta chave. (${msg})`;
  if (status === 400 && /api key/i.test(msg)) return `${name}: chave de API inválida. (${msg})`;
  if (status >= 500) return `${name}: o provedor está instável agora (erro ${status}). Tente de novo.`;
  return `${name}: erro ${status}. ${msg}`;
}

async function post(provider: Provider, url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ProviderError(0, `${PROVIDER_LABEL[provider]}: não foi possível conectar (${(e as Error).message}).`);
  }
  const text = await res.text();
  if (!res.ok) throw new ProviderError(res.status, friendly(provider, res.status, text), text);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(502, `${PROVIDER_LABEL[provider]}: resposta inválida do provedor.`);
  }
}

/** Remove um parâmetro opcional se o provedor reclamar dele (ex.: temperature em modelos novos). */
function rejectedParam(err: unknown, candidates: string[]): string | null {
  if (!(err instanceof ProviderError) || err.status !== 400 || !err.raw) return null;
  const raw = err.raw.toLowerCase();
  return candidates.find((c) => raw.includes(c)) ?? null;
}

async function withParamFallback<T>(
  params: Record<string, unknown>,
  optional: string[],
  run: (p: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const p = { ...params };
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(p);
    } catch (e) {
      const bad = attempt < 3 ? rejectedParam(e, optional.filter((k) => k in p)) : null;
      if (!bad) throw e;
      delete p[bad];
    }
  }
}

// --------------------------------------------------------------- OpenAI
async function openai(i: GenerateInput): Promise<GenerateResult> {
  const reasoning = isOpenAiReasoning(i.model);
  const base: Record<string, unknown> = {
    model: i.model,
    messages: [{ role: "system", content: i.system }, ...i.messages],
    max_completion_tokens: reasoning ? Math.max(i.maxTokens * 4, 2000) : i.maxTokens,
  };
  if (i.temperature !== undefined && !reasoning) base.temperature = i.temperature;
  if (reasoning) base.reasoning_effort = "low";
  const j = await withParamFallback(base, ["temperature", "reasoning_effort"], (p) =>
    post("openai", "https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${i.apiKey}` }, p),
  );
  return {
    text: String(j?.choices?.[0]?.message?.content ?? "").trim(),
    inputTokens: j?.usage?.prompt_tokens ?? 0,
    outputTokens: j?.usage?.completion_tokens ?? 0,
  };
}

// ------------------------------------------------------------ Anthropic
function mergeAlternating(msgs: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else out.push({ ...m });
  }
  if (out[0]?.role !== "user") out.unshift({ role: "user", content: "(início da conversa)" });
  return out;
}

async function anthropic(i: GenerateInput): Promise<GenerateResult> {
  const base: Record<string, unknown> = {
    model: i.model,
    system: i.system,
    messages: mergeAlternating(i.messages),
    max_tokens: i.maxTokens,
  };
  if (i.temperature !== undefined) base.temperature = Math.min(1, i.temperature);
  const j = await withParamFallback(base, ["temperature"], (p) =>
    post("anthropic", "https://api.anthropic.com/v1/messages", { "x-api-key": i.apiKey, "anthropic-version": "2023-06-01" }, p),
  );
  const text = (j?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  return { text, inputTokens: j?.usage?.input_tokens ?? 0, outputTokens: j?.usage?.output_tokens ?? 0 };
}

// --------------------------------------------------------------- Gemini
async function gemini(i: GenerateInput): Promise<GenerateResult> {
  const contents = mergeAlternating(i.messages).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const generationConfig: Record<string, unknown> = {
    // modelos Gemini recentes "pensam" antes de responder e esses tokens contam no limite
    maxOutputTokens: Math.max(i.maxTokens * 4, 1024),
  };
  if (i.temperature !== undefined) generationConfig.temperature = i.temperature;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(i.model)}:generateContent`;
  const j = await post("gemini", url, { "x-goog-api-key": i.apiKey }, {
    systemInstruction: { parts: [{ text: i.system }] },
    contents,
    generationConfig,
  });
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text)
    .join("")
    .trim();
  if (!text && (cand?.finishReason === "SAFETY" || j?.promptFeedback?.blockReason)) {
    throw new ProviderError(400, "Google Gemini: a resposta foi bloqueada pelos filtros de segurança do provedor.");
  }
  const u = j?.usageMetadata ?? {};
  return {
    text,
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  };
}

export async function generate(i: GenerateInput): Promise<GenerateResult> {
  if (!i.model) throw new ProviderError(400, "Nenhum modelo escolhido. Vá em Configurações de IA.");
  switch (i.provider) {
    case "openai": return openai(i);
    case "anthropic": return anthropic(i);
    case "gemini": return gemini(i);
  }
}

/** Lista modelos disponíveis para a chave. Valida a chave SEM gastar tokens. */
export async function listModels(provider: Provider, apiKey: string): Promise<string[]> {
  let url: string;
  let headers: Record<string, string>;
  if (provider === "openai") {
    url = "https://api.openai.com/v1/models";
    headers = { authorization: `Bearer ${apiKey}` };
  } else if (provider === "anthropic") {
    url = "https://api.anthropic.com/v1/models?limit=100";
    headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  } else {
    url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";
    headers = { "x-goog-api-key": apiKey };
  }
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new ProviderError(0, `${PROVIDER_LABEL[provider]}: não foi possível conectar (${(e as Error).message}).`);
  }
  const body = await res.text();
  if (!res.ok) throw new ProviderError(res.status, friendly(provider, res.status, body), body);
  const j = JSON.parse(body);
  return filterChatModels(provider, j);
}

export function filterChatModels(provider: Provider, j: any): string[] {
  let ids: string[] = [];
  if (provider === "openai") {
    ids = (j?.data ?? []).map((m: { id: string }) => m.id)
      .filter((id: string) => /^(gpt-|o\d|chatgpt-)/.test(id))
      .filter((id: string) => !/(audio|realtime|transcribe|tts|image|embedding|search|instruct|codex|moderation)/.test(id));
  } else if (provider === "anthropic") {
    ids = (j?.data ?? []).map((m: { id: string }) => m.id);
  } else {
    ids = (j?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((id: string) => id.startsWith("gemini") && !/(embedding|image|tts|audio|live)/.test(id));
  }
  return Array.from(new Set(ids)).sort();
}

/** Estimativa de custo com os preços que o PRÓPRIO usuário informou (USD por 1M tokens). */
export function estimateCost(input: number, output: number, priceIn: number | null, priceOut: number | null): number | null {
  if (priceIn == null || priceOut == null) return null;
  return (input * priceIn + output * priceOut) / 1_000_000;
}

/** Estimativa grosseira de tokens (~4 caracteres por token) para mostrar antes de enviar. */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
