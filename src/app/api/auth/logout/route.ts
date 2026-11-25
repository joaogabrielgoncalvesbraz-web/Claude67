import { route, ok } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase/server";

export const POST = route(async () => {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return ok();
});
