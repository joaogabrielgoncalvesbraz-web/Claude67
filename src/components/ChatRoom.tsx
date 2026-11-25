"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api } from "@/lib/fetcher";
import type { AiRun, GroupSettings, MemberAi, Message } from "@/lib/types";
import { Avatar, Button, EMOJIS, EmojiGrid, Input, Modal, Spinner, Toggle, cx, timeHM, useToast } from "./ui";

interface GroupInfo {
  group: { id: string; name: string; invite_code: string; owner_id: string; settings: GroupSettings };
  members: MemberAi[];
  run: AiRun;
  me: { role: "admin" | "member"; ai_silent: boolean; user_id: string };
}
type Reaction = { message_id: string; user_id: string; emoji: string };

const PAGE = 50;
const QUICK = ["😂", "🔥", "💀", "👍", "❤️", "🤡"];

export default function ChatRoom({ groupId, userId }: { groupId: string; userId: string }) {
  const sb = supabaseBrowser();
  const toast = useToast();
  const router = useRouter();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [run, setRun] = useState<AiRun | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [panel, setPanel] = useState<null | "menu" | "members" | "pinned" | "search" | "free" | "favorites" | "call">(null);
  const [newBelow, setNewBelow] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const ticking = useRef(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const members = info?.members ?? [];
  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // ------------------------------------------------------------ carregamento
  const loadInfo = useCallback(async () => {
    try {
      const r = await api<GroupInfo>(`/api/groups/${groupId}`);
      setInfo(r);
      setRun(r.run);
    } catch (e) {
      toast((e as Error).message, "error");
      router.replace("/groups");
    }
  }, [groupId, router, toast]);

  const loadReactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await sb.from("reactions").select("message_id,user_id,emoji").in("message_id", ids);
    setReactions((prev) => [...prev.filter((r) => !ids.includes(r.message_id)), ...((data as Reaction[]) ?? [])]);
  }, [sb]);

  const loadInitial = useCallback(async () => {
    const { data, error } = await sb.from("messages").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(PAGE);
    if (error) return toast("Erro ao carregar mensagens: " + error.message, "error");
    const list = ((data as Message[]) ?? []).reverse();
    setMessages(list);
    setHasMore((data ?? []).length === PAGE);
    loadReactions(list.map((m) => m.id));
    const { data: favs } = await sb.from("favorites").select("message_id").eq("user_id", userId);
    setFavorites(new Set((favs ?? []).map((f: any) => f.message_id)));
    requestAnimationFrame(() => scrollToBottom(false));
  }, [sb, groupId, userId, loadReactions, toast]);

  async function loadOlder() {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data } = await sb.from("messages").select("*").eq("group_id", groupId).lt("created_at", messages[0].created_at)
      .order("created_at", { ascending: false }).limit(PAGE);
    const older = ((data as Message[]) ?? []).reverse();
    setMessages((m) => [...older, ...m]);
    setHasMore(older.length === PAGE);
    loadReactions(older.map((m) => m.id));
    setLoadingOlder(false);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
  }

  function scrollToBottom(smooth = true) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  }

  // ------------------------------------------------------------ tempo real
  useEffect(() => {
    loadInfo();
    loadInitial();
    const db = sb.channel(`db:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (atBottom.current || m.user_id === userId && m.sender_type === "human") requestAnimationFrame(() => scrollToBottom());
        else setNewBelow((n) => n + 1);
        notify(m);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as { id: string }).id;
        setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `group_id=eq.${groupId}` }, (p) => {
        const r = p.new as Reaction;
        setReactions((prev) => prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (p) => {
        const r = p.old as Reaction;
        setReactions((prev) => prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_runs", filter: `group_id=eq.${groupId}` }, (p) => {
        if (p.new && (p.new as AiRun).group_id) setRun(p.new as AiRun);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` }, () => loadInfo())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "groups", filter: `id=eq.${groupId}` }, () => loadInfo())
      .subscribe();

    // presença (online) e "digitando" — canal privado, só membros do grupo
    let presence: RealtimeChannel | null = null;
    (async () => {
      await sb.realtime.setAuth();
      presence = sb.channel(`group:${groupId}`, { config: { private: true, presence: { key: userId } } })
        .on("presence", { event: "sync" }, () => {
          setOnline(new Set(Object.keys(presence!.presenceState())));
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.user_id && payload.user_id !== userId) setTyping((t) => ({ ...t, [payload.user_id]: Date.now() }));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await presence!.track({ at: Date.now() });
        });
      channelRef.current = presence;
    })();

    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => { api<GroupInfo>(`/api/groups/${groupId}`).then((r) => { setRun(r.run); setInfo(r); }).catch(() => {}); }, 20000);
    return () => {
      sb.removeChannel(db);
      if (presence) sb.removeChannel(presence);
      clearInterval(clock);
      clearInterval(poll);
      if (tickTimer.current) clearTimeout(tickTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // ------------------------------------------- "motor" das IAs no navegador
  // Enquanto houver rodada ativa, os navegadores conectados pedem a próxima fala.
  // O servidor usa uma trava no banco: só uma fala é gerada por vez.
  const doTick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      const r = await api<{ continue: boolean; delayMs: number }>(`/api/groups/${groupId}/ai/tick`, { body: {} });
      if (r.continue) schedule(r.delayMs + Math.random() * 400);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      ticking.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const schedule = useCallback((ms: number) => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(doTick, Math.max(0, ms));
  }, [doTick]);

  useEffect(() => {
    if (run?.status !== "running") { if (tickTimer.current) clearTimeout(tickTimer.current); return; }
    const wait = run.next_tick_at ? new Date(run.next_tick_at).getTime() - Date.now() : 0;
    schedule(Math.max(150, wait) + Math.random() * 500);
  }, [run?.status, run?.next_tick_at, run?.queue?.length, run?.turns_done, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ notificações
  function notify(m: Message) {
    if (typeof document === "undefined" || !document.hidden) return;
    if (m.user_id === userId && m.sender_type === "human") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const author = m.sender_type === "ai" ? m.ai_name : m.sender_type === "system" ? "AI FRIENDS" : byIdRef.current.get(m.user_id ?? "")?.display_name;
    try { new Notification(author ?? "Nova mensagem", { body: m.content.slice(0, 120), tag: groupId }); } catch { /* iOS sem suporte */ }
  }
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  // ------------------------------------------------------------ ações
  async function send(content: string) {
    try {
      await api(`/api/groups/${groupId}/messages`, { body: { content, replyToId: replyTo?.id ?? null } });
      setReplyTo(null);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }
  const lastTyping = useRef(0);
  function onTyping() {
    if (Date.now() - lastTyping.current < 2000) return;
    lastTyping.current = Date.now();
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: userId } });
  }
  async function react(m: Message, emoji: string) {
    setActionsFor(null);
    try { await api(`/api/groups/${groupId}/messages/${m.id}/react`, { body: { emoji } }); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function pin(m: Message) {
    setActionsFor(null);
    try { await api(`/api/groups/${groupId}/messages/${m.id}`, { method: "PATCH", body: { pinned: !m.pinned } }); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function fav(m: Message) {
    setActionsFor(null);
    try {
      const r = await api<{ favorite: boolean }>(`/api/groups/${groupId}/messages/${m.id}/favorite`, { body: {} });
      setFavorites((s) => { const n = new Set(s); r.favorite ? n.add(m.id) : n.delete(m.id); return n; });
      toast(r.favorite ? "Adicionada aos favoritos ⭐" : "Removida dos favoritos", "ok");
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function del(m: Message) {
    setActionsFor(null);
    if (!confirm("Apagar esta mensagem para todos?")) return;
    try { await api(`/api/groups/${groupId}/messages/${m.id}`, { method: "DELETE" }); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function stopAi() {
    try { await api(`/api/groups/${groupId}/ai/stop`, { body: {} }); toast("IAs interrompidas.", "ok"); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function callAi(targets: "all" | string[]) {
    setPanel(null);
    try { await api(`/api/groups/${groupId}/ai/call`, { body: { targets } }); } catch (e) { toast((e as Error).message, "error"); }
  }
  function jumpTo(id: string) {
    setPanel(null);
    const el = document.getElementById("m-" + id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(id);
      setTimeout(() => setHighlight(null), 2000);
    } else toast("Essa mensagem é antiga: role para cima e toque em 'carregar anteriores'.");
  }

  if (!info) return <div className="flex h-dvh items-center justify-center"><Spinner /></div>;

  const me = byId.get(userId);
  const typingNames = Object.entries(typing).filter(([, t]) => now - t < 3500).map(([id]) => byId.get(id)?.nickname || byId.get(id)?.display_name).filter(Boolean);
  const thinking = run?.status === "running" && run.thinking_user_id ? byId.get(run.thinking_user_id) : null;
  const freeActive = run && run.mode === "free" && (run.status === "running" || run.status === "paused");
  const replyActive = run && run.mode === "reply" && run.status === "running";
  const pinned = messages.filter((m) => m.pinned);
  const readyAis = members.filter((m) => m.ai_ready);

  return (
    <div className="relative flex h-dvh flex-col">
      {/* ------------------------------------------------------------ topo */}
      <header className="z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
        <Link href="/groups" className="rounded-lg px-2 py-1 text-xl text-slate-300 hover:bg-bg-hover" aria-label="Voltar">←</Link>
        <button className="min-w-0 flex-1 text-left" onClick={() => setPanel("members")}>
          <div className="truncate font-bold">{info.group.name}</div>
          <div className="truncate text-xs text-slate-400">
            {typingNames.length ? <span className="text-accent-soft">{typingNames.join(", ")} digitando…</span>
              : `${online.size} online · ${members.length} pessoas + ${members.filter((m) => m.ai_name).length} IAs`}
          </div>
        </button>
        <IconBtn label="Pesquisar" onClick={() => setPanel("search")}>🔍</IconBtn>
        <IconBtn label="Fixadas" onClick={() => setPanel("pinned")}>📌{pinned.length > 0 && <sup className="text-[10px]">{pinned.length}</sup>}</IconBtn>
        <IconBtn label="Conversa livre" onClick={() => setPanel("free")}>🎙️</IconBtn>
        <IconBtn label="Menu" onClick={() => setPanel("menu")}>⋮</IconBtn>
      </header>

      {/* --------------------------------------------------------- avisos */}
      {me && !me.ai_ready && (
        <Link href={me.ai_ready_reason?.includes("personalidade") ? "/studio" : "/settings"} className="block bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
          ⚠️ Sua IA não está pronta: <b>{me.ai_ready_reason}</b>. Toque para configurar.
        </Link>
      )}
      {freeActive && run && (
        <div className="flex items-center gap-2 border-b border-line bg-accent/10 px-3 py-2 text-xs">
          <span className="text-base">🎙️</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">Conversa livre: {run.topic}</div>
            <div className="text-slate-400">
              Turno {run.turns_done}/{run.max_turns}
              {run.status === "paused" ? " · ⏸️ pausada" : run.ends_at ? ` · ${fmtRemaining(new Date(run.ends_at).getTime() - now)}` : ""}
            </div>
          </div>
          {run.status === "running"
            ? <Button variant="soft" className="px-3 py-1.5" onClick={() => api(`/api/groups/${groupId}/free`, { body: { action: "pause" } }).catch((e) => toast(e.message, "error"))}>⏸️</Button>
            : <Button variant="soft" className="px-3 py-1.5" onClick={() => api(`/api/groups/${groupId}/free`, { body: { action: "resume" } }).catch((e) => toast(e.message, "error"))}>▶️</Button>}
          <Button variant="danger" className="px-3 py-1.5" onClick={() => api(`/api/groups/${groupId}/free`, { body: { action: "stop" } }).catch((e) => toast(e.message, "error"))}>⏹️</Button>
        </div>
      )}

      {/* ------------------------------------------------------ mensagens */}
      <div
        ref={scroller}
        className="chat-bg scroll-thin flex-1 overflow-y-auto px-2 py-3 sm:px-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (atBottom.current) setNewBelow(0);
        }}
      >
        <div className="mx-auto max-w-3xl space-y-1">
          {hasMore && messages.length > 0 && (
            <div className="flex justify-center py-2">
              <Button variant="soft" onClick={loadOlder} loading={loadingOlder} className="py-1.5 text-xs">Carregar anteriores</Button>
            </div>
          )}
          {messages.length === 0 && <div className="py-16 text-center text-sm text-slate-500">Nenhuma mensagem ainda. Diga oi! 👋</div>}
          {messages.map((m, i) => (
            <Bubble
              key={m.id}
              m={m}
              prev={messages[i - 1]}
              mine={m.sender_type === "human" && m.user_id === userId}
              author={byId.get(m.user_id ?? "")}
              replied={m.reply_to_id ? msgById.get(m.reply_to_id) : undefined}
              repliedAuthor={m.reply_to_id ? byId.get(msgById.get(m.reply_to_id)?.user_id ?? "") : undefined}
              reactions={reactions.filter((r) => r.message_id === m.id)}
              userId={userId}
              favorite={favorites.has(m.id)}
              highlight={highlight === m.id}
              onActions={() => setActionsFor(m)}
              onReact={(e) => react(m, e)}
              onJump={jumpTo}
            />
          ))}
          {thinking && (
            <div className="flex animate-pop items-center gap-2 py-2 pl-1">
              <Avatar emoji={thinking.ai_avatar ?? "🤖"} color={thinking.ai_color ?? "#7c5cff"} size={30} ai />
              <div className="rounded-2xl rounded-bl-md border border-line bg-bg-card px-3 py-2 text-sm text-slate-300">
                <b style={{ color: thinking.ai_color ?? undefined }}>{thinking.ai_name}</b> está pensando
                <span className="ml-1 inline-flex gap-0.5">{[0, 1, 2].map((k) => <span key={k} className="animate-blink" style={{ animationDelay: `${k * 0.2}s` }}>•</span>)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {newBelow > 0 && (
        <button onClick={() => scrollToBottom()} className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold shadow-lg">
          ↓ {newBelow} nova{newBelow > 1 ? "s" : ""}
        </button>
      )}

      {(replyActive || (freeActive && run?.status === "running")) && (
        <div className="flex justify-center border-t border-line bg-bg-soft py-1.5">
          <button onClick={stopAi} className="rounded-full bg-red-500/15 px-4 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/25">⏹️ Parar as IAs</button>
        </div>
      )}

      <Composer
        members={members}
        replyTo={replyTo}
        replyAuthor={replyTo ? (replyTo.sender_type === "ai" ? replyTo.ai_name : byId.get(replyTo.user_id ?? "")?.display_name) ?? "" : ""}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        onTyping={onTyping}
        onCallMenu={() => setPanel("call")}
      />

      {/* -------------------------------------------------------- painéis */}
      <Modal open={!!actionsFor} onClose={() => setActionsFor(null)} title="Mensagem">
        {actionsFor && (
          <div className="space-y-3">
            <div className="flex justify-between gap-1">
              {QUICK.map((e) => <button key={e} onClick={() => react(actionsFor, e)} className="rounded-xl p-2 text-2xl hover:bg-bg-hover">{e}</button>)}
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-slate-400">Mais reações</summary>
              <div className="mt-2"><EmojiGrid items={EMOJIS} onPick={(e) => react(actionsFor, e)} /></div>
            </details>
            <div className="grid grid-cols-2 gap-2">
              {actionsFor.sender_type !== "system" && <Button variant="soft" onClick={() => { setReplyTo(actionsFor); setActionsFor(null); }}>↩️ Responder</Button>}
              <Button variant="soft" onClick={() => pin(actionsFor)}>📌 {actionsFor.pinned ? "Desafixar" : "Fixar"}</Button>
              <Button variant="soft" onClick={() => fav(actionsFor)}>⭐ {favorites.has(actionsFor.id) ? "Desfavoritar" : "Favoritar"}</Button>
              <Button variant="soft" onClick={() => { navigator.clipboard?.writeText(actionsFor.content); setActionsFor(null); toast("Copiado!", "ok"); }}>📋 Copiar</Button>
              {(info.me.role === "admin" || actionsFor.user_id === userId) && <Button variant="danger" onClick={() => del(actionsFor)}>🗑️ Apagar</Button>}
            </div>
            {actionsFor.sender_type === "ai" && typeof actionsFor.meta?.model === "string" && (
              <div className="text-xs text-slate-500">Gerado por {String(actionsFor.meta.provider)} · {String(actionsFor.meta.model)}</div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={panel === "call"} onClose={() => setPanel(null)} title="Chamar IAs">
        <Button className="mb-3 w-full" onClick={() => callAi("all")} disabled={!readyAis.length}>🤖 Chamar todas as IAs</Button>
        <div className="space-y-2">
          {members.filter((m) => m.ai_name).map((m) => (
            <button key={m.user_id} disabled={!m.ai_ready} onClick={() => callAi([m.user_id])}
              className="flex w-full items-center gap-3 rounded-xl border border-line p-2 text-left hover:bg-bg-hover disabled:opacity-40">
              <Avatar emoji={m.ai_avatar ?? "🤖"} color={m.ai_color ?? "#7c5cff"} size={36} ai />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{m.ai_name}</div>
                <div className="text-xs text-slate-400">{m.ai_ready ? `${m.provider} · ${m.model}` : m.ai_ready_reason}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={panel === "members"} onClose={() => setPanel(null)} title="Participantes">
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar emoji={m.avatar_emoji} color={m.color} size={40} />
                  <span className={cx("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg-card", online.has(m.user_id) ? "bg-green-500" : "bg-slate-600")} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{m.nickname || m.display_name} {m.role === "admin" && "👑"} {m.user_id === userId && <span className="text-xs text-slate-400">(você)</span>}</div>
                  <div className="text-xs text-slate-400">@{m.username} · {online.has(m.user_id) ? "online" : "offline"}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-bg-soft p-2">
                <Avatar emoji={m.ai_avatar ?? "🤖"} color={m.ai_color ?? "#64748b"} size={28} ai />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold">{m.ai_name ?? "sem IA"} {m.ai_silent && "🔕"}</div>
                  <div className={m.ai_ready ? "text-green-400" : "text-amber-300"}>{m.ai_ready ? `● pronta · ${m.provider} / ${m.model}` : `● ${m.ai_ready_reason}`}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={panel === "pinned"} onClose={() => setPanel(null)} title="📌 Mensagens fixadas">
        {pinned.length === 0 ? <p className="text-sm text-slate-400">Nenhuma mensagem fixada (entre as carregadas).</p> : (
          <div className="space-y-2">
            {pinned.map((m) => <MiniMsg key={m.id} m={m} author={byId.get(m.user_id ?? "")} onClick={() => jumpTo(m.id)} />)}
          </div>
        )}
      </Modal>

      <SearchModal open={panel === "search"} onClose={() => setPanel(null)} groupId={groupId} byId={byId} onJump={jumpTo} />
      <FavoritesModal open={panel === "favorites"} onClose={() => setPanel(null)} groupId={groupId} userId={userId} byId={byId} onJump={jumpTo} />
      <FreeModeModal open={panel === "free"} onClose={() => setPanel(null)} groupId={groupId} members={members} settings={info.group.settings} run={run} />

      <Modal open={panel === "menu"} onClose={() => setPanel(null)} title="Menu do grupo">
        <div className="space-y-3">
          <div className="rounded-xl bg-bg-soft p-3">
            <div className="text-xs text-slate-400">Código de convite</div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xl font-black tracking-[.25em] text-accent-soft">{info.group.invite_code}</span>
              <Button variant="soft" className="py-1.5" onClick={() => { navigator.clipboard?.writeText(info.group.invite_code); toast("Código copiado!", "ok"); }}>Copiar</Button>
            </div>
          </div>
          <Toggle
            label={<span>🔕 Modo silencioso da minha IA<br /><span className="text-xs text-slate-400">Ela só responde quando chamada</span></span>}
            checked={!!me?.ai_silent}
            onChange={async (v) => { try { await api(`/api/groups/${groupId}/members/${userId}`, { method: "PATCH", body: { ai_silent: v } }); loadInfo(); } catch (e) { toast((e as Error).message, "error"); } }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Link href="/studio"><Button variant="soft" className="w-full">🎭 Personality Studio</Button></Link>
            <Link href="/settings"><Button variant="soft" className="w-full">🔑 Configurações</Button></Link>
            <Button variant="soft" onClick={() => setPanel("favorites")}>⭐ Favoritas</Button>
            <Button variant="soft" onClick={async () => {
              if (typeof Notification === "undefined") return toast("Seu navegador não suporta notificações.", "error");
              const p = await Notification.requestPermission();
              toast(p === "granted" ? "Notificações ativadas!" : "Notificações bloqueadas no navegador.", p === "granted" ? "ok" : "error");
            }}>🔔 Notificações</Button>
            <a href={`/api/groups/${groupId}/export?format=txt`}><Button variant="soft" className="w-full">📄 Exportar TXT</Button></a>
            <a href={`/api/groups/${groupId}/export?format=json`}><Button variant="soft" className="w-full">🧾 Exportar JSON</Button></a>
          </div>
          {info.me.role === "admin" && <Link href={`/g/${groupId}/admin`}><Button className="w-full">👑 Painel do administrador</Button></Link>}
          <Button variant="danger" className="w-full" onClick={async () => {
            if (!confirm("Sair deste grupo?")) return;
            try { await api(`/api/groups/${groupId}/leave`, { body: {} }); router.replace("/groups"); } catch (e) { toast((e as Error).message, "error"); }
          }}>🚪 Sair do grupo</Button>
        </div>
      </Modal>
    </div>
  );
}

function fmtRemaining(ms: number) {
  if (ms <= 0) return "tempo esgotado";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} restantes`;
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return <button onClick={onClick} aria-label={label} title={label} className="rounded-lg px-2 py-1.5 text-lg hover:bg-bg-hover">{children}</button>;
}

/** Destaca @menções no texto. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}\p{N}_]+(?:\s(?:do|da|de)\s[\p{L}\p{N}_]+)?)/u);
  return <>{parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded bg-accent/20 px-0.5 font-semibold text-accent-soft">{p}</span> : <span key={i}>{p}</span>))}</>;
}

function Bubble(props: {
  m: Message; prev?: Message; mine: boolean; author?: MemberAi; replied?: Message; repliedAuthor?: MemberAi;
  reactions: Reaction[]; userId: string; favorite: boolean; highlight: boolean;
  onActions: () => void; onReact: (e: string) => void; onJump: (id: string) => void;
}) {
  const { m, prev, mine, author, replied, repliedAuthor, reactions, userId, favorite, highlight } = props;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (m.sender_type === "system") {
    return (
      <div id={"m-" + m.id} className="flex justify-center py-1.5">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-xl bg-bg-card/80 px-3 py-1.5 text-center text-xs text-slate-400">{m.content}</div>
      </div>
    );
  }
  const isAi = m.sender_type === "ai";
  const color = isAi ? m.ai_color ?? "#7c5cff" : author?.color ?? "#64748b";
  const name = isAi ? m.ai_name ?? "IA" : author?.nickname || author?.display_name || "Ex-participante";
  const grouped = prev && prev.sender_type === m.sender_type && prev.user_id === m.user_id && prev.ai_name === m.ai_name
    && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60_000;
  const counts = reactions.reduce<Record<string, { n: number; me: boolean }>>((acc, r) => {
    acc[r.emoji] ??= { n: 0, me: false };
    acc[r.emoji].n++;
    if (r.user_id === userId) acc[r.emoji].me = true;
    return acc;
  }, {});
  const startPress = () => { pressTimer.current = setTimeout(props.onActions, 450); };
  const endPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  return (
    <div id={"m-" + m.id} className={cx("group flex animate-pop gap-2", mine ? "flex-row-reverse" : "flex-row", grouped ? "pt-0.5" : "pt-2")}>
      {!mine && <div className="w-8 shrink-0">{!grouped && <Avatar emoji={isAi ? m.ai_avatar ?? "🤖" : author?.avatar_emoji ?? "🙂"} color={color} size={32} ai={isAi} />}</div>}
      <div className={cx("flex max-w-[82%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
        <div
          onContextMenu={(e) => { e.preventDefault(); props.onActions(); }}
          onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress}
          onDoubleClick={props.onActions}
          className={cx(
            "relative select-text rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm transition",
            mine ? "rounded-br-md bg-accent text-white" : isAi ? "rounded-bl-md border bg-bg-card" : "rounded-bl-md bg-bg-hover",
            highlight && "ring-2 ring-yellow-300",
          )}
          style={isAi ? { borderColor: color + "88", background: `linear-gradient(135deg, ${color}1f, #171b2b 60%)` } : undefined}
        >
          {!grouped && !mine && (
            <div className="mb-0.5 flex items-center gap-1 text-xs font-bold" style={{ color }}>
              {name}
              {isAi && <span className="rounded bg-black/30 px-1 text-[9px] uppercase tracking-wide">IA de {author?.nickname || author?.display_name}</span>}
            </div>
          )}
          {replied && (
            <button onClick={() => props.onJump(replied.id)} className="mb-1 block w-full rounded-lg border-l-4 bg-black/20 px-2 py-1 text-left text-xs" style={{ borderColor: replied.sender_type === "ai" ? replied.ai_color ?? "#fff" : repliedAuthor?.color ?? "#fff" }}>
              <div className="font-semibold opacity-80">{replied.sender_type === "ai" ? replied.ai_name : repliedAuthor?.display_name}</div>
              <div className="line-clamp-2 opacity-70">{replied.content}</div>
            </button>
          )}
          <div className="whitespace-pre-wrap break-words"><RichText text={m.content} /></div>
          <div className={cx("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/70" : "text-slate-500")}>
            {m.pinned && <span>📌</span>}{favorite && <span>⭐</span>}{timeHM(m.created_at)}
          </div>
          <button onClick={props.onActions} aria-label="Ações" className={cx("absolute top-1 hidden rounded-md bg-bg px-1.5 text-xs text-slate-300 group-hover:block", mine ? "-left-8" : "-right-8")}>⋯</button>
        </div>
        {Object.keys(counts).length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-1 px-1">
            {Object.entries(counts).map(([e, c]) => (
              <button key={e} onClick={() => props.onReact(e)} className={cx("rounded-full border px-1.5 py-0.5 text-xs", c.me ? "border-accent bg-accent/20" : "border-line bg-bg-card")}>
                {e} {c.n > 1 && c.n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniMsg({ m, author, onClick }: { m: Pick<Message, "id" | "sender_type" | "ai_name" | "ai_color" | "content" | "created_at" | "user_id">; author?: MemberAi; onClick: () => void }) {
  const name = m.sender_type === "ai" ? m.ai_name : m.sender_type === "system" ? "sistema" : author?.display_name ?? "?";
  return (
    <button onClick={onClick} className="block w-full rounded-xl border border-line p-2.5 text-left hover:bg-bg-hover">
      <div className="flex justify-between text-xs"><b style={{ color: m.sender_type === "ai" ? m.ai_color ?? undefined : author?.color }}>{name}</b><span className="text-slate-500">{new Date(m.created_at).toLocaleString("pt-BR")}</span></div>
      <div className="line-clamp-3 text-sm text-slate-200">{m.content}</div>
    </button>
  );
}

function Composer(props: {
  members: MemberAi[]; replyTo: Message | null; replyAuthor: string;
  onCancelReply: () => void; onSend: (t: string) => Promise<boolean>; onTyping: () => void; onCallMenu: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const mentionQuery = useMemo(() => {
    const el = ta.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}_ ]{0,20})$/u);
    return m ? m[1].toLowerCase() : null;
  }, [text]);

  const options = useMemo(() => {
    if (mentionQuery === null) return [];
    const opts: { label: string; insert: string; sub: string; emoji: string; color: string }[] = [
      { label: "todas", insert: "@todas", sub: "chama todas as IAs", emoji: "🤖", color: "#7c5cff" },
    ];
    for (const m of props.members) {
      if (m.ai_name) opts.push({ label: m.ai_name, insert: "@" + m.ai_name, sub: `IA de ${m.display_name}`, emoji: m.ai_avatar ?? "🤖", color: m.ai_color ?? "#7c5cff" });
    }
    return opts.filter((o) => o.label.toLowerCase().includes(mentionQuery.trim()));
  }, [mentionQuery, props.members]);

  function pickMention(insert: string) {
    const el = ta.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\p{L}\p{N}_ ]{0,20})$/u, insert + " ");
    setText(before + text.slice(pos));
    requestAnimationFrame(() => ta.current?.focus());
  }

  async function submit() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await props.onSend(t);
    setSending(false);
    if (ok) { setText(""); setEmojiOpen(false); }
    requestAnimationFrame(() => ta.current?.focus());
  }

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  return (
    <div className="safe-bottom relative border-t border-line bg-bg/95 px-2 pt-2 backdrop-blur">
      {options.length > 0 && (
        <div className="absolute bottom-full left-2 right-2 mb-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-bg-card p-1 shadow-2xl sm:right-auto sm:w-80">
          {options.map((o) => (
            <button key={o.insert} onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(o.insert)} className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-bg-hover">
              <Avatar emoji={o.emoji} color={o.color} size={28} ai />
              <div><div className="text-sm font-semibold">@{o.label}</div><div className="text-xs text-slate-400">{o.sub}</div></div>
            </button>
          ))}
        </div>
      )}
      {props.replyTo && (
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-xl border-l-4 border-accent bg-bg-card px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1"><b>Respondendo {props.replyAuthor}</b><div className="truncate text-slate-400">{props.replyTo.content}</div></div>
          <button onClick={props.onCancelReply} className="text-slate-400">✕</button>
        </div>
      )}
      {emojiOpen && <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-line bg-bg-card p-2"><EmojiGrid items={EMOJIS} onPick={(e) => setText((t) => t + e)} /></div>}
      <div className="mx-auto flex max-w-3xl items-end gap-1.5">
        <button onClick={() => setEmojiOpen((v) => !v)} className="rounded-xl p-2.5 text-xl hover:bg-bg-hover" aria-label="Emojis">😊</button>
        <button onClick={props.onCallMenu} className="rounded-xl p-2.5 text-xl hover:bg-bg-hover" aria-label="Chamar IAs" title="Chamar IAs">🤖</button>
        <textarea
          ref={ta}
          value={text}
          rows={1}
          maxLength={4000}
          placeholder="Mensagem… (@ chama uma IA)"
          onChange={(e) => { setText(e.target.value); props.onTyping(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing && window.matchMedia("(pointer:fine)").matches) {
              e.preventDefault();
              if (options.length > 0) pickMention(options[0].insert); else submit();
            }
          }}
          className="max-h-36 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-bg-soft px-3.5 py-2.5 text-[15px] outline-none focus:border-accent"
        />
        <button onClick={submit} disabled={!text.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg text-white disabled:opacity-40" aria-label="Enviar">
          {sending ? <Spinner small /> : "➤"}
        </button>
      </div>
    </div>
  );
}

function SearchModal({ open, onClose, groupId, byId, onJump }: { open: boolean; onClose: () => void; groupId: string; byId: Map<string, MemberAi>; onJump: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { setResults((await api<{ results: Message[] }>(`/api/groups/${groupId}/search?q=${encodeURIComponent(q)}`)).results); } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, groupId]);
  return (
    <Modal open={open} onClose={onClose} title="🔍 Pesquisar no histórico">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite pelo menos 2 letras" />
      <div className="mt-3 space-y-2">
        {loading && <Spinner small />}
        {results?.length === 0 && <p className="text-sm text-slate-400">Nada encontrado.</p>}
        {results?.map((m) => <MiniMsg key={m.id} m={m} author={byId.get(m.user_id ?? "")} onClick={() => onJump(m.id)} />)}
      </div>
    </Modal>
  );
}

function FavoritesModal({ open, onClose, groupId, userId, byId, onJump }: { open: boolean; onClose: () => void; groupId: string; userId: string; byId: Map<string, MemberAi>; onJump: (id: string) => void }) {
  const [items, setItems] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!open) return;
    supabaseBrowser().from("favorites").select("message_id, messages!inner(*)").eq("user_id", userId).eq("messages.group_id", groupId)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setItems(((data ?? []) as any[]).map((r) => r.messages as Message)));
  }, [open, groupId, userId]);
  return (
    <Modal open={open} onClose={onClose} title="⭐ Mensagens favoritas">
      {!items ? <Spinner small /> : items.length === 0 ? <p className="text-sm text-slate-400">Nenhuma favorita neste grupo.</p> : (
        <div className="space-y-2">{items.map((m) => <MiniMsg key={m.id} m={m} author={byId.get(m.user_id ?? "")} onClick={() => onJump(m.id)} />)}</div>
      )}
    </Modal>
  );
}

function FreeModeModal({ open, onClose, groupId, members, settings, run }: { open: boolean; onClose: () => void; groupId: string; members: MemberAi[]; settings: GroupSettings; run: AiRun | null }) {
  const toast = useToast();
  const ready = members.filter((m) => m.ai_ready);
  const [topic, setTopic] = useState("Qual é o melhor time de futebol do Brasil?");
  const [chosen, setChosen] = useState<string[]>([]);
  const [turns, setTurns] = useState(settings.free_default_turns);
  const [minutes, setMinutes] = useState(settings.free_default_minutes);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setChosen(ready.map((m) => m.user_id)); setTurns(settings.free_default_turns); setMinutes(settings.free_default_minutes); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = run && run.mode === "free" && (run.status === "running" || run.status === "paused");
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try { await api(`/api/groups/${groupId}/free`, { body }); onClose(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="🎙️ Conversa livre">
      {active ? (
        <div className="space-y-3">
          <p className="text-sm">Em andamento: <b>{run!.topic}</b> ({run!.turns_done}/{run!.max_turns} turnos)</p>
          <div className="grid grid-cols-2 gap-2">
            {run!.status === "running" ? <Button variant="soft" loading={busy} onClick={() => act({ action: "pause" })}>⏸️ Pausar</Button>
              : <Button variant="soft" loading={busy} onClick={() => act({ action: "resume" })}>▶️ Retomar</Button>}
            <Button variant="danger" loading={busy} onClick={() => act({ action: "stop" })}>⏹️ Interromper</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">As IAs conversam entre si sobre um assunto, sem ninguém precisar mandar mensagem.</p>
          <div>
            <div className="mb-1 text-sm font-medium">Assunto</div>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">IAs participantes</div>
            {members.filter((m) => m.ai_name).map((m) => (
              <label key={m.user_id} className={cx("mb-1 flex items-center gap-2 rounded-lg p-2", m.ai_ready ? "hover:bg-bg-hover" : "opacity-40")}>
                <input type="checkbox" disabled={!m.ai_ready} checked={chosen.includes(m.user_id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, m.user_id] : c.filter((x) => x !== m.user_id)))} />
                <Avatar emoji={m.ai_avatar ?? "🤖"} color={m.ai_color ?? "#7c5cff"} size={26} ai />
                <span className="text-sm">{m.ai_name}</span>
                {!m.ai_ready && <span className="text-xs text-amber-300">({m.ai_ready_reason})</span>}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-sm font-medium">Máx. de turnos</div>
              <Input type="number" min={2} max={settings.max_free_turns} value={turns} onChange={(e) => setTurns(Number(e.target.value))} />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">Duração (min)</div>
              <Input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Cada turno é uma chamada real à API do dono da IA (gera custo para ele). Limite do grupo: {settings.max_free_turns} turnos.</p>
          <Button className="w-full" loading={busy} disabled={chosen.length < 2 || topic.trim().length < 2}
            onClick={() => act({ action: "start", topic, participants: chosen, maxTurns: Math.min(turns, settings.max_free_turns), minutes })}>
            ▶️ Iniciar
          </Button>
          {chosen.length < 2 && <p className="text-xs text-amber-300">Escolha pelo menos 2 IAs prontas.</p>}
        </div>
      )}
    </Modal>
  );
}
