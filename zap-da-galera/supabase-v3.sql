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
