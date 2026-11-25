import "server-only";
/**
 * O Supabase Auth trabalha com e-mail. Para permitir cadastro só com
 * nome de usuário + senha, cada usuário recebe um e-mail interno que
 * nunca recebe mensagens: <usuario>@<AUTH_EMAIL_DOMAIN>.
 */
export function usernameToEmail(username: string): string {
  const domain = process.env.AUTH_EMAIL_DOMAIN || "users.aifriends.local";
  return `${username.toLowerCase()}@${domain}`;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const USERNAME_RE = /^[a-z0-9_]{2,20}$/;
