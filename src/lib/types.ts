export type Provider = "openai" | "anthropic" | "gemini";
export const PROVIDERS: Provider[] = ["openai", "anthropic", "gemini"];

export interface Traits {
  humor: number;
  sarcasm: number;
  seriousness: number;
  creativity: number;
  analytical: number;
  participation: number;
  memes: number;
  slang: number;
  teasing: number;
}

export const TRAIT_KEYS: (keyof Traits)[] = [
  "humor", "sarcasm", "seriousness", "creativity", "analytical", "participation", "memes", "slang", "teasing",
];

export const TRAIT_LABELS: Record<keyof Traits, string> = {
  humor: "Humor",
  sarcasm: "Sarcasmo",
  seriousness: "Seriedade",
  creativity: "Criatividade",
  analytical: "Inteligência analítica",
  participation: "Frequência de participação",
  memes: "Uso de memes",
  slang: "Uso de gírias",
  teasing: "Provocação amigável",
};

export interface Personality {
  id: string;
  user_id: string;
  preset: string;
  ai_name: string;
  avatar_emoji: string;
  color: string;
  description: string;
  speaking_style: string;
  debate_behavior: string;
  custom_instructions: string;
  traits: Traits;
  created_at?: string;
  updated_at?: string;
}

export type PersonalityDraft = Omit<Personality, "id" | "user_id" | "created_at" | "updated_at">;

export interface GroupSettings {
  max_ai_chain: number;
  max_responders: number;
  human_msgs_per_minute: number;
  ai_msgs_per_hour: number;
  free_default_turns: number;
  free_default_minutes: number;
  max_free_turns: number;
}

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  max_ai_chain: 3,
  max_responders: 2,
  human_msgs_per_minute: 20,
  ai_msgs_per_hour: 120,
  free_default_turns: 12,
  free_default_minutes: 5,
  max_free_turns: 50,
};

export interface Message {
  id: string;
  group_id: string;
  sender_type: "human" | "ai" | "system";
  user_id: string | null;
  ai_name: string | null;
  ai_avatar: string | null;
  ai_color: string | null;
  content: string;
  reply_to_id: string | null;
  mentions: string[];
  pinned: boolean;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AiRun {
  group_id: string;
  mode: "reply" | "free";
  status: "idle" | "running" | "paused" | "stopped";
  topic: string | null;
  participants: string[];
  queue: string[];
  max_turns: number;
  turns_done: number;
  chain_turns: number;
  ends_at: string | null;
  paused_remaining_ms: number | null;
  next_tick_at: string | null;
  lock_until: string | null;
  thinking_user_id: string | null;
  last_speaker: string | null;
  started_by: string | null;
  stop_reason: string | null;
  updated_at: string;
}

/** Informação pública (não secreta) da IA de um membro, mostrada no grupo. */
export interface MemberAi {
  user_id: string;
  username: string;
  display_name: string;
  nickname: string | null;
  avatar_emoji: string;
  color: string;
  role: "admin" | "member";
  ai_enabled: boolean;
  ai_silent: boolean;
  ai_name: string | null;
  ai_avatar: string | null;
  ai_color: string | null;
  provider: Provider | null;
  model: string | null;
  ai_ready: boolean; // tem chave + modelo + personalidade e está ligada
  ai_ready_reason: string | null;
}
