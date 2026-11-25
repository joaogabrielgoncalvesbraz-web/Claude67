"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, TopBar, useToast, Spinner } from "@/components/ui";
import { api } from "@/lib/fetcher";

interface G { id: string; name: string; invite_code: string; role: string }

export default function GroupsPage() {
  const [groups, setGroups] = useState<G[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("Os 3 Mosqueteiros");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<G | null>(null);
  const toast = useToast();
  const router = useRouter();

  const load = () => api<{ groups: G[] }>("/api/groups").then((r) => setGroups(r.groups)).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ group: G }>("/api/groups", { body: { name } });
      setCreateOpen(false);
      setCreated(r.group);
      load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function join() {
    setBusy(true);
    try {
      const r = await api<{ group: G }>("/api/groups/join", { body: { code } });
      router.push(`/g/${r.group.id}`);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  async function logout() {
    await api("/api/auth/logout", { body: {} });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl">
      <TopBar title={<span>AI <span className="text-accent">FRIENDS</span></span>} right={<Button variant="ghost" onClick={logout}>Sair</Button>} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/studio"><Card className="h-full hover:border-accent"><div className="text-2xl">🎭</div><div className="font-bold">Personality Studio</div><div className="text-xs text-slate-400">Crie a personalidade da sua IA</div></Card></Link>
          <Link href="/settings"><Card className="h-full hover:border-accent"><div className="text-2xl">🔑</div><div className="font-bold">Configurações de IA</div><div className="text-xs text-slate-400">Provedor, chave, modelo e limites</div></Card></Link>
        </div>

        <div className="flex items-center justify-between pt-2">
          <h2 className="text-lg font-bold">Seus grupos</h2>
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setJoinOpen(true)}>Entrar com código</Button>
            <Button onClick={() => setCreateOpen(true)}>+ Criar</Button>
          </div>
        </div>

        {groups === null ? <div className="flex justify-center p-8"><Spinner /></div> : groups.length === 0 ? (
          <Card className="text-center text-sm text-slate-400">
            <p className="mb-2 text-3xl">👥</p>
            Nenhum grupo ainda. Crie um e mande o código para seus amigos, ou entre com o código que te mandaram.
          </Card>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <Link key={g.id} href={`/g/${g.id}`}>
                <Card className="mb-2 flex items-center gap-3 hover:border-accent">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 text-xl">💬</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{g.name}</div>
                    <div className="text-xs text-slate-400">{g.role === "admin" ? "👑 Admin" : "Membro"} · código {g.invite_code}</div>
                  </div>
                  <span className="text-slate-500">›</span>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <Card className="text-sm text-slate-300">
          <b>Como funciona:</b>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
            <li>Crie um grupo e mande o código de convite aos amigos.</li>
            <li>Cada um configura a própria IA no Personality Studio.</li>
            <li>Cada um cadastra a própria chave de API em Configurações de IA.</li>
            <li>Conversem! As IAs participam, debatem e zoam entre si.</li>
          </ol>
        </Card>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Criar grupo">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nome do grupo" />
        <Button className="mt-3 w-full" onClick={create} loading={busy}>Criar grupo</Button>
      </Modal>
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Entrar em um grupo">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" className="text-center text-xl tracking-[.3em]" maxLength={12} />
        <Button className="mt-3 w-full" onClick={join} loading={busy}>Entrar</Button>
      </Modal>
      <Modal open={!!created} onClose={() => setCreated(null)} title="Grupo criado! 🎉">
        <p className="mb-3 text-sm text-slate-300">Mande este código para seus amigos:</p>
        <div className="mb-3 rounded-xl bg-bg-soft p-4 text-center font-mono text-3xl font-black tracking-[.3em] text-accent-soft">{created?.invite_code}</div>
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={() => { navigator.clipboard?.writeText(created!.invite_code); toast("Código copiado!", "ok"); }}>Copiar</Button>
          <Button className="flex-1" onClick={() => router.push(`/g/${created!.id}`)}>Abrir grupo</Button>
        </div>
      </Modal>
    </main>
  );
}
