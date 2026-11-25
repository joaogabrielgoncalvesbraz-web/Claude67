import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, serviceKey } from "../env";

let admin: SupabaseClient | null = null;

/** Cliente com SERVICE ROLE. Só existe no servidor. Ignora RLS: sempre valide permissões antes. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = SUPABASE_URL;
    const key = serviceKey();
    if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL não configuradas.");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}
