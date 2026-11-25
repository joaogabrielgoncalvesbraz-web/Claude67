import { z } from "zod";
import { route, ok, body, requireUser, requireMember, HttpError, cleanText } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadGroupAis, settingsOf } from "@/lib/groups";
import { parseMentions } from "@/lib/orchestrator";
import { respondToHumanMessage } from "@/lib/engine";
import type { Message } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const Send = z.object({
  content: z.string().max(4000),
  replyToId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await requireMember(id, user.id);
  const input = Send.parse(await body(req));
  const content = cleanText(input.content);
  if (!content) throw new HttpError(400, "Mensagem vazia.");
  const db = supabaseAdmin();

  // anti-spam: limite de mensagens humanas por minuto
  const { data: g } = await db.from("groups").select("settings").eq("id", id).single();
  const settings = settingsOf(g?.settings);
  const { count } = await db.from("messages").select("id", { count: "exact", head: true })
    .eq("group_id", id).eq("user_id", user.id).eq("sender_type", "human")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= settings.human_msgs_per_minute) throw new HttpError(429, "Calma! Você está enviando mensagens rápido demais.");

  if (input.replyToId) {
    const { data: r } = await db.from("messages").select("id").eq("id", input.replyToId).eq("group_id", id).maybeSingle();
    if (!r) throw new HttpError(400, "A mensagem respondida não existe neste grupo.");
  }

  const { members } = await loadGroupAis(id);
  const mentions = parseMentions(content, members.map((m) => ({ user_id: m.user_id, ai_name: m.ai_name, display_name: m.display_name, nickname: m.nickname, username: m.username })), user.id);
  const { data: msg, error } = await db.from("messages").insert({
    group_id: id, sender_type: "human", user_id: user.id, content,
    reply_to_id: input.replyToId ?? null,
    mentions: mentions.all ? members.map((m) => m.user_id) : mentions.aiTargets,
  }).select("*").single();
  if (error) throw error;

  const responders = await respondToHumanMessage(id, msg as Message);
  return ok({ message: msg, responders }, 201);
});
