-- =====================================================================
--  ZAP DA GALERA — banco de dados (Supabase)
--  Cole TUDO no Supabase: SQL Editor -> New query -> Run.
--  Pode rodar de novo sem problema. Usa só tabelas com prefixo zap_,
--  então dá para rodar no mesmo projeto do AI FRIENDS sem mexer nele.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.zap_profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  nick       text not null default '' check (length(nick) <= 30),
  emoji      text not null default '🙂' check (length(emoji) <= 16),
  color      text not null default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  about      text not null default 'Disponível' check (length(about) <= 80),
  photo      text not null default '' check (length(photo) < 250000),
  code       text unique not null,
  seen       timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.zap_chats (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  name       text not null default '',
  emoji      text not null default '',
  code       text unique,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  last_text  text,
  last_by    uuid,
  last_at    timestamptz not null default now()
);

create table if not exists public.zap_members (
  chat_id      uuid not null references public.zap_chats on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         text not null default 'member' check (role in ('admin','member')),
  last_read_at timestamptz not null default 'epoch',
  joined_at    timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists zap_members_user_idx on public.zap_members(user_id);

create table if not exists public.zap_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.zap_chats on delete cascade,
  user_id    uuid references auth.users on delete set null,
  text       text not null default '' check (length(text) <= 4000),
  reply      jsonb,
  reactions  jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  sys        boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists zap_messages_chat_idx on public.zap_messages(chat_id, created_at desc);

-- ---------- funções auxiliares ----------
create or replace function public.zap_is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zap_members where chat_id = cid and user_id = auth.uid())
$$;

create or replace function public.zap_new_code() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ch text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b := gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(ch, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from zap_chats where code = c)
          and not exists (select 1 from zap_profiles where code = c);
  end loop;
  return c;
end $$;

create or replace function public.zap_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nick, ''), username, 'alguém') from zap_profiles where id = uid
$$;

