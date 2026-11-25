"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { PRESETS, FRIEND_TEMPLATES } from "@/lib/personality";
import type { Personality, PersonalityDraft, Traits } from "@/lib/types";
import { TRAIT_KEYS, TRAIT_LABELS } from "@/lib/types";
import {
  AVATARS, Avatar, Button, Card, ColorPicker, EmojiGrid, Input, Label, Modal, Slider, Spinner, TextArea, TopBar, cx, useToast,
} from "@/components/ui";

function toDraft(p: Personality): PersonalityDraft {
  const { preset, ai_name, avatar_emoji, color, description, speaking_style, debate_behavior, custom_instructions, traits } = p;
  return { preset, ai_name, avatar_emoji, color, description, speaking_style, debate_behavior, custom_instructions, traits: { ...traits } };
}

const ALL_TEMPLATES = [...PRESETS, ...Object.values(FRIEND_TEMPLATES)];

export default function Studio() {
  const toast = useToast();
  const [list, setList] = useState<Personality[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonalityDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const selected = list?.find((p) => p.id === selId) ?? null;
  const dirty = !!(selected && draft && JSON.stringify(toDraft(selected)) !== JSON.stringify(draft));

  async function load(select?: string) {
    try {
      const r = await api<{ personalities: Personality[]; activeId: string | null }>("/api/personalities");
      setList(r.personalities);
      setActiveId(r.activeId);
      const id = select ?? selId ?? r.activeId ?? r.personalities[0]?.id ?? null;
      setSelId(id);
      const p = r.personalities.find((x) => x.id === id);
      if (p) setDraft(toDraft(p));
    } catch (e) { toast((e as Error).message, "error"); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function select(p: Personality) {
    if (dirty && !confirm("Descartar alterações não salvas?")) return;
    setSelId(p.id);
    setDraft(toDraft(p));
  }
  const set = <K extends keyof PersonalityDraft>(k: K, v: PersonalityDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setTrait = (k: keyof Traits, v: number) => setDraft((d) => (d ? { ...d, traits: { ...d.traits, [k]: v } } : d));

  async function save() {
    if (!selId || !draft) return;
    setSaving(true);
    try {
      await api(`/api/personalities/${selId}`, { method: "PATCH", body: draft });
      toast("Personalidade salva! Ela já vale nas próximas respostas.", "ok");
      await load(selId);
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  }
  async function action(path: string, method = "POST", msg?: string) {
    try {
      const r = await api<{ personality?: Personality }>(path, { method, body: method === "POST" ? {} : undefined });
      if (msg) toast(msg, "ok");
      await load(r.personality?.id ?? (method === "DELETE" ? undefined : selId ?? undefined));
      if (method === "DELETE") setSelId(null);
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function createFrom(d: PersonalityDraft) {
    try {
      const r = await api<{ personality: Personality }>("/api/personalities", { body: d });
      setNewOpen(false);
      toast("Personalidade criada.", "ok");
      await load(r.personality.id);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl pb-28">
      <TopBar title="🎭 Personality Studio" back="/groups" right={<Link href="/settings"><Button variant="ghost">🔑</Button></Link>} />
      {!list || !draft ? <div className="flex justify-center p-10"><Spinner /></div> : (
        <div className="space-y-4 p-4">
          <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {list.map((p) => (
              <button key={p.id} onClick={() => select(p)}
                className={cx("flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left", p.id === selId ? "border-accent bg-accent/15" : "border-line bg-bg-card")}>
                <Avatar emoji={p.avatar_emoji} color={p.color} size={32} ai />
                <div>
                  <div className="max-w-[9rem] truncate text-sm font-semibold">{p.ai_name}</div>
                  <div className="text-[11px] text-slate-400">{p.id === activeId ? "✅ em uso" : "salva"}</div>
                </div>
              </button>
            ))}
            <button onClick={() => setNewOpen(true)} className="shrink-0 rounded-2xl border border-dashed border-line px-4 text-sm text-slate-300 hover:border-accent">+ Nova</button>
          </div>

          <Card>
            <div className="flex items-center gap-3">
              <button onClick={() => setAvatarOpen(true)} title="Trocar avatar"><Avatar emoji={draft.avatar_emoji} color={draft.color} size={64} ai /></button>
              <div className="min-w-0 flex-1">
                <Label>Nome da IA</Label>
                <Input value={draft.ai_name} maxLength={30} onChange={(e) => set("ai_name", e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selId !== activeId && <Button variant="soft" onClick={() => action(`/api/personalities/${selId}/activate`, "POST", "Agora sua IA usa esta personalidade nos grupos.")}>✅ Usar nos grupos</Button>}
              <Button variant="soft" onClick={() => action(`/api/personalities/${selId}/duplicate`, "POST", "Duplicada.")}>⧉ Duplicar</Button>
              <Button variant="soft" onClick={() => confirm("Restaurar os valores padrão do modelo original? As suas edições serão perdidas.") && action(`/api/personalities/${selId}/reset`, "POST", "Restaurada ao padrão.")}>↺ Restaurar padrão</Button>
              <Button variant="danger" onClick={() => confirm("Excluir esta personalidade?") && action(`/api/personalities/${selId}`, "DELETE", "Excluída.")}>🗑️ Excluir</Button>
            </div>
          </Card>

          <Card className="space-y-3">
            <div>
              <Label hint="Aplicar um modelo substitui os campos abaixo (você ainda pode editar).">Personalidade predefinida</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_TEMPLATES.map((t) => (
                  <button key={t.key} type="button"
                    onClick={() => setDraft((d) => d && ({ ...t.draft, ai_name: d.ai_name, avatar_emoji: t.key === "personalizado" ? d.avatar_emoji : t.draft.avatar_emoji, traits: { ...t.draft.traits } }))}
                    className={cx("rounded-xl border p-2 text-left text-sm", draft.preset === t.key ? "border-accent bg-accent/15" : "border-line hover:bg-bg-hover")}>
                    <div className="font-semibold">{t.draft.avatar_emoji} {t.label}</div>
                    <div className="text-[11px] text-slate-400">{t.summary}</div>
                  </button>
                ))}
              </div>
            </div>
            <div><Label>Descrição da personalidade</Label><TextArea rows={3} maxLength={1000} value={draft.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div><Label>Forma de falar</Label><Input maxLength={500} value={draft.speaking_style} onChange={(e) => set("speaking_style", e.target.value)} placeholder="ex.: gírias, KKKK, frases curtas" /></div>
            <div><Label>Comportamento durante discussões</Label><Input maxLength={500} value={draft.debate_behavior} onChange={(e) => set("debate_behavior", e.target.value)} placeholder="ex.: nunca admite que perdeu" /></div>
            <div><Label>Cor</Label><ColorPicker value={draft.color} onChange={(c) => set("color", c)} /></div>
          </Card>

          <Card className="space-y-4">
            <Label hint="0 = nada · 100 = no máximo. Isso muda de verdade as instruções enviadas à IA.">Características</Label>
            {TRAIT_KEYS.map((k) => <Slider key={k} label={TRAIT_LABELS[k]} value={draft.traits[k]} onChange={(v) => setTrait(k, v)} />)}
            <p className="text-xs text-slate-500">“Frequência de participação” define a chance da IA entrar na conversa sem ser chamada. “Criatividade” também ajusta a temperatura do modelo.</p>
          </Card>

          <Card>
            <Label hint="Escreva livremente como sua IA deve se comportar. Vai direto para o prompt de sistema.">Instruções personalizadas</Label>
            <TextArea rows={6} maxLength={4000} value={draft.custom_instructions} onChange={(e) => set("custom_instructions", e.target.value)}
              placeholder="Você é uma IA extremamente engraçada, usa memes brasileiros, gosta de futebol, provoca os outros participantes de maneira divertida, é muito sarcástica e sempre tenta ter a última palavra nas discussões." />
            <div className="mt-1 text-right text-xs text-slate-500">{draft.custom_instructions.length}/4000</div>
          </Card>
        </div>
      )}

      {draft && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setTestOpen(true)}>🧪 TESTAR PERSONALIDADE</Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => selected && setDraft(toDraft(selected))}>Cancelar</Button>
            <Button disabled={!dirty} loading={saving} onClick={save}>Salvar</Button>
          </div>
        </div>
      )}

      <Modal open={avatarOpen} onClose={() => setAvatarOpen(false)} title="Avatar da IA">
        <EmojiGrid items={AVATARS} value={draft?.avatar_emoji} onPick={(e) => { set("avatar_emoji", e); setAvatarOpen(false); }} />
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nova personalidade">
        <p className="mb-3 text-sm text-slate-400">Comece a partir de um modelo:</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_TEMPLATES.map((t) => (
            <button key={t.key} onClick={() => createFrom({ ...t.draft, traits: { ...t.draft.traits } })} className="rounded-xl border border-line p-2 text-left hover:border-accent">
              <div className="text-sm font-semibold">{t.draft.avatar_emoji} {t.label}</div>
              <div className="text-[11px] text-slate-400">{t.summary}</div>
            </button>
          ))}
        </div>
      </Modal>

      {draft && (
        <TestModal open={testOpen} onClose={() => setTestOpen(false)} draft={draft} setTrait={setTrait}
          setInstructions={(v) => set("custom_instructions", v)} dirty={dirty} saving={saving} onSave={save}
          onCancel={() => selected && setDraft(toDraft(selected))} />
      )}
    </main>
  );
}

function TestModal(props: {
  open: boolean; onClose: () => void; draft: PersonalityDraft; setTrait: (k: keyof Traits, v: number) => void;
  setInstructions: (v: string) => void; dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string; meta?: string }[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  async function send() {
    const t = text.trim();
    if (!t || loading) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setText("");
    setLoading(true);
    try {
      const r = await api<{ reply: string; usage: { input: number; output: number }; model: string }>("/api/personalities/test", {
        body: { personality: props.draft, messages: next.slice(-20).map(({ role, content }) => ({ role, content })) },
      });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, meta: `${r.model} · ${r.usage.input}+${r.usage.output} tokens` }]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setLoading(false); }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title={<span>🧪 Testando {props.draft.ai_name}</span>} wide>
      <p className="mb-2 text-xs text-slate-400">Respostas reais do seu provedor, usando a personalidade como está agora (mesmo sem salvar). Cada mensagem usa a sua chave.</p>
      <div className="scroll-thin mb-3 h-[38dvh] space-y-2 overflow-y-auto rounded-xl bg-bg-soft p-3">
        {msgs.length === 0 && <p className="text-center text-sm text-slate-500">Mande algo como “Bernardo, você é rico demais KKKK”.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "bg-accent text-white" : "border bg-bg-card")}
              style={m.role === "assistant" ? { borderColor: props.draft.color + "88" } : undefined}>
              {m.role === "assistant" && <div className="text-xs font-bold" style={{ color: props.draft.color }}>{props.draft.avatar_emoji} {props.draft.ai_name}</div>}
              {m.content}
              {m.meta && <div className="mt-1 text-[10px] text-slate-500">{m.meta}</div>}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-slate-400">{props.draft.ai_name} está pensando…</div>}
        <div ref={end} />
      </div>
      <div className="mb-3 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva para sua IA…" maxLength={2000} />
        <Button onClick={send} loading={loading}>Enviar</Button>
      </div>
      <details className="mb-3 rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">🎚️ Ajustar personalidade durante o teste</summary>
        <div className="mt-3 space-y-3">
          {TRAIT_KEYS.map((k) => <Slider key={k} label={TRAIT_LABELS[k]} value={props.draft.traits[k]} onChange={(v) => props.setTrait(k, v)} />)}
          <TextArea rows={4} value={props.draft.custom_instructions} onChange={(e) => props.setInstructions(e.target.value)} placeholder="Instruções personalizadas" />
        </div>
      </details>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setMsgs([])}>Limpar teste</Button>
        <div className="flex-1" />
        <Button variant="soft" disabled={!props.dirty} onClick={props.onCancel}>Cancelar alterações</Button>
        <Button disabled={!props.dirty} loading={props.saving} onClick={props.onSave}>Salvar</Button>
      </div>
    </Modal>
  );
}
