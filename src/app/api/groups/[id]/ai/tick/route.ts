import { route, ok, requireUser, requireMember } from "@/lib/api";
import { tick } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120; // segundos (Vercel)

/** Gera a próxima fala de IA do grupo (se houver). Seguro contra chamadas simultâneas. */
export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  return ok(await tick(id));
});
