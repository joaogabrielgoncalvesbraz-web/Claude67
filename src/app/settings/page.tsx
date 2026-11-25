"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { PROVIDER_KEY_URL, PROVIDER_LABEL } from "@/lib/providers";
import type { Provider } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import {
  AVATARS, Avatar, Button, Card, ColorPicker, CostNotice, EmojiGrid, Input, Label, Modal, Spinner, Toggle, TopBar, cx, setTheme, useToast,
} from "@/components/ui";

interface KeyInfo { provider: Provider; last4: string; status: "ok" | "error" | "untested"; last_error: string | null; models: string[]; last_tested_at: string | null }
interface Snapshot {
  messagesToday: number; tokensToday: number; costMonth: number | null; percent: number; blocked: boolean; reason: string | null;
  limits: { maxMessagesPerDay: number; dailyTokenLimit: number; monthlyBudgetUsd: number | null; warnPercent: number };
}
interface Settings {
  provider: Provider | null; model: string | null; enabled: boolean; max_messages_per_day: number; daily_token_limit: number;
  monthly_budget_usd: number | null; price_input_per_m: number | null; price_output_per_m: number | null; max_output_tokens: number;
  warn_percent: number; disable_on_limit: boolean;
}
interface Profile { display_name: string; avatar_emoji: string; color: string; theme: string; username: string }

