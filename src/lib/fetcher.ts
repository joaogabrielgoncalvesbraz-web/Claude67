"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** fetch JSON com mensagens de erro em português vindas do backend. */
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
    window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data as T;
}
