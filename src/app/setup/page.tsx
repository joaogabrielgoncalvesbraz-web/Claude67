export default function Setup() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-3 text-2xl font-bold">⚙️ AI FRIENDS ainda não foi configurado</h1>
      <p className="mb-4 text-slate-300">
        As variáveis de ambiente do Supabase não foram encontradas. Copie <code>.env.example</code> para <code>.env.local</code>,
        preencha com os dados do seu projeto Supabase e reinicie o servidor. Veja o passo a passo no <code>README.md</code>.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-bg-card p-4 text-xs">{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...`}</pre>
    </main>
  );
}
