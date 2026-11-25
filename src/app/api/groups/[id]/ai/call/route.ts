import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError } from "@/lib/api";
import { loadGroupAis } from "@/lib/groups";
import { enqueueResponders } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };

/** Botões "Chamar todas as IAs" / "Chamar IA específica". */
export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const { targets } = z.object({ targets: z.union([z.literal("all"), z.array(z.string().uuid()).min(1).max(12)]) }).parse(await body(req));
  const { members } = await loadGroupAis(id);
  const ready = members.filter((m) => m.ai_ready);
  const chosen = targets === "all" ? ready.map((m) => m.user_id) : ready.filter((m) => targets.includes(m.user_id)).map((m) => m.user_id);
  if (chosen.length === 0) {
    const reasons = members.filter((m) => targets === "all" || targets.includes(m.user_id))
      .map((m) => `${m.ai_name ?? "IA de " + m.display_name}: ${m.ai_ready_reason}`).join("; ");
    throw new HttpError(400, `Nenhuma IA pronta para responder. ${reasons}`);
  }
  const run = await enqueueResponders(id, chosen, user.id);
  return ok({ run, chosen });
});