create or replace function public.zap_sys(cid uuid, txt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into zap_messages(chat_id, user_id, text, sys) values (cid, auth.uid(), left(txt, 300), true);
  update zap_chats set last_text = left(txt, 140), last_by = auth.uid(), last_at = now() where id = cid;
end $$;

create or replace function public.zap_need_login() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'Você precisa entrar na sua conta.'; end if;
  return auth.uid();
end $$;

-- ---------- ações (o site só escreve por aqui) ----------
create or replace function public.zap_me() returns public.zap_profiles
language plpgsql security definer set search_path = public as $$
declare p zap_profiles; u text; me uuid := zap_need_login();
begin
  select * into p from zap_profiles where id = me;
  if not found then
    select split_part(email, '@', 1) into u from auth.users where id = me;
    insert into zap_profiles(id, username, code, emoji, color)
    values (me, coalesce(nullif(u, ''), 'user_' || left(me::text, 6)), zap_new_code(),
      (array['😎','🦊','👑','🐸','🐼','🔥','⚽','🎮','🐯','🤠','👽','🦁'])[1 + floor(random() * 12)::int],
      (array['#22c55e','#f59e0b','#3b82f6','#ec4899','#a78bfa','#14b8a6','#ef4444','#eab308'])[1 + floor(random() * 8)::int])
    on conflict (id) do nothing;
  end if;
  update zap_profiles set seen = now() where id = me returning * into p;
  return p;
end $$;

create or replace function public.zap_create_chat(p_group boolean, p_name text, p_emoji text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); cid uuid; other uuid; m uuid; others uuid[];
begin
  others := array(select distinct x from unnest(coalesce(p_members, '{}'::uuid[])) x
                  where x <> me and exists (select 1 from zap_profiles where id = x));
  if not p_group then
    if coalesce(array_length(others, 1), 0) <> 1 then raise exception 'Escolha uma pessoa.'; end if;
    other := others[1];
    select c.id into cid from zap_chats c
     where not c.is_group
       and exists (select 1 from zap_members where chat_id = c.id and user_id = me)
       and exists (select 1 from zap_members where chat_id = c.id and user_id = other)
     limit 1;
    if cid is not null then return cid; end if;
    insert into zap_chats(is_group, created_by) values (false, me) returning id into cid;
    insert into zap_members(chat_id, user_id, role) values (cid, me, 'admin'), (cid, other, 'admin');
    return cid;
  end if;
  if coalesce(array_length(others, 1), 0) > 100 then raise exception 'Gente demais de uma vez.'; end if;
  insert into zap_chats(is_group, name, emoji, code, created_by)
  values (true, left(coalesce(nullif(trim(p_name), ''), 'Grupo da galera'), 40),
          left(coalesce(nullif(p_emoji, ''), '👥'), 16), zap_new_code(), me)
  returning id into cid;
  insert into zap_members(chat_id, user_id, role) values (cid, me, 'admin');
  foreach m in array others loop
    insert into zap_members(chat_id, user_id) values (cid, m) on conflict do nothing;
  end loop;
  perform zap_sys(cid, 'criou o grupo "' || (select name from zap_chats where id = cid) ||
                       '" 🎉 Código de convite: ' || (select code from zap_chats where id = cid));
  return cid;
end $$;

create or replace function public.zap_join(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
        cid uuid; pid uuid;
begin
  select id into cid from zap_chats where code = c and is_group;
  if cid is not null then
    if not exists (select 1 from zap_members where chat_id = cid and user_id = me) then
      insert into zap_members(chat_id, user_id) values (cid, me);
      perform zap_sys(cid, 'entrou pelo código de convite');
    end if;
    return json_build_object('kind', 'chat', 'id', cid);
  end if;
  select id into pid from zap_profiles where code = c;
  if pid is null then raise exception 'Nenhum grupo ou pessoa com esse código.'; end if;
  if pid = me then raise exception 'Esse é o seu próprio código 😅'; end if;
  return json_build_object('kind', 'person', 'id', zap_create_chat(false, '', '', array[pid]));
end $$;

create or replace function public.zap_send(cid uuid, p_text text, p_reply uuid default null)
returns public.zap_messages language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); t text := trim(coalesce(p_text, '')); r jsonb; msg zap_messages;
begin
  if not zap_is_member(cid) then raise exception 'Você não está nessa conversa.'; end if;
  if t = '' then raise exception 'Mensagem vazia.'; end if;
  if (select count(*) from zap_messages where user_id = me and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Calma! Muitas mensagens em pouco tempo.';
  end if;
  if p_reply is not null then
    select jsonb_build_object('id', id, 'by', user_id, 'text', left(text, 160)) into r
      from zap_messages where id = p_reply and chat_id = cid and not deleted;
  end if;
  insert into zap_messages(chat_id, user_id, text, reply) values (cid, me, left(t, 4000), r) returning * into msg;
  update zap_chats set last_text = left(t, 140), last_by = me, last_at = msg.created_at where id = cid;
  update zap_members set last_read_at = msg.created_at where chat_id = cid and user_id = me;
  return msg;
end $$;

create or replace function public.zap_react(mid uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); cid uuid; k text := me::text;
begin
  select chat_id into cid from zap_messages where id = mid and not deleted and not sys;
  if cid is null or not zap_is_member(cid) then raise exception 'Mensagem não encontrada.'; end if;
  if length(coalesce(p_emoji, '')) not between 1 and 16 then raise exception 'Reação inválida.'; end if;
  update zap_messages set reactions = case when reactions ->> k = p_emoji then reactions - k
                                           else reactions || jsonb_build_object(k, p_emoji) end
   where id = mid;
end $$;

create or replace function public.zap_delete_msg(mid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update zap_messages set deleted = true, text = '', reply = null, reactions = '{}'::jsonb
   where id = mid and user_id = zap_need_login() and not sys;
end $$;

create or replace function public.zap_read(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update zap_members m set last_read_at = c.last_at
    from zap_chats c
   where c.id = cid and m.chat_id = cid and m.user_id = zap_need_login() and m.last_read_at < c.last_at;
end $$;

create or replace function public.zap_add_members(cid uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); m uuid; names text := '';
begin
  if not exists (select 1 from zap_members mm join zap_chats c on c.id = mm.chat_id
                  where mm.chat_id = cid and mm.user_id = me and mm.role = 'admin' and c.is_group) then
    raise exception 'Só o admin do grupo pode adicionar pessoas.';
  end if;
  foreach m in array coalesce(p_members, '{}'::uuid[]) loop
    if exists (select 1 from zap_profiles where id = m)
       and not exists (select 1 from zap_members where chat_id = cid and user_id = m) then
      insert into zap_members(chat_id, user_id) values (cid, m);
      names := names || case when names = '' then '' else ', ' end || zap_name(m);
    end if;
  end loop;
  if names <> '' then perform zap_sys(cid, 'adicionou ' || names); end if;
end $$;

create or replace function public.zap_leave(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login();
begin
  if not exists (select 1 from zap_members mm join zap_chats c on c.id = mm.chat_id
                  where mm.chat_id = cid and mm.user_id = me and c.is_group) then return; end if;
  perform zap_sys(cid, 'saiu do grupo');
  delete from zap_members where chat_id = cid and user_id = me;
  if not exists (select 1 from zap_members where chat_id = cid) then
    delete from zap_chats where id = cid;
  elsif not exists (select 1 from zap_members where chat_id = cid and role = 'admin') then
    update zap_members set role = 'admin'
     where chat_id = cid and user_id = (select user_id from zap_members where chat_id = cid order by joined_at limit 1);
  end if;
end $$;

create or replace function public.zap_rename(cid uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := left(trim(coalesce(p_name, '')), 40);
begin
  if n = '' then raise exception 'Nome vazio.'; end if;
  if not exists (select 1 from zap_members where chat_id = cid and user_id = zap_need_login() and role = 'admin') then
    raise exception 'Só o admin pode renomear.';
  end if;
  update zap_chats set name = n where id = cid and is_group;
  perform zap_sys(cid, 'mudou o nome do grupo pra "' || n || '"');
end $$;

create or replace function public.zap_regen_code(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not exists (select 1 from zap_members where chat_id = cid and user_id = zap_need_login() and role = 'admin') then
    raise exception 'Só o admin pode gerar outro código.';
  end if;
  c := zap_new_code();
  update zap_chats set code = c where id = cid and is_group;
  return c;
end $$;

-- ---------- segurança (RLS) ----------
alter table public.zap_profiles enable row level security;
alter table public.zap_chats    enable row level security;
alter table public.zap_members  enable row level security;
alter table public.zap_messages enable row level security;

drop policy if exists zap_profiles_read on public.zap_profiles;
create policy zap_profiles_read on public.zap_profiles for select to authenticated using (true);
drop policy if exists zap_profiles_edit on public.zap_profiles;
create policy zap_profiles_edit on public.zap_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists zap_chats_read on public.zap_chats;
create policy zap_chats_read on public.zap_chats for select to authenticated using (zap_is_member(id));
drop policy if exists zap_members_read on public.zap_members;
create policy zap_members_read on public.zap_members for select to authenticated using (zap_is_member(chat_id));
drop policy if exists zap_messages_read on public.zap_messages;
create policy zap_messages_read on public.zap_messages for select to authenticated using (zap_is_member(chat_id));

revoke all on public.zap_profiles, public.zap_chats, public.zap_members, public.zap_messages from anon, authenticated;
grant select on public.zap_profiles, public.zap_chats, public.zap_members, public.zap_messages to authenticated;
grant update (nick, emoji, color, about, photo) on public.zap_profiles to authenticated;

revoke execute on function public.zap_sys(uuid, text), public.zap_new_code(), public.zap_name(uuid) from public, anon, authenticated;
revoke execute on function public.zap_me(), public.zap_create_chat(boolean, text, text, uuid[]), public.zap_join(text),
  public.zap_send(uuid, text, uuid), public.zap_react(uuid, text), public.zap_delete_msg(uuid), public.zap_read(uuid),
  public.zap_add_members(uuid, uuid[]), public.zap_leave(uuid), public.zap_rename(uuid, text), public.zap_regen_code(uuid)
  from public, anon;
grant execute on function public.zap_me(), public.zap_create_chat(boolean, text, text, uuid[]), public.zap_join(text),
  public.zap_send(uuid, text, uuid), public.zap_react(uuid, text), public.zap_delete_msg(uuid), public.zap_read(uuid),
  public.zap_add_members(uuid, uuid[]), public.zap_leave(uuid), public.zap_rename(uuid, text), public.zap_regen_code(uuid)
  to authenticated;

-- ---------- tempo real ----------
alter table public.zap_messages replica identity full;
alter table public.zap_members  replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.zap_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.zap_members;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.zap_chats;    exception when duplicate_object then null; end;
  end if;
end $$;

-- =====================================================================
--  PARTE 2 — fotos/áudio, notificações, admin, eventos, bloqueios
-- =====================================================================
create extension if not exists pg_net with schema extensions;

alter table public.zap_messages add column if not exists media   jsonb;
alter table public.zap_messages add column if not exists event   jsonb;
alter table public.zap_messages add column if not exists edited  boolean not null default false;
alter table public.zap_messages add column if not exists pushed  boolean not null default false;
alter table public.zap_chats    add column if not exists pinned_id uuid;
alter table public.zap_members  add column if not exists muted   boolean not null default false;

create table if not exists public.zap_blocks (
  user_id    uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
create table if not exists public.zap_push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists zap_push_subs_user_idx on public.zap_push_subs(user_id);
create table if not exists public.zap_config (key text primary key, value text not null);

create or replace function public.zap_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zap_blocks where (user_id = a and blocked_id = b) or (user_id = b and blocked_id = a))
$$;

create or replace function public.zap_is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zap_members where chat_id = cid and user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.zap_dm_other(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from zap_members m join zap_chats c on c.id = m.chat_id
   where m.chat_id = cid and not c.is_group and m.user_id <> auth.uid() limit 1
$$;

-- conversa privada respeita bloqueio
create or replace function public.zap_create_chat(p_group boolean, p_name text, p_emoji text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); cid uuid; other uuid; m uuid; others uuid[];
begin
  others := array(select distinct x from unnest(coalesce(p_members, '{}'::uuid[])) x
                  where x <> me and exists (select 1 from zap_profiles where id = x));
  if not p_group then
    if coalesce(array_length(others, 1), 0) <> 1 then raise exception 'Escolha uma pessoa.'; end if;
    other := others[1];
    select c.id into cid from zap_chats c
     where not c.is_group
       and exists (select 1 from zap_members where chat_id = c.id and user_id = me)
       and exists (select 1 from zap_members where chat_id = c.id and user_id = other)
     limit 1;
    if cid is not null then return cid; end if;
    if zap_blocked_between(me, other) then raise exception 'Não dá pra conversar com essa pessoa.'; end if;
    insert into zap_chats(is_group, created_by) values (false, me) returning id into cid;
    insert into zap_members(chat_id, user_id, role) values (cid, me, 'admin'), (cid, other, 'admin');
    return cid;
  end if;
  if coalesce(array_length(others, 1), 0) > 100 then raise exception 'Gente demais de uma vez.'; end if;
  insert into zap_chats(is_group, name, emoji, code, created_by)
  values (true, left(coalesce(nullif(trim(p_name), ''), 'Grupo da galera'), 40),
          left(coalesce(nullif(p_emoji, ''), '👥'), 16), zap_new_code(), me)
  returning id into cid;
  insert into zap_members(chat_id, user_id, role) values (cid, me, 'admin');
  foreach m in array others loop
    if not zap_blocked_between(me, m) then
      insert into zap_members(chat_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
  perform zap_sys(cid, 'criou o grupo "' || (select name from zap_chats where id = cid) ||
                       '" 🎉 Código de convite: ' || (select code from zap_chats where id = cid));
  return cid;
end $$;

-- enviar: texto, foto ou áudio
drop function if exists public.zap_send(uuid, text, uuid);
create or replace function public.zap_send(cid uuid, p_text text, p_reply uuid default null, p_media jsonb default null)
returns public.zap_messages language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); t text := trim(coalesce(p_text, '')); r jsonb; msg zap_messages;
        md jsonb; kind text; path text; preview text; other uuid;
begin
  if not zap_is_member(cid) then raise exception 'Você não está nessa conversa.'; end if;
  other := zap_dm_other(cid);
  if other is not null and zap_blocked_between(me, other) then raise exception 'Não dá pra mandar mensagem pra essa pessoa.'; end if;
  if p_media is not null then
    kind := p_media ->> 'type'; path := p_media ->> 'path';
    if kind not in ('image', 'audio') or path is null
       or path not like cid::text || '/' || me::text || '/%' or length(path) > 200 then
      raise exception 'Arquivo inválido.';
    end if;
    md := jsonb_build_object('type', kind, 'path', path,
            'w', least(greatest(coalesce((p_media ->> 'w')::int, 0), 0), 10000),
            'h', least(greatest(coalesce((p_media ->> 'h')::int, 0), 0), 10000),
            'dur', least(greatest(coalesce((p_media ->> 'dur')::numeric, 0), 0), 3600));
  end if;
  if t = '' and md is null then raise exception 'Mensagem vazia.'; end if;
  if (select count(*) from zap_messages where user_id = me and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Calma! Muitas mensagens em pouco tempo.';
  end if;
  if p_reply is not null then
    select jsonb_build_object('id', id, 'by', user_id,
             'text', left(coalesce(nullif(text, ''), case media ->> 'type' when 'image' then '📷 Foto' when 'audio' then '🎤 Áudio' else '' end), 160))
      into r from zap_messages where id = p_reply and chat_id = cid and not deleted;
  end if;
  insert into zap_messages(chat_id, user_id, text, reply, media) values (cid, me, left(t, 4000), r, md) returning * into msg;
  preview := case when t <> '' then left(t, 140)
                  when kind = 'image' then '📷 Foto' else '🎤 Áudio' end;
  update zap_chats set last_text = preview, last_by = me, last_at = msg.created_at where id = cid;
  update zap_members set last_read_at = msg.created_at where chat_id = cid and user_id = me;
  return msg;
end $$;

create or replace function public.zap_edit_msg(mid uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_text, '')); m zap_messages;
begin
  select * into m from zap_messages where id = mid and user_id = zap_need_login() and not deleted and not sys;
  if not found then raise exception 'Mensagem não encontrada.'; end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'Só dá pra editar até 15 minutos depois de mandar.'; end if;
  if t = '' then raise exception 'Mensagem vazia.'; end if;
  update zap_messages set text = left(t, 4000), edited = true where id = mid;
  update zap_chats set last_text = left(t, 140) where id = m.chat_id and last_at = m.created_at;
end $$;

create or replace function public.zap_pin(cid uuid, mid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g boolean;
begin
  select is_group into g from zap_chats where id = cid;
  if g is null or not zap_is_member(cid) then raise exception 'Conversa não encontrada.'; end if;
  if g and not zap_is_admin(cid) then raise exception 'Só o admin pode fixar mensagens.'; end if;
  if mid is not null and not exists (select 1 from zap_messages where id = mid and chat_id = cid and not deleted) then
    raise exception 'Mensagem não encontrada.';
  end if;
  update zap_chats set pinned_id = mid where id = cid;
  perform zap_sys(cid, case when mid is null then 'desafixou a mensagem' else 'fixou uma mensagem 📌' end);
end $$;

create or replace function public.zap_kick(cid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from zap_chats where id = cid and is_group) or not zap_is_admin(cid) then
    raise exception 'Só o admin do grupo pode remover pessoas.';
  end if;
  if uid = auth.uid() then raise exception 'Pra sair, use "Sair do grupo".'; end if;
  if not exists (select 1 from zap_members where chat_id = cid and user_id = uid) then return; end if;
  delete from zap_members where chat_id = cid and user_id = uid;
  perform zap_sys(cid, 'removeu ' || zap_name(uid));
end $$;

create or replace function public.zap_set_admin(cid uuid, uid uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from zap_chats where id = cid and is_group) or not zap_is_admin(cid) then
    raise exception 'Só o admin pode mudar admins.';
  end if;
  if not p_admin and (select count(*) from zap_members where chat_id = cid and role = 'admin' and user_id <> uid) = 0 then
    raise exception 'O grupo precisa de pelo menos um admin.';
  end if;
  update zap_members set role = case when p_admin then 'admin' else 'member' end where chat_id = cid and user_id = uid;
  if found then
    perform zap_sys(cid, case when p_admin then 'tornou ' || zap_name(uid) || ' admin 👑' else 'tirou o admin de ' || zap_name(uid) end);
  end if;
end $$;

create or replace function public.zap_mute(cid uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update zap_members set muted = coalesce(p_muted, false) where chat_id = cid and user_id = zap_need_login();
end $$;

create or replace function public.zap_block(uid uuid, p_block boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login();
begin
  if uid = me then raise exception 'Não dá pra bloquear você mesmo 😅'; end if;
  if p_block then
    insert into zap_blocks(user_id, blocked_id) values (me, uid) on conflict do nothing;
  else
    delete from zap_blocks where user_id = me and blocked_id = uid;
  end if;
end $$;

create or replace function public.zap_event(cid uuid, p_kind text, p_text text default '') returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); t text := left(trim(coalesce(p_text, '')), 60);
        labels jsonb := '{"danca":"🕺 Dança","confete":"🎉 Confete","fogos":"🎆 Fogos","chuva":"🌧️ Chuva de emoji","terremoto":"💥 Terremoto","parabens":"🎂 Parabéns","gol":"⚽ Gol","alerta":"🚨 Alerta","coracao":"💜 Corações"}';
begin
  if not zap_is_member(cid) then raise exception 'Você não está nessa conversa.'; end if;
  if exists (select 1 from zap_chats where id = cid and is_group) and not zap_is_admin(cid) then
    raise exception 'Só os admins do grupo podem soltar eventos.';
  end if;
  if not labels ? p_kind then raise exception 'Evento desconhecido.'; end if;
  if exists (select 1 from zap_messages where chat_id = cid and event is not null and created_at > now() - interval '8 seconds') then
    raise exception 'Calma! Espera o evento anterior acabar.';
  end if;
  insert into zap_messages(chat_id, user_id, text, sys, event)
  values (cid, me, 'soltou o evento ' || (labels ->> p_kind) || case when t <> '' then ': "' || t || '"' else '' end,
          true, jsonb_build_object('kind', p_kind, 'text', t));
  update zap_chats set last_text = 'soltou ' || (labels ->> p_kind), last_by = me, last_at = now() where id = cid;
end $$;

create or replace function public.zap_save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Endereço inválido.'; end if;
  insert into zap_push_subs(endpoint, user_id, p256dh, auth) values (p_endpoint, zap_need_login(), left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.zap_del_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from zap_push_subs where endpoint = p_endpoint and user_id = auth.uid()
$$;

create or replace function public.zap_delete_me() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); c record;
begin
  for c in select chat_id from zap_members m join zap_chats z on z.id = m.chat_id where m.user_id = me and z.is_group loop
    perform zap_leave(c.chat_id);
  end loop;
  delete from zap_members where user_id = me;
  delete from zap_push_subs where user_id = me;
  delete from zap_blocks where user_id = me or blocked_id = me;
  delete from zap_profiles where id = me;
end $$;

-- avisa a Vercel quando chega mensagem nova (para a notificação no celular)
create or replace function public.zap_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare u text;
begin
  if new.sys and new.event is null then return new; end if;
  select value into u from zap_config where key = 'push_url';
  if u is not null then
    perform net.http_post(url := u, body := jsonb_build_object('id', new.id),
                          headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 4000);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists zap_notify_trg on public.zap_messages;
create trigger zap_notify_trg after insert on public.zap_messages for each row execute function public.zap_notify();

-- fotos e áudios (Supabase Storage), só para quem está na conversa
create or replace function public.zap_media_ok(p_name text, p_upload boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  if not zap_is_member(parts[1]::uuid) then return false; end if;
  if p_upload and parts[2] <> auth.uid()::text then return false; end if;
  return true;
exception when others then return false;
end $$;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('zap-media', 'zap-media', false, 10485760,
            array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/aac'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    drop policy if exists zap_media_read on storage.objects;
    create policy zap_media_read on storage.objects for select to authenticated
      using (bucket_id = 'zap-media' and public.zap_media_ok(name, false));
    drop policy if exists zap_media_upload on storage.objects;
    create policy zap_media_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'zap-media' and public.zap_media_ok(name, true));
  end if;
end $$;

-- segurança das partes novas
alter table public.zap_blocks    enable row level security;
alter table public.zap_push_subs enable row level security;
alter table public.zap_config    enable row level security;
drop policy if exists zap_blocks_read on public.zap_blocks;
create policy zap_blocks_read on public.zap_blocks for select to authenticated using (user_id = auth.uid());
revoke all on public.zap_blocks, public.zap_push_subs, public.zap_config from anon, authenticated;
grant select on public.zap_blocks to authenticated;
grant select (nick, emoji, color, about, photo, code, username, id, seen, created_at) on public.zap_profiles to authenticated;

revoke execute on function public.zap_blocked_between(uuid, uuid), public.zap_dm_other(uuid), public.zap_notify(),
  public.zap_media_ok(text, boolean) from public, anon;
grant execute on function public.zap_media_ok(text, boolean) to authenticated;
revoke execute on function public.zap_send(uuid, text, uuid, jsonb), public.zap_edit_msg(uuid, text), public.zap_pin(uuid, uuid),
  public.zap_kick(uuid, uuid), public.zap_set_admin(uuid, uuid, boolean), public.zap_mute(uuid, boolean),
  public.zap_block(uuid, boolean), public.zap_event(uuid, text, text), public.zap_save_push(text, text, text),
  public.zap_del_push(text), public.zap_delete_me(), public.zap_is_admin(uuid) from public, anon;
grant execute on function public.zap_send(uuid, text, uuid, jsonb), public.zap_edit_msg(uuid, text), public.zap_pin(uuid, uuid),
  public.zap_kick(uuid, uuid), public.zap_set_admin(uuid, uuid, boolean), public.zap_mute(uuid, boolean),
  public.zap_block(uuid, boolean), public.zap_event(uuid, text, text), public.zap_save_push(text, text, text),
  public.zap_del_push(text), public.zap_delete_me(), public.zap_is_admin(uuid) to authenticated;
revoke execute on function public.zap_create_chat(boolean, text, text, uuid[]) from public, anon;
grant execute on function public.zap_create_chat(boolean, text, text, uuid[]) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.zap_chats; exception when duplicate_object then null; end;
  end if;
end $$;
alter table public.zap_chats replica identity full;
-- =====================================================================
--  PARTE 3 — chamadas de voz e vídeo
--  (o áudio/vídeo vai direto entre os aparelhos; o banco só avisa que tem chamada)
-- =====================================================================
create or replace function public.zap_call(cid uuid, p_video boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := zap_need_login(); g boolean; o uuid;
begin
  select is_group into g from zap_chats where id = cid;
  if g is null or not zap_is_member(cid) then raise exception 'Conversa não encontrada.'; end if;
  if not g then
    o := zap_dm_other(cid);
    if o is not null and zap_blocked_between(me, o) then raise exception 'Não dá pra ligar pra essa pessoa.'; end if;
  end if;
  -- alguém acabou de ligar nessa conversa: não toca de novo, só entra
  if exists (select 1 from zap_messages where chat_id = cid and event ? 'call' and created_at > now() - interval '15 seconds') then
    return;
  end if;
  insert into zap_messages(chat_id, user_id, text, sys, event)
  values (cid, me, case when p_video then 'começou uma chamada de vídeo 📹' else 'começou uma chamada de voz 📞' end,
          true, jsonb_build_object('call', true, 'video', coalesce(p_video, false), 'kind', 'chamada'));
  update zap_chats set last_text = case when p_video then '📹 Chamada de vídeo' else '📞 Chamada de voz' end,
         last_by = me, last_at = now() where id = cid;
end $$;
revoke all on function public.zap_call(uuid, boolean) from public, anon;
grant execute on function public.zap_call(uuid, boolean) to authenticated;
