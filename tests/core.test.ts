import { describe, it, expect, vi, afterEach } from "vitest";
import { chooseResponders, isPingPong, isRepetitive, parseMentions, pickFreeSpeaker, sanitizeReply, temperatureFor } from "@/lib/orchestrator";
import { buildSystemPrompt, FRIEND_TEMPLATES, initialPersonalityFor, PRESETS, clampTraits, defaultDraftFor } from "@/lib/personality";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { generate, filterChatModels, estimateCost } from "@/lib/providers";

const members = [
  { user_id: "jg", ai_name: "IA do JG", display_name: "JG", nickname: null, username: "jg" },
  { user_id: "be", ai_name: "IA do Bernardo", display_name: "Bernardo", nickname: null, username: "bernardo" },
  { user_id: "en", ai_name: "IA do Enzo", display_name: "Enzo", nickname: null, username: "enzo" },
];

describe("menções", () => {
  it("@IA específica", () => {
    const r = parseMentions("e aí @IA do Bernardo, fala aí", members, "jg");
    expect(r.aiTargets).toEqual(["be"]);
    expect(r.all).toBe(false);
  });
  it("@todas chama todo mundo", () => expect(parseMentions("@todas opinem", members, "jg").all).toBe(true));
  it("citar o nome do amigo sem @ = provocação", () => {
    const r = parseMentions("Bernardo, você é rico demais KKKKK", members, "jg");
    expect(r.ownersReferenced).toContain("be");
    expect(r.aiTargets).toEqual([]);
  });
  it("não conta o próprio autor como provocado", () => {
    expect(parseMentions("eu, JG, falei", members, "jg").ownersReferenced).not.toContain("jg");
  });
});

const cands = [
  { userId: "jg", participation: 85, silent: false },
  { userId: "be", participation: 70, silent: false },
  { userId: "en", participation: 65, silent: true },
];
const noMentions = { all: false, aiTargets: [], ownersReferenced: [] };

describe("quem responde", () => {
  it("chamada explícita responde mesmo em modo silencioso", () => {
    const r = chooseResponders({ trigger: "human", candidates: cands, mentions: { ...noMentions, aiTargets: ["en"] }, isQuestion: false, chainTurns: 0, maxChain: 3, maxResponders: 2, lastSpeaker: null, recentAiSpeakers: [], rand: () => 0.99 });
    expect(r).toEqual(["en"]);
  });
  it("respeita o máximo de IAs por mensagem e ignora silenciosas", () => {
    const r = chooseResponders({ trigger: "human", candidates: cands, mentions: noMentions, isQuestion: true, chainTurns: 0, maxChain: 3, maxResponders: 2, lastSpeaker: null, recentAiSpeakers: [], rand: () => 0 });
    expect(r.length).toBe(2);
    expect(r).not.toContain("en");
  });
  it("nem toda mensagem recebe resposta", () => {
    const r = chooseResponders({ trigger: "human", candidates: cands, mentions: noMentions, isQuestion: false, chainTurns: 0, maxChain: 3, maxResponders: 2, lastSpeaker: null, recentAiSpeakers: [], rand: () => 0.999 });
    expect(r).toEqual([]);
  });
  it("cadeia de IAs para no limite de turnos", () => {
    const r = chooseResponders({ trigger: "ai", candidates: cands, mentions: { ...noMentions, aiTargets: ["be"] }, isQuestion: true, chainTurns: 3, maxChain: 3, maxResponders: 1, lastSpeaker: "jg", recentAiSpeakers: [], rand: () => 0 });
    expect(r).toEqual([]);
  });
  it("IA não responde a si mesma", () => {
    for (let i = 0; i < 50; i++) {
      const r = chooseResponders({ trigger: "ai", candidates: cands, mentions: noMentions, isQuestion: false, chainTurns: 0, maxChain: 3, maxResponders: 1, lastSpeaker: "jg", recentAiSpeakers: ["jg"] });
      expect(r).not.toContain("jg");
    }
  });
  it("detecta ping-pong e bloqueia o par", () => {
    expect(isPingPong(["a", "b", "a", "b"])).toEqual(["a", "b"]);
    const r = chooseResponders({ trigger: "ai", candidates: cands.slice(0, 2), mentions: { ...noMentions, aiTargets: ["be"] }, isQuestion: true, chainTurns: 1, maxChain: 9, maxResponders: 1, lastSpeaker: "jg", recentAiSpeakers: ["jg", "be", "jg", "be"], rand: () => 0 });
    expect(r).toEqual([]);
  });
  it("probabilidade de continuar cai a cada turno", () => {
    let early = 0, late = 0;
    for (let i = 0; i < 2000; i++) {
      if (chooseResponders({ trigger: "ai", candidates: cands, mentions: noMentions, isQuestion: false, chainTurns: 0, maxChain: 9, maxResponders: 1, lastSpeaker: "jg", recentAiSpeakers: [] }).length) early++;
      if (chooseResponders({ trigger: "ai", candidates: cands, mentions: noMentions, isQuestion: false, chainTurns: 3, maxChain: 9, maxResponders: 1, lastSpeaker: "jg", recentAiSpeakers: [] }).length) late++;
    }
    expect(late).toBeLessThan(early / 2);
  });
});

