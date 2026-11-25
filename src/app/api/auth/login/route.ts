import { z } from "zod";
import { route, ok, body, HttpError, memoryRateLimit, clientIp } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToEmail, normalizeUsername } from "@/lib/auth-email";

const Schema = z.object({ username: z.string().min(1).max(40), password: z.string().min(1).max(72) });

export const POST = route(async (req) => {
  memoryRateLimit("login:" + clientIp(req), 10, 5 * 60_000);
  const { username, password } = Schema.parse(await body(req));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: usernameToEmail(normalizeUsername(username)), password });
  if (error) throw new HttpError(401, "Usuário ou senha incorretos.");
  return ok();
});