const THEMES: { key: string; label: string; color: string }[] = [
  { key: "roxo", label: "Roxo", color: "#7c5cff" }, { key: "azul", label: "Azul", color: "#3b82f6" },
  { key: "verde", label: "Verde", color: "#22c55e" }, { key: "laranja", label: "Laranja", color: "#f97316" }, { key: "rosa", label: "Rosa", color: "#ec4899" },
];

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [usage, setUsage] = useState<{ snapshot: Snapshot; days: Record<string, { calls: number; tokens: number; cost: number | null }>; recent: any[] } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Provider>("openai");
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);

  async function load() {
    try {
      const [s, u, p] = await Promise.all([
        api<{ settings: Settings; keys: KeyInfo[] }>("/api/ai-settings"),
        api("/api/usage"),
        api<{ profile: Profile }>("/api/profile"),
      ]);
      setSettings(s.settings);
      setKeys(s.keys);
      setUsage(u);
      setProfile(p.profile);
      if (s.settings?.provider) setTab((t) => (s.keys.some((k) => k.provider === t) ? t : s.settings.provider!));
    } catch (e) { toast((e as Error).message, "error"); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(body: Partial<Settings>, msg = "Salvo.") {
    try {
      const r = await api<{ settings: Settings }>("/api/ai-settings", { method: "PATCH", body });
      setSettings(r.settings);
      toast(msg, "ok");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function saveKey() {
    setBusy("save");
    try {
      const r = await api<KeyInfo>("/api/ai-keys", { body: { provider: tab, key: keyInput.trim() } });
      setKeyInput("");
      toast(r.status === "ok" ? `Chave salva e funcionando! ${r.models.length} modelos disponíveis.` : `Chave salva, mas o teste falhou: ${r.last_error}`, r.status === "ok" ? "ok" : "error");
      await load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  }
  async function testKey(withModel: boolean) {
    setBusy(withModel ? "model" : "test");
    try {
      const r = await api<{ models: string[]; sample: string | null }>("/api/ai-keys/test", {
        body: { provider: tab, model: withModel ? settings?.model ?? undefined : undefined },
      });
      toast(withModel ? `Modelo respondeu: “${r.sample}”` : `Conexão OK — ${r.models.length} modelos.`, "ok");
      await load();
    } catch (e) { toast((e as Error).message, "error"); await load(); } finally { setBusy(null); }
  }
  async function removeKey() {
    if (!confirm(`Remover a chave da ${PROVIDER_LABEL[tab]}?`)) return;
    try { await api(`/api/ai-keys?provider=${tab}`, { method: "DELETE" }); toast("Chave removida.", "ok"); await load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function saveProfile(p: Partial<Profile>) {
    try {
      const r = await api<{ profile: Profile }>("/api/profile", { method: "PATCH", body: p });
      setProfile(r.profile);
      if (p.theme) setTheme(p.theme);
      toast("Perfil salvo.", "ok");
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (!settings || !profile) return <main><TopBar title="🔑 Configurações" back="/groups" /><div className="flex justify-center p-10"><Spinner /></div></main>;

  const key = keys.find((k) => k.provider === tab);
  const activeKey = keys.find((k) => k.provider === settings.provider);
  const models = activeKey?.models ?? [];
  const snap = usage?.snapshot;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl pb-10">
      <TopBar title="🔑 Configurações de IA" back="/groups" />
      <div className="space-y-4 p-4">
        <CostNotice />

        {/* ------------------------------------------------ status geral */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">Status da sua IA</div>
              <div className="text-sm text-slate-400">
                {!settings.provider ? "Escolha um provedor e cadastre a chave." :
                  !activeKey ? `Cadastre a chave da ${PROVIDER_LABEL[settings.provider]}.` :
                  !settings.model ? "Escolha um modelo." :
                  snap?.blocked ? `Pausada: ${snap.reason}` :
                  settings.enabled ? `✅ Ativa: ${PROVIDER_LABEL[settings.provider]} · ${settings.model}` : "Desligada"}
              </div>
            </div>
            <Toggle checked={settings.enabled} onChange={(v) => patch({ enabled: v }, v ? "IA ligada." : "IA desligada.")} />
          </div>
        </Card>

        {/* ------------------------------------------------ chaves */}
        <Card className="space-y-3">
          <div className="font-bold">1. Chaves de API</div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg-soft p-1">
            {PROVIDERS.map((p) => {
              const k = keys.find((x) => x.provider === p);
              return (
                <button key={p} onClick={() => setTab(p)} className={cx("rounded-lg py-2 text-xs font-semibold sm:text-sm", tab === p ? "bg-accent text-white" : "text-slate-400")}>
                  {PROVIDER_LABEL[p].split(" ")[0]} {k ? (k.status === "ok" ? "✅" : k.status === "error" ? "⚠️" : "•") : ""}
                </button>
              );
            })}
          </div>
          {key ? (
            <div className="rounded-xl bg-bg-soft p-3 text-sm">
              <div>Chave salva: <span className="font-mono">••••{key.last4}</span></div>
              <div className={key.status === "ok" ? "text-green-400" : key.status === "error" ? "text-red-300" : "text-slate-400"}>
                {key.status === "ok" ? "● Conexão funcionando" : key.status === "error" ? `● Erro: ${key.last_error}` : "● Não testada"}
              </div>
              {key.last_tested_at && <div className="text-xs text-slate-500">Último teste: {new Date(key.last_tested_at).toLocaleString("pt-BR")}</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="soft" loading={busy === "test"} onClick={() => testKey(false)}>Testar conexão</Button>
                <Button variant="danger" onClick={removeKey}>Remover</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line p-3 text-sm text-slate-300">
              <b>Como conseguir sua chave da {PROVIDER_LABEL[tab]}:</b>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-slate-400">
                <li>Acesse <a className="text-accent-soft underline" href={PROVIDER_KEY_URL[tab]} target="_blank" rel="noreferrer">{PROVIDER_KEY_URL[tab].replace("https://", "")}</a> e entre na sua conta.</li>
                <li>Crie uma nova chave de API e copie.</li>
                <li>{tab === "gemini" ? "O Google oferece um nível gratuito limitado em algumas regiões/modelos; acima disso é cobrado." : "Adicione créditos/forma de pagamento na plataforma de API (é separado da assinatura do app)."}</li>
                <li>Cole abaixo. Ela é criptografada no servidor e nunca mais aparece no navegador.</li>
              </ol>
            </div>
          )}
          <div className="flex gap-2">
            <Input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={key ? "Colar nova chave para substituir" : "Cole sua chave de API aqui"} />
            <Button loading={busy === "save"} disabled={keyInput.trim().length < 10} onClick={saveKey}>Salvar</Button>
          </div>
        </Card>

        {/* ------------------------------------------------ provedor/modelo */}
        <Card className="space-y-3">
          <div className="font-bold">2. Provedor e modelo da sua IA</div>
          <div>
            <Label>Provedor</Label>
            <select value={settings.provider ?? ""} onChange={(e) => patch({ provider: (e.target.value || null) as Provider | null }, "Provedor alterado. Escolha o modelo.")}
              className="w-full rounded-xl border border-line bg-bg-soft px-3 py-2.5">
              <option value="">— escolha —</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]} {keys.some((k) => k.provider === p) ? "" : "(sem chave)"}</option>)}
            </select>
          </div>
          {settings.provider && (
            <div>
              <Label hint={models.length ? "Lista carregada da sua conta no provedor." : "Teste a conexão para carregar a lista, ou digite o nome do modelo."}>Modelo</Label>
              {models.length > 0 && (
                <select value={settings.model ?? ""} onChange={(e) => patch({ model: e.target.value || null }, "Modelo salvo.")}
                  className="mb-2 w-full rounded-xl border border-line bg-bg-soft px-3 py-2.5">
                  <option value="">— escolha —</option>
                  {settings.model && !models.includes(settings.model) && <option value={settings.model}>{settings.model}</option>}
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="ou digite o ID do modelo" />
                <Button variant="soft" disabled={!customModel.trim()} onClick={() => { patch({ model: customModel.trim() }, "Modelo salvo."); setCustomModel(""); }}>Usar</Button>
              </div>
              {settings.model && activeKey && (
                <Button variant="soft" className="mt-2" loading={busy === "model"} onClick={() => { setTab(settings.provider!); testKey(true); }}>
                  Testar modelo “{settings.model}” (gasta poucos tokens)
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------ limites */}
        <Card className="space-y-3">
          <div className="font-bold">3. Limites e controle de custos</div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Mensagens por dia" value={settings.max_messages_per_day} onSave={(v) => patch({ max_messages_per_day: v ?? 200 })} />
            <NumField label="Tokens por dia" value={settings.daily_token_limit} onSave={(v) => patch({ daily_token_limit: v ?? 300000 })} />
            <NumField label="Tamanho máx. da resposta (tokens)" value={settings.max_output_tokens} onSave={(v) => patch({ max_output_tokens: v ?? 400 })} />
            <NumField label="Avisar ao atingir (%)" value={settings.warn_percent} onSave={(v) => patch({ warn_percent: v ?? 80 })} />
          </div>
          <div className="rounded-xl bg-bg-soft p-3">
            <Label hint="Confira os preços atuais na página do seu provedor e informe aqui (US$ por 1 milhão de tokens). Sem isso, o app mostra só tokens, sem estimar dinheiro.">Preços do seu modelo (para estimar gastos)</Label>
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Entrada US$/1M" step="0.01" value={settings.price_input_per_m} onSave={(v) => patch({ price_input_per_m: v })} />
              <NumField label="Saída US$/1M" step="0.01" value={settings.price_output_per_m} onSave={(v) => patch({ price_output_per_m: v })} />
              <NumField label="Orçamento/mês US$" step="0.5" value={settings.monthly_budget_usd} onSave={(v) => patch({ monthly_budget_usd: v })} />
            </div>
          </div>
          <Toggle label="Desativar minha IA automaticamente ao atingir um limite" checked={settings.disable_on_limit} onChange={(v) => patch({ disable_on_limit: v })} />
          <p className="text-xs text-slate-500">Os limites aqui são controlados pelo AI FRIENDS. Para um teto garantido de cobrança, configure também limites de gasto direto no painel do provedor.</p>
        </Card>

        {/* ------------------------------------------------ uso */}
        {snap && (
          <Card className="space-y-3">
            <div className="font-bold">4. Seu consumo</div>
            {snap.percent >= snap.limits.warnPercent && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">⚠️ Consumo elevado: {snap.percent}% de um dos seus limites{snap.blocked ? ` — IA pausada (${snap.reason})` : ""}.</div>
            )}
            <Meter label="Mensagens hoje" value={snap.messagesToday} max={snap.limits.maxMessagesPerDay} />
            <Meter label="Tokens hoje" value={snap.tokensToday} max={snap.limits.dailyTokenLimit} />
            {snap.limits.monthlyBudgetUsd != null && snap.costMonth != null && (
              <Meter label="Gasto estimado no mês (US$)" value={Number(snap.costMonth.toFixed(4))} max={snap.limits.monthlyBudgetUsd} />
            )}
            <div className="text-xs text-slate-400">
              Gasto estimado no mês: {snap.costMonth == null ? "informe os preços acima para estimar" : `US$ ${snap.costMonth.toFixed(4)}`} · os valores reais são os da fatura do provedor.
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-slate-300">Histórico de utilização (30 dias)</summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-slate-400"><tr><th className="py-1">Dia</th><th>Chamadas</th><th>Tokens</th><th>US$ (est.)</th></tr></thead>
                <tbody>
                  {Object.entries(usage!.days).map(([d, v]) => (
                    <tr key={d} className="border-t border-line"><td className="py-1">{d}</td><td>{v.calls}</td><td>{v.tokens.toLocaleString("pt-BR")}</td><td>{v.cost == null ? "—" : v.cost.toFixed(4)}</td></tr>
                  ))}
                  {Object.keys(usage!.days).length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">Nenhum uso ainda.</td></tr>}
                </tbody>
              </table>
              <div className="mt-3 text-xs text-slate-400">Últimas chamadas:</div>
              <div className="mt-1 space-y-1 text-xs">
                {usage!.recent.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex justify-between border-t border-line py-1">
                    <span>{new Date(r.created_at).toLocaleString("pt-BR")} · {r.kind} · {r.model}</span>
                    <span>{r.input_tokens}+{r.output_tokens}</span>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        )}

        {/* ------------------------------------------------ perfil */}
        <Card className="space-y-3">
          <div className="font-bold">Seu perfil</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setAvatarOpen(true)}><Avatar emoji={profile.avatar_emoji} color={profile.color} size={56} /></button>
            <div className="flex-1">
              <Label hint={`@${profile.username}`}>Nome exibido</Label>
              <Input defaultValue={profile.display_name} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== profile.display_name && saveProfile({ display_name: e.target.value.trim() })} />
            </div>
          </div>
          <div><Label>Sua cor</Label><ColorPicker value={profile.color} onChange={(c) => saveProfile({ color: c })} /></div>
          <div>
            <Label>Tema de cores do app</Label>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button key={t.key} onClick={() => saveProfile({ theme: t.key })} className={cx("flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm", profile.theme === t.key ? "border-white" : "border-line")}>
                  <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />{t.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Modal open={avatarOpen} onClose={() => setAvatarOpen(false)} title="Seu avatar">
        <EmojiGrid items={AVATARS} value={profile.avatar_emoji} onPick={(e) => { saveProfile({ avatar_emoji: e }); setAvatarOpen(false); }} />
      </Modal>
    </main>
  );

}

function NumField({ label, value, onSave, step }: { label: string; value: number | null; onSave: (v: number | null) => void; step?: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <Input type="number" inputMode="decimal" step={step ?? "1"} min={0} defaultValue={value ?? ""} key={String(value)}
        onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== value) onSave(v); }} />
    </div>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="tabular-nums text-slate-400">{value.toLocaleString("pt-BR")} / {max.toLocaleString("pt-BR")}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-soft">
        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-accent")} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