describe("conversa livre", () => {
  it("nunca repete o último falante", () => {
    for (let i = 0; i < 200; i++) {
      const s = pickFreeSpeaker({ participants: [{ userId: "a", participation: 50 }, { userId: "b", participation: 50 }, { userId: "c", participation: 50 }], lastSpeaker: "a", recentSpeakers: ["a"], provoked: [] });
      expect(s).not.toBe("a");
    }
  });
});

describe("limpeza da resposta", () => {
  it("remove prefixo com o próprio nome e [FIM]", () => {
    expect(sanitizeReply("IA do JG: Flamengo, obviamente. [FIM]", "IA do JG", [])).toEqual({ text: "Flamengo, obviamente.", ended: true });
  });
  it("corta quando o modelo tenta falar por outra IA", () => {
    const r = sanitizeReply("Inveja é complicado.\nIA do Enzo: concordo", "IA do Bernardo", ["IA do Enzo", "Enzo"]);
    expect(r.text).toBe("Inveja é complicado.");
  });
  it("detecta repetição", () => {
    expect(isRepetitive("Esse homem não tem dinheiro, tem patrimônio histórico", ["esse homem não tem dinheiro, tem patrimônio histórico!"])).toBe(true);
    expect(isRepetitive("Flamengo é o maior", ["Palmeiras não tem mundial"])).toBe(false);
  });
  it("criatividade vira temperatura", () => {
    expect(temperatureFor(0)).toBe(0.3);
    expect(temperatureFor(100)).toBe(1.2);
  });
});

describe("personalidades", () => {
  it("10 predefinidas", () => expect(PRESETS.length).toBe(10));
  it("JG, Bernardo e Enzo ganham suas IAs iniciais", () => {
    expect(initialPersonalityFor("jg", "JG").ai_name).toBe("IA do JG");
    expect(initialPersonalityFor("bernardo", "Bernardo").ai_name).toBe("IA do Bernardo");
    expect(initialPersonalityFor("enzo_x", "Enzo").ai_name).toBe("IA do Enzo");
    expect(initialPersonalityFor("maria", "Maria").ai_name).toBe("IA do Maria");
  });
  it("restaurar padrão funciona para modelos dos amigos", () => expect(defaultDraftFor("bernardo")?.ai_name).toBe("IA do Bernardo"));
  it("sliders e instruções entram no prompt e mudam o comportamento", () => {
    const d = { ...FRIEND_TEMPLATES.jg.draft, custom_instructions: "Sempre fale do Flamengo." };
    const sys = buildSystemPrompt(d, { ownerName: "JG", otherAis: [{ ai_name: "IA do Bernardo", ownerName: "Bernardo" }], humans: ["JG", "Bernardo"], groupName: "G" });
    expect(sys).toContain("Sempre fale do Flamengo.");
    expect(sys).toContain("faça piadas com muita frequência");
    expect(sys).toContain("você é SOMENTE IA do JG");
    const cold = buildSystemPrompt({ ...d, traits: clampTraits({ ...d.traits, humor: 0 }) }, { ownerName: "JG", otherAis: [], humans: [], groupName: "G" });
    expect(cold).toContain("quase não faça piadas");
  });
  it("clamp dos sliders 0..100", () => expect(clampTraits({ humor: 500, sarcasm: -3 })).toMatchObject({ humor: 100, sarcasm: 0 }));
});

describe("criptografia das chaves", () => {
  it("AES-256-GCM ida e volta, e detecta adulteração", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const e = encryptSecret("sk-teste-123456789");
    expect(e.ciphertext).not.toContain("sk-teste");
    expect(decryptSecret(e)).toBe("sk-teste-123456789");
    const bad = { ...e, ciphertext: Buffer.from("xx" + e.ciphertext).toString("base64") };
    expect(() => decryptSecret(bad)).toThrow();
  });
});

