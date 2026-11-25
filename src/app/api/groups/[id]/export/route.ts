import { route, requireUser, requireMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Exporta a conversa em TXT ou JSON. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "txt";
  const db = supabaseAdmin();
  const { data: g } = await db.from("groups").select("name").eq("id", id).single();
  const all: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from("messages").select("id,sender_type,user_id,ai_name,content,reply_to_id,pinned,created_at")
      .eq("group_id", id).order("created_at").range(from, from + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const ids = Array.from(new Set(all.map((m) => m.user_id).filter(Boolean)));
  const { data: profs } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] as any[] };
  const name = (uid: string | null) => (profs ?? []).find((p: any) => p.id === uid)?.display_name ?? "?";
  const safe = (g?.name ?? "grupo").replace(/[^\w-]+/g, "_");
  if (format === "json") {
    const out = all.map((m) => ({ ...m, author: m.sender_type === "human" ? name(m.user_id) : m.sender_type === "ai" ? `${m.ai_name} (IA de ${name(m.user_id)})` : "sistema" }));
    return new Response(JSON.stringify({ group: g?.name, exported_at: new Date().toISOString(), messages: out }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${safe}.json"` },
    });
  }
  const lines = all.map((m) => {
    const when = new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const who = m.sender_type === "human" ? name(m.user_id) : m.sender_type === "ai" ? `🤖 ${m.ai_name}` : "⚙️ sistema";
    return `[${when}] ${who}: ${m.content}`;
  });
  return new Response(`AI FRIENDS — ${g?.name}\n\n` + lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${safe}.txt"` },
  });
});
