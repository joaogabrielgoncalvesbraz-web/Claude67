import { route, ok, requireUser, requireMember } from "@/lib/api";
import { stopRun } from "@/lib/engine";

type Ctx = { params: Promise<{ id: string }> };

/** Interrupção manual: qualquer participante pode parar as IAs. */
export const POST = route(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  await stopRun(id, "interrompida manualmente", user.id);
  return ok();
});