describe("adaptadores dos provedores (formato real das APIs)", () => {
  afterEach(() => vi.unstubAllGlobals());
  function mockFetch(handler: (url: string, body: any, headers: any) => { status?: number; json: any }) {
    const calls: { url: string; body: any; headers: any }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url, body, headers: init?.headers });
      const r = handler(url, body, init?.headers);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
    }));
    return calls;
  }
  const base = { apiKey: "k", system: "SYS", messages: [{ role: "user" as const, content: "oi" }], maxTokens: 100, temperature: 0.9 };

  it("OpenAI", async () => {
    const calls = mockFetch(() => ({ json: { choices: [{ message: { content: "Flamengo!" } }], usage: { prompt_tokens: 10, completion_tokens: 3 } } }));
    const r = await generate({ ...base, provider: "openai", model: "gpt-4.1-mini" });
    expect(r).toEqual({ text: "Flamengo!", inputTokens: 10, outputTokens: 3 });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].headers.authorization).toBe("Bearer k");
    expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "SYS" });
  });
  it("OpenAI: remove 'temperature' se o modelo recusar", async () => {
    let n = 0;
    const calls = mockFetch(() => (n++ === 0
      ? { status: 400, json: { error: { message: "Unsupported parameter: 'temperature'", param: "temperature" } } }
      : { json: { choices: [{ message: { content: "ok" } }], usage: {} } }));
    const r = await generate({ ...base, provider: "openai", model: "gpt-4.1" });
    expect(r.text).toBe("ok");
    expect("temperature" in calls[1].body).toBe(false);
  });
  it("Anthropic", async () => {
    const calls = mockFetch(() => ({ json: { content: [{ type: "text", text: "Inveja é complicado." }], usage: { input_tokens: 20, output_tokens: 5 } } }));
    const r = await generate({ ...base, provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(r.text).toBe("Inveja é complicado.");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].headers["x-api-key"]).toBe("k");
    expect(calls[0].body.system).toBe("SYS");
  });
  it("Gemini (ignora 'pensamentos')", async () => {
    const calls = mockFetch(() => ({ json: { candidates: [{ content: { parts: [{ text: "pensando...", thought: true }, { text: "KKKK" }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 5 } } }));
    const r = await generate({ ...base, provider: "gemini", model: "gemini-2.5-flash" });
    expect(r).toEqual({ text: "KKKK", inputTokens: 7, outputTokens: 7 });
    expect(calls[0].url).toContain("models/gemini-2.5-flash:generateContent");
    expect(calls[0].body.systemInstruction.parts[0].text).toBe("SYS");
  });
  it("erro 401 vira mensagem clara", async () => {
    mockFetch(() => ({ status: 401, json: { error: { message: "Incorrect API key" } } }));
    await expect(generate({ ...base, provider: "openai", model: "x" })).rejects.toThrow(/chave de API inválida/);
  });
  it("429 explica cota/créditos", async () => {
    mockFetch(() => ({ status: 429, json: { error: { message: "quota" } } }));
    await expect(generate({ ...base, provider: "anthropic", model: "x" })).rejects.toThrow(/sem créditos/);
  });
  it("filtra modelos de chat", () => {
    expect(filterChatModels("openai", { data: [{ id: "gpt-4.1" }, { id: "text-embedding-3" }, { id: "gpt-4o-realtime" }, { id: "o3" }] })).toEqual(["gpt-4.1", "o3"]);
    expect(filterChatModels("gemini", { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }] })).toEqual(["gemini-2.5-flash"]);
  });
  it("custo só é estimado com preços informados pelo usuário", () => {
    expect(estimateCost(1000, 1000, null, null)).toBeNull();
    expect(estimateCost(1_000_000, 500_000, 1, 4)).toBe(3);
  });
});

describe("ENCRYPTION_KEY como frase", () => {
  it("aceita frase longa e recusa curta", () => {
    process.env.ENCRYPTION_KEY = "minha frase secreta muito longa do ai friends 2026";
    expect(decryptSecret(encryptSecret("abc"))).toBe("abc");
    process.env.ENCRYPTION_KEY = "curta";
    expect(() => encryptSecret("abc")).toThrow(/32 caracteres/);
  });
});
