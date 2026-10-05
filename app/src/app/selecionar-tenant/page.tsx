"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

type Choice = { id: string; nome: string; role?: "OWNER" | "ADMIN" | "MEMBER"; isActive: boolean };

export default function SelecionarTenant() {
  const router = useRouter();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    fetch("/api/tenants", { cache: "no-store" })
      .then(async res => {
        if (res.status === 401) { router.replace("/login"); return null; }
        if (!res.ok) throw new Error("Não foi possível carregar os vínculos ativos.");
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setChoices(data); })
      .catch(() => setError("Não foi possível carregar os vínculos ativos."));
  }, [router]);

  async function choose(tenantId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tenants/switch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) throw new Error("Este vínculo não está mais disponível.");
      window.location.assign("/lancamentos");
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return <div className="login-page"><div className="login-card" style={{ width: "min(460px, 94vw)" }}>
    <div className="login-logo"><span className="logo-icon">💼</span><h1>Dez <strong>Soluções</strong></h1></div>
    <h2 style={{ marginBottom: 8 }}>Selecionar empresa</h2>
    <p style={{ color: "var(--text-secondary)", marginBottom: 18 }}>Escolha um dos seus vínculos ativos para continuar.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {choices === null && !error && <p>Carregando...</p>}
    {choices?.length === 0 && <p>Esta identidade não possui acesso empresarial ativo.</p>}
    {choices?.map(choice => <button key={choice.id} className="btn" type="button"
      disabled={busy} onClick={() => choose(choice.id)}
      style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", gap: 6,
        whiteSpace: "normal",
        textAlign: "left", marginBottom: 8, minHeight: 44,
        background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <span style={{ flex: "1 1 140px", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>{choice.nome}</span>
      <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {choice.role === "MEMBER" ? "Membro" : choice.role === "OWNER" ? "Proprietário" : "Admin"}
      </span>
    </button>)}
    <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
  </div></div>;
}
