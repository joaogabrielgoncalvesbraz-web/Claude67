\set ON_ERROR_STOP 1
-- dados: 3 usuários, grupo G1 com JG e Bernardo; Enzo fora
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('33333333-3333-3333-3333-333333333333');
insert into public.profiles(id,username,display_name) values
 ('11111111-1111-1111-1111-111111111111','jg','JG'),('22222222-2222-2222-2222-222222222222','bernardo','Bernardo'),('33333333-3333-3333-3333-333333333333','enzo','Enzo');
insert into public.groups(id,name,invite_code,owner_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','G1','ABCDEFGH','11111111-1111-1111-1111-111111111111');
insert into public.group_members(group_id,user_id,role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','admin'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','member');
insert into public.messages(group_id,sender_type,user_id,content) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','human','11111111-1111-1111-1111-111111111111','Bernardo, você é rico demais KKKKK');
insert into public.personalities(user_id,ai_name) values ('22222222-2222-2222-2222-222222222222','IA do Bernardo');
insert into public.api_keys(user_id,provider,ciphertext,iv,auth_tag,last4) values ('22222222-2222-2222-2222-222222222222','anthropic','x','y','z','abcd');
insert into public.ai_runs(group_id, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','running');

set role authenticated;
-- JG (membro)
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'JG vê mensagens do grupo: ' || count(*) from public.messages;
select 'JG vê perfis (ele + Bernardo): ' || count(*) from public.profiles;
select 'JG vê personalidade do Bernardo (deve ser 0): ' || count(*) from public.personalities;
select 'JG pode usar canal realtime do grupo: ' || public.can_use_group_topic('group:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- Enzo (fora do grupo)
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'Enzo vê mensagens (deve ser 0): ' || count(*) from public.messages;
select 'Enzo vê grupo (deve ser 0): ' || count(*) from public.groups;
select 'Enzo pode usar canal (deve ser f): ' || public.can_use_group_topic('group:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select 'Tópico malicioso (deve ser f): ' || public.can_use_group_topic('group:x''; drop table x;--');
-- Bernardo tenta ler a própria chave (deve falhar: sem permissão)
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'Bernardo vê a própria personalidade: ' || count(*) from public.personalities;
do $$ begin perform * from public.api_keys; raise notice 'FALHA: leu api_keys'; exception when insufficient_privilege then raise notice 'OK: api_keys bloqueada para o cliente'; end $$;
do $$ begin insert into public.messages(group_id,sender_type,user_id,content) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ai','22222222-2222-2222-2222-222222222222','fake'); raise notice 'FALHA: cliente inseriu mensagem'; exception when insufficient_privilege then raise notice 'OK: cliente não escreve direto (só via API)'; end $$;
do $$ begin perform public.acquire_ai_lock('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10); raise notice 'FALHA: cliente pegou a trava'; exception when insufficient_privilege then raise notice 'OK: trava só no servidor'; end $$;
reset role;
-- trava atômica: primeira pega, segunda não
select 'trava 1: ' || public.acquire_ai_lock('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 30);
select 'trava 2 (deve ser f): ' || public.acquire_ai_lock('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 30);
-- busca full-text em português
select 'busca "rico": ' || count(*) from public.messages where fts @@ to_tsquery('portuguese','ricos | dinheiro');
