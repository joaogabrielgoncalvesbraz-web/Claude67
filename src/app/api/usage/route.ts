import { route, ok, requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { usageSnapshot } from "@/lib/usage";

/** Histórico de uso do próprio usuário: totais por dia (30 dias) + últimas chamadas. */
export const GET = route(async () => {
  const user = await requireUser();
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: rows }, { data: settings }] = await Promise.all([
    db.from("usage_logs").select("created_at, provider, model, kind, input_tokens, output_tokens, cost_usd")
      .eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    db.from("ai_settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const days: Record<string, { calls: number; tokens: number; cost: number | null }> = {};
  for (const r of rows ?? []) {
    const d = new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    days[d] ??= { calls: 0, tokens: 0, cost: null };
    days[d].calls++;
    days[d].tokens += r.input_tokens + r.output_tokens;
    if (r.cost_usd != null) days[d].cost = (days[d].cost ?? 0) + Number(r.cost_usd);
  }
  return ok({ snapshot: await usageSnapshot(user.id, settings), days, recent: (rows ?? []).slice(0, 50) });
});
