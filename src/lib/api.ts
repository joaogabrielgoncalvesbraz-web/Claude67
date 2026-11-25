import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok(data: unknown = { ok: true }, status = 200) {
  return NextResponse.json(data, { status });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Envolve rotas: trata erros de validação/permissão e nunca vaza detalhes internos. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const first = e.issues[0];
        return NextResponse.json({ error: `Dados inválidos: ${first?.path.join(".") || ""} ${first?.message ?? ""}`.trim() }, { status: 400 });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
    }
  };
}

export async function requireUser() {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Você precisa entrar na sua conta.");
  return data.user;
}

export interface Membership {
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  ai_enabled: boolean;
  ai_silent: boolean;
  nickname: string | null;
}

export async function requireMember(groupId: string, userId: string): Promise<Membership> {
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) throw new HttpError(400, "Grupo inválido.");
  const { data } = await supabaseAdmin()
    .from("group_members")
    .select("group_id,user_id,role,ai_enabled,ai_silent,nickname")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new HttpError(403, "Você não participa deste grupo.");
  return data as Membership;
}

export async function requireAdmin(groupId: string, userId: string): Promise<Membership> {
  const m = await requireMember(groupId, userId);
  if (m.role !== "admin") throw new HttpError(403, "Apenas o administrador do grupo pode fazer isso.");
  return m;
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Corpo da requisição inválido.");
  }
}

/** Remove caracteres de controle e espaços extras. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{4,}/g, "\n\n\n").trim();
}

// Rate limit em memória (por instância) para login/cadastro. Mensagens usam limite no banco.
const buckets = new Map<string, { n: number; reset: number }>();
export function memoryRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Muitas tentativas. Espere um pouco e tente de novo.");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
