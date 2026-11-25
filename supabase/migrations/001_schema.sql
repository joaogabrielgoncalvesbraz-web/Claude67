-- =====================================================================
-- AI FRIENDS — schema completo (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
--
-- Modelo de segurança:
--   * RLS ligado em TODAS as tabelas.
--   * O navegador (chave anon + sessão do usuário) só consegue LER o que
--     pertence a ele ou aos grupos dos quais participa.
--   * TODAS as escritas passam pelas rotas de API do Next.js, que validam
--     permissões e usam a service role no servidor.
--   * A tabela api_keys não tem nenhuma policy: nenhum cliente consegue
--     ler as chaves, nem criptografadas.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- perfis
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{2,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 40),
  avatar_emoji  text not null default '🙂',
  color         text not null default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  theme         text not null default 'roxo',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- grupos
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  settings    jsonb not null default '{
    "max_ai_chain": 3,
    "max_responders": 2,
    "human_msgs_per_minute": 20,
    "ai_msgs_per_hour": 120,
    "free_default_turns": 12,
    "free_default_minutes": 5,
    "max_free_turns": 50
  }'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  nickname   text check (nickname is null or char_length(nickname) <= 30),
  ai_enabled boolean not null default true,   -- admin liga/desliga a IA deste membro no grupo
  ai_silent  boolean not null default false,  -- modo silencioso: a IA só fala quando chamada
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members(user_id);

-- ----------------------------------------------------------- personalidades
create table if not exists public.personalities (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  preset              text not null default 'personalizado',
  ai_name             text not null check (char_length(ai_name) between 1 and 30),
  avatar_emoji        text not null default '🤖',
  color               text not null default '#22c55e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description         text not null default '' check (char_length(description) <= 1000),
  speaking_style      text not null default '' check (char_length(speaking_style) <= 500),
  debate_behavior     text not null default '' check (char_length(debate_behavior) <= 500),
  custom_instructions text not null default '' check (char_length(custom_instructions) <= 4000),
  traits              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists personalities_user_idx on public.personalities(user_id);

-- ------------------------------------------------------ configurações de IA
create table if not exists public.ai_settings (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  provider              text check (provider in ('openai','anthropic','gemini')),
  model                 text,
  active_personality_id uuid references public.personalities(id) on delete set null,
  enabled               boolean not null default true,
  max_messages_per_day  int not null default 200 check (max_messages_per_day between 1 and 100000),
  daily_token_limit     int not null default 300000 check (daily_token_limit between 1000 and 100000000),
  monthly_budget_usd    numeric(10,2) check (monthly_budget_usd is null or monthly_budget_usd >= 0),
  price_input_per_m     numeric(10,4) check (price_input_per_m is null or price_input_per_m >= 0),
  price_output_per_m    numeric(10,4) check (price_output_per_m is null or price_output_per_m >= 0),
  max_output_tokens     int not null default 400 check (max_output_tokens between 50 and 8000),
  warn_percent          int not null default 80 check (warn_percent between 10 and 100),
  disable_on_limit      boolean not null default true,
  updated_at            timestamptz not null default now()
);

-- Chaves de API criptografadas (AES-256-GCM, chave mestra só no servidor).
create table if not exists public.api_keys (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  provider       text not null check (provider in ('openai','anthropic','gemini')),
  ciphertext     text not null,
  iv             text not null,
  auth_tag       text not null,
  last4          text not null,
  status         text not null default 'untested' check (status in ('untested','ok','error')),
  last_error     text,
  models         text[] not null default '{}',
  last_tested_at timestamptz,
  created_at     timestamptz not null default now(),
  primary key (user_id, provider)
);

-- -------------------------------------------------------------- mensagens
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  sender_type text not null check (sender_type in ('human','ai','system')),
  user_id     uuid references public.profiles(id) on delete set null, -- humano autor OU dono da IA
  ai_name     text,      -- snapshot do nome da IA no momento da mensagem
  ai_avatar   text,
  ai_color    text,
  content     text not null check (char_length(content) between 1 and 4000),
  reply_to_id uuid references public.messages(id) on delete set null,
  mentions    uuid[] not null default '{}',  -- user_ids cujas IAs foram mencionadas
  pinned      boolean not null default false,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  fts         tsvector generated always as (to_tsvector('portuguese', content)) stored
);
create index if not exists messages_group_time_idx on public.messages(group_id, created_at desc);
create index if not exists messages_fts_idx on public.messages using gin(fts);

create table if not exists public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists reactions_group_idx on public.reactions(group_id);

