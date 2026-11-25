/**
 * Lógica (pura, testável) que decide QUAIS IAs falam e QUANDO.
 * Evita spam, repetição e ciclos infinitos entre IAs.
 */
import { normalizeName } from "./personality";

export interface MentionTarget {
  user_id: string;
  ai_name: string | null;
  display_name: string;
  nickname: string | null;
  username: string;
}

export interface MentionResult {
  all: boolean;
  aiTargets: string[];      // IAs chamadas diretamente com @
  ownersReferenced: string[]; // donos citados pelo nome (sem @) -> a IA dele tende a reagir
}

const ALL_TOKENS = ["@todas", "@todos", "@ias", "@ia's", "@all", "@geral"];

function norm(s: string) {
  return normalizeName(s).replace(/\s+/g, " ");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseMentions(text: string, members: MentionTarget[], authorId?: string | null): MentionResult {
  const t = norm(text);
  const all = ALL_TOKENS.some((tok) => new RegExp(`(^|\\s)${escapeRe(tok)}(?![\\w])`).test(t));
  const aiTargets = new Set<string>();
  const owners = new Set<string>();
  for (const m of members) {
    const names: string[] = [];
    if (m.ai_name) names.push(norm(m.ai_name), norm(m.ai_name).replace(/\s/g, ""));
    for (const n of names) {
      if (n && t.includes("@" + n)) aiTargets.add(m.user_id);
    }
    // "@jg" também chama a IA do JG
    for (const n of [m.username, m.display_name, m.nickname]) {
      if (!n) continue;
      const nn = norm(n);
      if (nn.length >= 2 && new RegExp(`@${escapeRe(nn)}(?![\\w])`).test(t)) aiTargets.add(m.user_id);
      if (m.user_id !== authorId && nn.length >= 2 && new RegExp(`(^|[^\\w@])${escapeRe(nn)}(?![\\w])`).test(t)) owners.add(m.user_id);
    }
    // citar a IA pelo nome sem @ também conta como "provocação"
    if (m.ai_name && t.includes(norm(m.ai_name))) owners.add(m.user_id);
  }
  return { all, aiTargets: [...aiTargets], ownersReferenced: [...owners].filter((id) => !aiTargets.has(id)) };
}

export interface Candidate {
  userId: string;
  participation: number; // 0..100
  silent: boolean;       // modo silencioso: só fala quando chamado
}

export interface ChooseInput {
  trigger: "human" | "ai";
  candidates: Candidate[];
  mentions: MentionResult;
  isQuestion: boolean;
  chainTurns: number;     // quantas falas de IA seguidas já houve
  maxChain: number;       // limite de falas de IA em sequência
  maxResponders: number;  // máximo de IAs respondendo a uma mensagem humana
  lastSpeaker: string | null; // dono da IA que falou por último (se IA)
  recentAiSpeakers: string[]; // donos das últimas falas de IA (mais recente primeiro)
  rand?: () => number;
}

/** Detecta ping-pong: as últimas 4 falas de IA alternando entre as mesmas duas. */
export function isPingPong(recent: string[]): string[] {
  if (recent.length < 4) return [];
  const [a, b, c, d] = recent;
  if (a !== b && a === c && b === d) return [a, b];
  return [];
}

export function chooseResponders(i: ChooseInput): string[] {
  const rand = i.rand ?? Math.random;
  const byId = new Map(i.candidates.map((c) => [c.userId, c]));
  const forced = (i.mentions.all ? i.candidates.map((c) => c.userId) : i.mentions.aiTargets).filter((id) => byId.has(id));

  if (i.trigger === "human") {
    const chosen = [...new Set(forced)];
    if (i.mentions.all || chosen.length > 0) return chosen; // chamadas explícitas: só quem foi chamado
    const scored = i.candidates
      .filter((c) => !c.silent)
      .map((c) => {
        let p = 0.15 + 0.6 * (c.participation / 100);
        if (i.mentions.ownersReferenced.includes(c.userId)) p += 0.35;
        if (i.isQuestion) p += 0.15;
        if (i.recentAiSpeakers.slice(0, 2).includes(c.userId)) p *= 0.7;
        return { id: c.userId, p: Math.min(0.95, p) };
      })
      .sort((a, b) => b.p - a.p);
    const picked = scored.filter((s) => rand() < s.p).map((s) => s.id);
    // ninguém sorteado: com chance proporcional, a IA mais "falante" responde para o chat não morrer
    if (picked.length === 0 && scored.length > 0 && rand() < scored[0].p) picked.push(scored[0].id);
    return picked.slice(0, Math.max(1, i.maxResponders));
  }

  // trigger === "ai": continuação de cadeia entre IAs
  if (i.chainTurns >= i.maxChain) return [];
  const blocked = new Set(isPingPong(i.recentAiSpeakers));
  const decay = Math.pow(0.6, i.chainTurns);
  const options = i.candidates
    .filter((c) => c.userId !== i.lastSpeaker && !blocked.has(c.userId))
    .filter((c) => !c.silent || i.mentions.aiTargets.includes(c.userId))
    .map((c) => {
      const provoked = i.mentions.aiTargets.includes(c.userId) || i.mentions.ownersReferenced.includes(c.userId);
      let p = (0.08 + 0.45 * (c.participation / 100)) * decay;
      if (provoked) p = Math.min(0.95, p + 0.45 * decay + 0.2);
      return { id: c.userId, p };
    })
    .sort((a, b) => b.p - a.p);
  for (const o of options) if (rand() < o.p) return [o.id];
  return [];
}

/** Escolhe quem fala na Conversa Livre (sorteio ponderado, nunca o mesmo duas vezes seguidas). */
export function pickFreeSpeaker(opts: {
  participants: { userId: string; participation: number }[];
  lastSpeaker: string | null;
  recentSpeakers: string[];
  provoked: string[];
  rand?: () => number;
}): string | null {
  const rand = opts.rand ?? Math.random;
  let pool = opts.participants.filter((p) => p.userId !== opts.lastSpeaker);
  if (pool.length === 0) pool = opts.participants;
  if (pool.length === 0) return null;
  const weights = pool.map((p) => {
    let w = 0.3 + p.participation / 100;
    if (opts.provoked.includes(p.userId)) w *= 2.5;
    if (opts.recentSpeakers[1] === p.userId) w *= 0.6;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let k = 0; k < pool.length; k++) {
    r -= weights[k];
    if (r <= 0) return pool[k].userId;
  }
  return pool[pool.length - 1].userId;
}

/** Limpa a resposta do modelo: tira "Nome:", impede que fale por outra IA, detecta [FIM]. */
export function sanitizeReply(raw: string, aiName: string, otherSpeakerNames: string[]): { text: string; ended: boolean } {
  let text = raw.replace(/\r/g, "").trim();
  const ended = /\[FIM\]/i.test(text);
  text = text.replace(/\[FIM\]/gi, "").trim();
  // remove prefixo com o próprio nome: "IA do JG:", "**IA do JG**:", "[IA do JG]:"
  const own = escapeRe(aiName);
  text = text.replace(new RegExp(`^\\s*[\\*\\[]*\\s*${own}\\s*[\\*\\]]*\\s*(\\(você\\))?\\s*:\\s*`, "i"), "");
  // corta se o modelo começou a escrever a fala de outra pessoa/IA
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const startsAsOther = otherSpeakerNames.some((n) =>
      n && new RegExp(`^\\s*[\\*\\[]*\\s*${escapeRe(n)}\\s*[\\*\\]]*\\s*:`, "i").test(line),
    );
    if (startsAsOther && out.length > 0) break;
    if (startsAsOther) continue;
    out.push(line);
  }
  text = out.join("\n").trim();
  if (/^".*"$/s.test(text) && text.length > 2) text = text.slice(1, -1).trim();
  if (text.length > 1500) text = text.slice(0, 1497).trimEnd() + "...";
  return { text, ended };
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
}

/** true se a nova mensagem é praticamente igual a uma recente (evita respostas repetitivas). */
export function isRepetitive(text: string, recent: string[]): boolean {
  const a = tokens(text);
  if (a.size === 0) return false;
  for (const r of recent) {
    if (norm(r) === norm(text)) return true;
    const b = tokens(r);
    if (b.size === 0) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const jacc = inter / (a.size + b.size - inter);
    if (jacc >= 0.8 && Math.min(a.size, b.size) >= 4) return true;
  }
  return false;
}

/** Temperatura a partir do slider de criatividade (0..100 -> 0.3..1.2). */
export function temperatureFor(creativity: number): number {
  return Math.round((0.3 + (creativity / 100) * 0.9) * 100) / 100;
}

/** Pausa "natural" entre falas de IA, em ms. */
export function naturalDelay(mode: "reply" | "free", rand: () => number = Math.random): number {
  return mode === "free" ? 2500 + Math.floor(rand() * 2500) : 800 + Math.floor(rand() * 1500);
}
