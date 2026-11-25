import { z } from "zod";
import { route, ok, body, HttpError, memoryRateLimit, clientIp } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToEmail, normalizeUsername, USERNAME_RE } from "@/lib/auth-email";
import { initialPersonalityFor } from "@/lib/personality";

const Schema = z.object({
  username: z.string().transform(normalizeUsername).refine((u) => USERNAME_RE.test(u), "use 2 a 20 letras minúsculas, números ou _"),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(8, "mínimo de 8 caracteres").max(72),
});

const COLORS = ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#06b6d4", "#ec4899"];

export const POST = route(async (req) => {
  memoryRateLimit("signup:" + clientIp(req), 5, 10 * 60_000);
  const { username, displayName, password } = Schema.parse(await body(req));
  const db = supabaseAdmin();

  const { data: exists } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
  if (exists) throw new HttpError(409, "Esse nome de usuário já existe.");

  const { data: created, error } = await db.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error || !created.user) {
    if (/already/i.test(error?.message ?? "")) throw new HttpError(409, "Esse nome de usuário já existe.");
    if (/password/i.test(error?.message ?? "")) throw new HttpError(400, "Senha fraca: " + error!.message);
    throw new HttpError(500, "Não foi possível criar a conta: " + (error?.message ?? ""));
  }
  const uid = created.user.id;
  try {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const { error: pErr } = await db.from("profiles").insert({ id: uid, username, display_name: displayName, color });
    if (pErr) throw pErr;
    const draft = initialPersonalityFor(username, displayName);
    const { data: pers, error: perErr } = await db.from("personalities").insert({ ...draft, user_id: uid }).select("id").single();
    if (perErr) throw perErr;
    const { error: sErr } = await db.from("ai_settings").insert({ user_id: uid, active_personality_id: pers.id });
    if (sErr) throw sErr;
  } catch (e) {
    await db.auth.admin.deleteUser(uid);
    throw e;
  }

  const sb = await supabaseServer();
  const { error: loginErr } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (loginErr) throw new HttpError(500, "Conta criada, mas o login falhou. Tente entrar.");
  return ok({ ok: true });
});