create table if not exists public.favorites (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------- memória
create table if not exists public.group_memory (
  group_id          uuid primary key references public.groups(id) on delete cascade,
  summary           text not null default '',
  summarized_until  timestamptz,
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------- estado das rodadas de IA
create table if not exists public.ai_runs (
  group_id         uuid primary key references public.groups(id) on delete cascade,
  mode             text not null default 'reply' check (mode in ('reply','free')),
  status           text not null default 'idle' check (status in ('idle','running','paused','stopped')),
  topic            text,
  participants     uuid[] not null default '{}',
  queue            uuid[] not null default '{}',
  max_turns        int not null default 0,
  turns_done       int not null default 0,
  chain_turns      int not null default 0,
  ends_at          timestamptz,
  paused_remaining_ms bigint,
  next_tick_at     timestamptz,
  lock_until       timestamptz,
  thinking_user_id uuid,
  last_speaker     uuid,
  started_by       uuid,
  stop_reason      text,
  updated_at       timestamptz not null default now()
);

-- ------------------------------------------------------------ uso / custos
create table if not exists public.usage_logs (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete set null,
  provider      text not null,
  model         text not null,
  kind          text not null check (kind in ('chat','free','test','summary')),
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(12,6),
  created_at    timestamptz not null default now()
);
create index if not exists usage_user_time_idx on public.usage_logs(user_id, created_at desc);
create index if not exists usage_group_time_idx on public.usage_logs(group_id, created_at desc);

-- ======================================================= funções auxiliares
create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- Trava atômica para que só UM processo gere a próxima fala de IA por grupo.
create or replace function public.acquire_ai_lock(p_group uuid, p_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update public.ai_runs
     set lock_until = now() + make_interval(secs => p_seconds)
   where group_id = p_group
     and status = 'running'
     and (lock_until is null or lock_until < now())
     and (next_tick_at is null or next_tick_at <= now())
  returning true into ok;
  return coalesce(ok, false);
end $$;

revoke all on function public.acquire_ai_lock(uuid,int) from public;
revoke all on function public.acquire_ai_lock(uuid,int) from anon, authenticated;

-- ===================================================================== RLS
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.personalities enable row level security;
alter table public.ai_settings   enable row level security;
alter table public.api_keys      enable row level security;
alter table public.messages      enable row level security;
alter table public.reactions     enable row level security;
alter table public.favorites     enable row level security;
alter table public.group_memory  enable row level security;
alter table public.ai_runs       enable row level security;
alter table public.usage_logs    enable row level security;

-- Somente leitura para o cliente. Escritas: rotas de API (service role).
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists "groups_read" on public.groups;
create policy "groups_read" on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "members_read" on public.group_members;
create policy "members_read" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "personalities_read_own" on public.personalities;
create policy "personalities_read_own" on public.personalities for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "ai_settings_read_own" on public.ai_settings;
create policy "ai_settings_read_own" on public.ai_settings for select to authenticated
  using (user_id = auth.uid());

-- api_keys: SEM policies => nenhum acesso pelo cliente.
revoke all on public.api_keys from anon, authenticated;

drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "reactions_read" on public.reactions;
create policy "reactions_read" on public.reactions for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "favorites_read_own" on public.favorites;
create policy "favorites_read_own" on public.favorites for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "memory_read" on public.group_memory;
create policy "memory_read" on public.group_memory for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "runs_read" on public.ai_runs;
create policy "runs_read" on public.ai_runs for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "usage_read_own" on public.usage_logs;
create policy "usage_read_own" on public.usage_logs for select to authenticated
  using (user_id = auth.uid());

-- O cliente nunca escreve diretamente.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

-- ================================================================ Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages;      exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.reactions;     exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ai_runs;       exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.groups;        exception when duplicate_object then null; end;
  end if;
end $$;

-- Canais privados de presença/digitação: só membros do grupo entram em "group:<id>".
create or replace function public.can_use_group_topic(topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare gid uuid;
begin
  if topic !~ '^group:[0-9a-f-]{36}$' then return false; end if;
  gid := substring(topic from 7)::uuid;
  return public.is_group_member(gid);
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "aifriends_group_topic_read" on realtime.messages';
    execute 'create policy "aifriends_group_topic_read" on realtime.messages for select to authenticated using (public.can_use_group_topic(realtime.topic()))';
    execute 'drop policy if exists "aifriends_group_topic_write" on realtime.messages';
    execute 'create policy "aifriends_group_topic_write" on realtime.messages for insert to authenticated with check (public.can_use_group_topic(realtime.topic()))';
  end if;
end $$;
