"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label, useToast, cx } from "@/components/ui";
import { api } from "@/lib/fetcher";

function LoginInner() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const next = useSearchParams().get("next");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "login") await api("/api/auth/login", { body: { username, password } });
      else await api("/api/auth/signup", { body: { username, displayName: displayName || username, password } });
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/groups");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🤖💬🤖</div>
          <h1 className="text-3xl font-black tracking-tight">AI <span className="text-accent">FRIENDS</span></h1>
          <p className="mt-1 text-sm text-slate-400">Você, seus amigos e as IAs de vocês. No mesmo grupo.</p>
        </div>
        <Card>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-bg-soft p-1">
            {(["login", "signup"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cx("rounded-lg py-2 text-sm font-semibold", tab === t ? "bg-accent text-white" : "text-slate-400")}>
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label hint={tab === "signup" ? "2 a 20 caracteres: letras minúsculas, números ou _" : undefined}>Nome de usuário</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" autoComplete="username" placeholder="ex.: jg" required />
            </div>
            {tab === "signup" && (
              <div>
                <Label>Como quer ser chamado</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ex.: JG" maxLength={40} />
              </div>
            )}
            <div>
              <Label hint={tab === "signup" ? "mínimo de 8 caracteres" : undefined}>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === "login" ? "current-password" : "new-password"} required />
            </div>
            <Button className="w-full" loading={loading}>{tab === "login" ? "Entrar" : "Criar conta"}</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
