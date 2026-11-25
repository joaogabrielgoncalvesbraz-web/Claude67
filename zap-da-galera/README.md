# 💬 Zap da Galera

Um WhatsApp só da turma, no mesmo estilo do **AI FRIENDS**, mas sem IA: só vocês conversando.

**O que tem:** conta com usuário + senha · conversas privadas e grupos · código de convite para grupos e código pessoal para chamar alguém no privado · responder, reagir, apagar pra todos · ✓✓ azul quando leram · "digitando…" e online · foto de perfil, emoji, cor e tema · funciona no celular (dá para "Adicionar à tela inicial").

**Como é feito:** página estática (`index.html`) + 2 funçõezinhas da Vercel (`api/config.js` e `api/signup.js`) + Supabase (banco, login e tempo real). Toda escrita no banco passa por funções com checagem de permissão; ninguém lê conversa de que não participa (RLS).

## 🚀 Colocar no ar (uns 10 minutos)

### 1. Banco (Supabase)
Pode usar **o mesmo projeto do AI FRIENDS** (as tabelas daqui começam com `zap_` e não mexem em nada de lá). Assim quem já tem conta no AI FRIENDS entra no Zap com o mesmo usuário e senha.

1. Abra o projeto em supabase.com → **SQL Editor** → **New query**.
2. Cole **todo** o arquivo `supabase.sql` e clique em **Run**. (Pode rodar de novo sem problema.)
3. Em **Project Settings → API**, copie `Project URL`, `anon public` e `service_role` (secreta).

### 2. Site (Vercel)
1. Em vercel.com → **Add New… → Project** → escolha o repositório **Claude67**.
2. Em **Root Directory**, clique em **Edit** e escolha a pasta **`zap-da-galera`**. Framework: **Other**.
3. Em **Environment Variables**, coloque:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | o Project URL |
| `SUPABASE_ANON_KEY` | a chave anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role (**secreta**) |
| `AUTH_EMAIL_DOMAIN` | *(opcional)* o mesmo valor do AI FRIENDS, se você mudou lá |

4. Clique em **Deploy**. Pronto: o link que a Vercel mostrar é o seu Zap.

### 3. Usar
1. Abra o link → **Criar conta** (usuário + senha).
2. ✏️ → **Criar grupo** → mande o **código** pra galera.
3. Os amigos criam conta e tocam em 🔑 para colar o código.
4. Para falar no privado: toque no nome de alguém no grupo, ou cole o código pessoal da pessoa no 🔑.
