"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";
import type { GroupSettings, MemberAi } from "@/lib/types";
import { Avatar, Button, Card, Input, Label, Spinner, Toggle, TopBar, useToast } from "@/components/ui";

interface Info { group: { id: string; name: string; invite_code: string; settings: GroupSettings }; members: MemberAi[]; me: { role: string; user_id: string } }
type Usage = Record<string, { calls: number; input: number; output: number; cost: number | null }>;

const SETTING_FIELDS: { key: keyof GroupSettings; label: string; hint: string }[] = [
  { key: "max_ai_chain", label: "Limite de turnos IA↔IA", hint: "Quantas respostas seguidas entre IAs após uma mensagem humana (0 = IAs não respondem umas às outras)" },
  { key: "max_responders", label: "Máx. de IAs por mensagem", hint: "Quantas IAs podem reagir espontaneamente a uma mensagem humana" },
  { key: "human_msgs_per_minute", label: "Mensagens humanas por minuto", hint: "Anti-spam por pessoa" },
  { key: "ai_msgs_per_hour", label: "Mensagens de IA por hora (grupo)", hint: "Freio geral de custo e spam" },
  { key: "free_default_turns", label: "Conversa livre: turnos padrão", hint: "" },
  { key: "free_default_minutes", label: "Conversa livre: duração padrão (min)", hint: "" },
  { key: "max_free_turns", label: "Conversa livre: máximo de turnos", hint: "Ninguém consegue passar disso" },
];

export default function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<GroupSettings | null>(null);

  async function load() {
    try {
      const r = await api<Info>(`/api/groups/${id}`);
      if (r.me.role !== "admin") { toast("Apenas o admin acessa este painel.", "error"); router.replace(`/g/${id}`); return; }
      setInfo(r); setName(r.group.name); setSettings(r.group.settings);
      api<{ perUser: Usage }>(`/api/groups/${id}/usage`).then((u) => setUsage(u.perUser)).catch(() => {});
    } catch (e) { toast((e as Error).message, "error"); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchGroup(body: object, msg: string) {
    try { await api(`/api/groups/${id}`, { method: "PATCH", body }); toast(msg, "ok"); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function patchMember(uid: string, body: object) {
    try { await api(`/api/groups/${id}/members/${uid}`, { method: "PATCH", body }); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function removeMember(m: MemberAi) {
    if (!confirm(`Remover ${m.display_name} do grupo?`)) return;
    try { await api(`/api/groups/${id}/members/${m.user_id}`, { method: "DELETE" }); toast("Removido.", "ok"); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function adminAction(action: string, question: string, msg: string) {
    if (!confirm(question)) return;
    try { await api(`/api/groups/${id}/admin`, { body: { action } }); toast(msg, "ok"); } catch (e) { toast((e as Error).message, "error"); }
  }

  if (!info || !settings) return <main><TopBar title="👑 Admin" back={`/g/${id}`} /><div className="flex justify-center p-10"><Spinner /></div></main>;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl pb-10">
      <TopBar title="👑 Painel do administrador" back={`/g/${id}`} />
      <div className="space-y-4 p-4">
        <Card className="space-y-3">
          <Label>Nome do grupo</Label>
          <div className="flex gap-2">
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Button disabled={!name.trim() || name === info.group.name} onClick={() => patchGroup({ name }, "Nome alterado.")}>Salvar</Button>
          </div>
          <Label hint="Mande para seus amigos entrarem. Gerar outro invalida o antigo.">Convite</Label>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-xl bg-bg-soft p-2 text-center font-mono text-xl font-black tracking-[.25em] text-accent-soft">{info.group.invite_code}</span>
            <Button variant="soft" onClick={() => { navigator.clipboard?.writeText(info.group.invite_code); toast("Copiado!", "ok"); }}>Copiar</Button>
            <Button variant="soft" onClick={() => confirm("Gerar um novo código?") && patchGroup({ regenerateCode: true }, "Novo código gerado.")}>Novo</Button>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="font-bold">Participantes e IAs</div>
          <p className="text-xs text-slate-400">Você pode ligar/desligar a IA de alguém neste grupo, mas não pode ver nem mudar a personalidade, a chave ou o modelo dela.</p>
          {info.members.map((m) => {
            const u = usage?.[m.user_id];
            return (
              <div key={m.user_id} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex items-center gap-3">
                  <Avatar emoji={m.avatar_emoji} color={m.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{m.display_name} {m.role === "admin" && "👑"}</div>
                    <div className="text-xs text-slate-400">@{m.username} · IA: {m.ai_name ?? "—"} {m.ai_ready ? "✅" : `(${m.ai_ready_reason})`}</div>
                  </div>
                </div>
                <Toggle label="IA ativa neste grupo" checked={m.ai_enabled} onChange={(v) => patchMember(m.user_id, { ai_enabled: v })} />
                <div className="flex gap-2">
                  <Input placeholder="Apelido no grupo" defaultValue={m.nickname ?? ""} maxLength={30} onBlur={(e) => e.target.value !== (m.nickname ?? "") && patchMember(m.user_id, { nickname: e.target.value || null })} />
                </div>
                <div className="text-xs text-slate-500">
                  Consumo neste grupo (30 dias): {u ? `${u.calls} chamadas · ${(u.input + u.output).toLocaleString("pt-BR")} tokens${u.cost != null ? ` · ~US$ ${u.cost.toFixed(4)}` : ""}` : "nenhum"}
                </div>
                {m.user_id !== info.me.user_id && (
                  <div className="flex gap-2">
                    <Button variant="soft" className="py-1.5 text-xs" onClick={() => patchMember(m.user_id, { role: m.role === "admin" ? "member" : "admin" })}>
                      {m.role === "admin" ? "Tirar admin" : "Tornar admin"}
                    </Button>
                    <Button variant="danger" className="py-1.5 text-xs" onClick={() => removeMember(m)}>Remover</Button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Card className="space-y-3">
          <div className="font-bold">Limites e Conversa Livre</div>
          {SETTING_FIELDS.map((f) => (
            <div key={f.key}>
              <Label hint={f.hint}>{f.label}</Label>
              <Input type="number" min={0} value={settings[f.key]} onChange={(e) => setSettings({ ...settings, [f.key]: Number(e.target.value) })} />
            </div>
          ))}
          <Button onClick={() => patchGroup({ settings }, "Limites salvos.")}>Salvar limites</Button>
        </Card>

        <Card className="space-y-2">
          <div className="font-bold">Histórico e memória</div>
          <Button variant="soft" className="w-full" onClick={() => adminAction("reset_memory", "Apagar a memória de longo prazo das IAs? (as mensagens continuam visíveis)", "Memória reiniciada.")}>🧠 Limpar memória das IAs</Button>
          <Button variant="danger" className="w-full" onClick={() => adminAction("clear_history", "Apagar TODAS as mensagens do grupo para todos? Não dá para desfazer.", "Histórico limpo.")}>🧹 Limpar histórico</Button>
          <Button variant="danger" className="w-full" onClick={() => adminAction("restart", "Reiniciar a conversa do zero (mensagens, memória e rodadas de IA)? Não dá para desfazer.", "Conversa reiniciada.")}>🔄 Reiniciar conversa</Button>
        </Card>
      </div>
    </main>
  );
}
