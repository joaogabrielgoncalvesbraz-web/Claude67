import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "./supabase/admin";
import type { AiRun, GroupSettings, MemberAi, Personality, Provider } from "./types";
import { DEFAULT_GROUP_SETTINGS } from "./types";
import { clampTraits } from "./personality";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I

export function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function settingsOf(raw: unknown): GroupSettings {
  return { ...DEFAULT_GROUP_SETTINGS, ...((raw as Partial<GroupSettings>) ?? {}) };
}

export interface AiProfile {
  userId: string;
  ownerName: string;
  personality: Personality | null;
  provider: Provider | null;
  model: string | null;
  enabled: boolean;
  hasKey: boolean;
  keyStatus: string | null;
  settings: Record<string, any> | null;
}

/** Carrega TODAS as IAs dos membros (uso interno do servidor). Nunca inclui a chave. */
export async function loadGroupAis(groupId: string): Promise<{ members: MemberAi[]; ais: Map<string, AiProfile> }> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("group_members")
    .select("user_id, role, nickname, ai_enabled, ai_silent, joined_at, profiles!inner(username, display_name, avatar_emoji, color)")
    .eq("group_id", groupId)
    .order("joined_at");
  if (error) throw error;
  const ids = (rows ?? []).map((r: any) => r.user_id);
  const [{ data: sets }, { data: keys }] = await Promise.all([
    db.from("ai_settings").select("*").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("api_keys").select("user_id, provider, status").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const persIds = (sets ?? []).map((s: any) => s.active_personality_id).filter(Boolean);
  const { data: pers } = persIds.length
    ? await db.from("personalities").select("*").in("id", persIds)
    : { data: [] as any[] };

  const members: MemberAi[] = [];
  const ais = new Map<string, AiProfile>();
  for (const r of rows ?? []) {
    const p = (r as any).profiles;
    const s = (sets ?? []).find((x: any) => x.user_id === r.user_id) ?? null;
    const persRow = s ? (pers ?? []).find((x: any) => x.id === s.active_personality_id) : null;
    const personality: Personality | null = persRow ? { ...persRow, traits: clampTraits(persRow.traits) } : null;
    const key = s?.provider ? (keys ?? []).find((k: any) => k.user_id === r.user_id && k.provider === s.provider) : null;
    const ownerName = r.nickname || p.display_name;

    let reason: string | null = null;
    if (!personality) reason = "sem personalidade ativa";
    else if (!s?.provider) reason = "provedor não escolhido";
    else if (!key) reason = "sem chave de API";
    else if (!s.model) reason = "modelo não escolhido";
    else if (!s.enabled) reason = "IA desligada pelo dono";
    else if (!r.ai_enabled) reason = "IA desativada pelo admin";

    members.push({
      user_id: r.user_id,
      username: p.username,
      display_name: p.display_name,
      nickname: r.nickname,
      avatar_emoji: p.avatar_emoji,
      color: p.color,
      role: r.role,
      ai_enabled: r.ai_enabled,
      ai_silent: r.ai_silent,
      ai_name: personality?.ai_name ?? null,
      ai_avatar: personality?.avatar_emoji ?? null,
      ai_color: personality?.color ?? null,
      provider: (s?.provider as Provider) ?? null,
      model: s?.model ?? null,
      ai_ready: reason === null,
      ai_ready_reason: reason,
    });
    ais.set(r.user_id, {
      userId: r.user_id,
      ownerName,
      personality,
      provider: (s?.provider as Provider) ?? null,
      model: s?.model ?? null,
      enabled: !!s?.enabled && r.ai_enabled,
      hasKey: !!key,
      keyStatus: key?.status ?? null,
      settings: s,
    });
  }
  return { members, ais };
}

export async function getOrCreateRun(groupId: string): Promise<AiRun> {
  const db = supabaseAdmin();
  const { data } = await db.from("ai_runs").select("*").eq("group_id", groupId).maybeSingle();
  if (data) return data as AiRun;
  const { data: created, error } = await db
    .from("ai_runs")
    .upsert({ group_id: groupId }, { onConflict: "group_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw error;
  return created as AiRun;
}

export async function updateRun(groupId: string, patch: Partial<AiRun>) {
  const { error } = await supabaseAdmin()
    .from("ai_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("group_id", groupId);
  if (error) throw error;
}

export async function systemMessage(groupId: string, content: string, meta: Record<string, unknown> = {}) {
  await supabaseAdmin().from("messages").insert({ group_id: groupId, sender_type: "system", content: content.slice(0, 4000), meta });
}

/** Garante que o grupo sempre tenha um admin; apaga o grupo se ficar vazio. */
export async function ensureAdminOrDelete(groupId: string) {
  const db = supabaseAdmin();
  const { data: members } = await db.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId).order("joined_at");
  if (!members || members.length === 0) {
    await db.from("groups").delete().eq("id", groupId);
    return;
  }
  if (!members.some((m: any) => m.role === "admin")) {
    const next = members[0];
    await db.from("group_members").update({ role: "admin" }).eq("group_id", groupId).eq("user_id", next.user_id);
    await db.from("groups").update({ owner_id: next.user_id }).eq("id", groupId);
  }
}
