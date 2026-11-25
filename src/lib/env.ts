/**
 * Aceita tanto os nomes "clássicos" quanto os que a integração Supabase↔Vercel cria.
 * (Referências literais a process.env.NEXT_PUBLIC_* para o Next.js embutir no navegador.)
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

/** Só no servidor. */
export function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}
