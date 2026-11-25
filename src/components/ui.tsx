"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "ghost" | "danger" | "soft";
export function Button({
  variant = "primary", className, loading, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none";
  const v: Record<BtnVariant, string> = {
    primary: "bg-accent text-white hover:brightness-110 shadow-lg shadow-accent/20",
    soft: "bg-bg-hover text-slate-100 hover:bg-line",
    ghost: "text-slate-300 hover:bg-bg-hover",
    danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
  };
  return (
    <button className={cx(base, v[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-white/30 border-t-white", small ? "h-4 w-4" : "h-6 w-6")} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-bg-card/90 p-4 backdrop-blur", className)}>{children}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx("w-full rounded-xl border border-line bg-bg-soft px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-500 focus:border-accent", props.className)}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx("w-full rounded-xl border border-line bg-bg-soft px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-500 focus:border-accent", props.className)}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="text-sm font-medium text-slate-200">{children}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-center justify-between gap-3", disabled && "opacity-50")}>
      {label && <span className="text-sm">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-accent-soft">{value}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

export function Avatar({ emoji, color, size = 40, ai }: { emoji: string; color: string; size?: number; ai?: boolean }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: color + "33", boxShadow: `inset 0 0 0 2px ${color}`, fontSize: size * 0.5 }}
    >
      <span>{emoji}</span>
      {ai && (
        <span className="absolute -bottom-1 -right-1 rounded-md bg-bg px-1 text-[9px] font-bold leading-4" style={{ color }}>
          IA
        </span>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className={cx("max-h-[92dvh] w-full animate-pop overflow-y-auto rounded-t-3xl border border-line bg-bg-card p-5 scroll-thin sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-bg-hover" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TopBar({ title, back, right }: { title: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/85 px-3 py-3 backdrop-blur">
      {back && <Link href={back} className="rounded-lg px-2 py-1 text-xl text-slate-300 hover:bg-bg-hover" aria-label="Voltar">←</Link>}
      <div className="min-w-0 flex-1 truncate text-lg font-bold">{title}</div>
      {right}
    </header>
  );
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; kind: "ok" | "error" | "info" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto max-w-md animate-pop rounded-xl border px-4 py-2.5 text-sm shadow-xl",
              t.kind === "error" ? "border-red-500/40 bg-red-950/90 text-red-100" : t.kind === "ok" ? "border-green-500/40 bg-green-950/90 text-green-100" : "border-line bg-bg-card text-slate-100",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function ThemeApplier() {
  useEffect(() => {
    try {
      const t = localStorage.getItem("aif-theme");
      if (t) document.documentElement.dataset.theme = t;
    } catch { /* sem storage */ }
  }, []);
  return null;
}

export function setTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("aif-theme", theme); } catch { /* ignore */ }
}

export const EMOJIS = ["😂", "🤣", "😎", "🔥", "💀", "👀", "😭", "🤡", "👏", "❤️", "👍", "👎", "🙄", "😤", "🤔", "😅", "🥶", "🐐", "⚽", "🏆", "💸", "🍿", "🧠", "🤖", "🎉", "😴", "🫡", "🤝", "😈", "🙏"];
export const AVATARS = ["🙂", "😎", "🤠", "🦊", "🐺", "🐯", "🦁", "🐸", "🐼", "👽", "🤖", "🧙", "🥷", "👑", "🃏", "👀", "🧠", "🧊", "🌀", "⚡", "🔥", "🎮", "⚽", "🎤", "🤓", "🧌", "🤝", "😈", "🐐", "💎"];
export const COLORS = ["#7c5cff", "#3b82f6", "#06b6d4", "#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#94a3b8"];

export function EmojiGrid({ items, onPick, value }: { items: string[]; onPick: (e: string) => void; value?: string }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {items.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} className={cx("rounded-lg p-1.5 text-xl hover:bg-bg-hover", value === e && "bg-accent/30")}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c}
          className={cx("h-8 w-8 rounded-full transition", value === c && "ring-2 ring-white ring-offset-2 ring-offset-bg-card")}
          style={{ background: c }} />
      ))}
    </div>
  );
}

export function CostNotice({ compact }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
      <b>⚠️ Aviso sobre custos.</b> As APIs de inteligência artificial podem gerar custos. O uso da OpenAI API, Anthropic API e Google Gemini API
      depende das condições comerciais de cada provedor.
      {!compact && (
        <> Ter uma assinatura do ChatGPT Plus, Claude Pro ou outro plano de assinatura <b>não</b> significa ter créditos gratuitos ou ilimitados
          para usar as APIs. Cada usuário é responsável pelos custos gerados pela sua própria chave de API. O AI FRIENDS não oferece uso gratuito nem ilimitado.</>
      )}
    </div>
  );
}

export function timeHM(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
