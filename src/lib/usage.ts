import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { decryptSecret } from "./crypto";
import { estimateCost } from "./providers";
import type { Provider } from "./types";

export interface UsageSnapshot {
  messagesToday: number;
  tokensToday: number;
  costMonth: number | null;
  limits: { maxMessagesPerDay: number; dailyTokenLimit: number; monthlyBudgetUsd: number | null; warnPercent: number };
  percent: number; // maior % entre os limites
  blocked: boolean;
  reason: string | null;
}

function startOfDayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
function startOfMonthUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function usageSnapshot(userId: string, settings: Record<string, any> | null): Promise<UsageSnapshot> {
  const db = supabaseAdmin();
  const s = settings ?? {};
  const [{ data: today }, { data: month }] = await Promise.all([
    db.from("usage_logs").select("kind,input_tokens,output_tokens").eq("user_id", userId).gte("created_at", startOfDayUtc()).limit(20000),
    db.from("usage_logs").select("cost_usd").eq("user_id", userId).gte("created_at", startOfMonthUtc()).not("cost_usd", "is", null).limit(50000),
  ]);
  const messagesToday = (today ?? []).filter((r: any) => r.kind === "chat" || r.kind === "free").length;
  const tokensToday = (today ?? []).reduce((a: number, r: any) => a + r.input_tokens + r.output_tokens, 0);
  const costMonth = (month ?? []).length ? (month ?? []).reduce((a: number, r: any) => a + Number(r.cost_usd), 0) : (s.price_input_per_m != null ? 0 : null);
  const limits = {
    maxMessagesPerDay: s.max_messages_per_day ?? 200,
    dailyTokenLimit: s.daily_token_limit ?? 300000,
    monthlyBudgetUsd: s.monthly_budget_usd != null ? Number(s.monthly_budget_usd) : null,
    warnPercent: s.warn_percent ?? 80,
  };
  const pcts = [messagesToday / limits.maxMessagesPerDay, tokensToday / limits.dailyTokenLimit];
  if (limits.monthlyBudgetUsd && costMonth != null) pcts.push(costMonth / limits.monthlyBudgetUsd);
  const percent = Math.round(Math.max(...pcts) * 100);

  let reason: string | null = null;
  if (messagesToday >= limits.maxMessagesPerDay) reason = "limite diário de mensagens atingido";
  else if (tokensToday >= limits.dailyTokenLimit) reason = "limite diário de tokens atingido";
  else if (limits.monthlyBudgetUsd != null && costMonth != null && costMonth >= limits.monthlyBudgetUsd) reason = "orçamento mensal estimado atingido";
  const blocked = reason !== null && s.disable_on_limit !== false;
  return { messagesToday, tokensToday, costMonth, limits, percent, blocked, reason };
}

export async function logUsage(e: {
  userId: string; groupId?: string | null; provider: Provider; model: string;
  kind: "chat" | "free" | "test" | "summary"; inputTokens: number; outputTokens: number;
  settings: Record<string, any> | null;
}) {
  const s = e.settings ?? {};
  const cost = estimateCost(
    e.inputTokens, e.outputTokens,
    s.price_input_per_m != null ? Number(s.price_input_per_m) : null,
    s.price_output_per_m != null ? Number(s.price_output_per_m) : null,
  );
  await supabaseAdmin().from("usage_logs").insert({
    user_id: e.userId, group_id: e.groupId ?? null, provider: e.provider, model: e.model, kind: e.kind,
    input_tokens: e.inputTokens, output_tokens: e.outputTokens, cost_usd: cost,
  });
}

/** Lê e descriptografa a chave no servidor, só no momento da chamada ao provedor. */
export async function getApiKey(userId: string, provider: Provider): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("api_keys")
    .select("ciphertext, iv, auth_tag")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return decryptSecret(data as any);
}

export async function markKeyError(userId: string, provider: Provider, message: string) {
  await supabaseAdmin().from("api_keys").update({ status: "error", last_error: message.slice(0, 500) }).eq("user_id", userId).eq("provider", provider);
}
