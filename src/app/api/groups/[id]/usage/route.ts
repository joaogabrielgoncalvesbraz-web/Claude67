import { route, ok, requireUser, requireAdmin } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Consumo de API das IAs NESTE grupo (agregado por membro, últimos 30 dias). Só admin. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireAdmin(id, user.id);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabaseAdmin().from("usage_logs")
    .select("user_id, provider, model, kind, input_tokens, output_tokens, cost_usd")
    .eq("group_id", id).gte("created_at", since).limit(50000);
  const per: Record<string, { calls: number; input: number; output: number; cost: number | null }> = {};
  for (const r of data ?? []) {
    const k = r.user_id as string;
    per[k] ??= { calls: 0, input: 0, output: 0, cost: null };
    per[k].calls++;
    per[k].input += r.input_tokens;
    per[k].output += r.output_tokens;
    if (r.cost_usd != null) per[k].cost = (per[k].cost ?? 0) + Number(r.cost_usd);
  }
  return ok({ since, perUser: per });
});
