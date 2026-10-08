"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";

type Choice = { id: string; nome: string; role?: "OWNER" | "ADMIN" | "MEMBER";
  kind?: "MEMBERSHIP" | "SUPPORT_GRANT"; grantId?: string; accessLevel?: string;
  expiresAt?: string; isActive: boolean };

export default function SelecionarTenant() {
  const router = useRouter();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    fetch("/api/tenants", { cache: "no-store" })
      .then(async res => {
        if (res.status === 401) { router.replace("/login"); return null; }
        if (!res.ok) throw new Error("Não foi possível carregar os vínculos ativos.");
        setPlatformAdmin(res.headers.get("X-Platform-Admin") === "true");
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setChoices(data); })
      .catch(() => setError("Não foi possível carregar os vínculos ativos."));
  }, [router]);

  async function choose(choice: Choice) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tenants/switch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: choice.id, ...(choice.grantId ? { grantId: choice.grantId } : {}) }),
      });
      if (!res.ok) throw new Error("Este vínculo não está mais disponível.");
      window.location.assign(choice.grantId ? "/estrutura/dimensao-empresa" : "/inicio");
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return <div className="login-page"><div className="login-card" style={{ width: "min(460px, 94vw)" }}>
    <div className="login-logo"><span className="logo-icon">💼</span><h1>Dez <strong>Soluções</strong></h1></div>
    <h2 style={{ marginBottom: 8 }}>Selecionar empresa</h2>
    <p style={{ color: "var(--text-secondary)", marginBottom: 18 }}>Escolha um vínculo empresarial ou suporte autorizado.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {choices === null && !error && <p>Carregando...</p>}
    {choices?.length === 0 && <p>Esta identidade não possui acesso empresarial ativo.</p>}
    {platformAdmin && <Link className="btn" href="/plataforma" style={{ display: "inline-flex", marginBottom: 12 }}>Administração da Plataforma</Link>}
    {choices?.map((choice, index) => <div key={choice.grantId ?? choice.id}>
      {(index === 0 || choices[index - 1].kind !== choice.kind) && <p style={{ fontSize: 11, fontWeight: 700, margin: "10px 0 5px", color: "var(--text-secondary)" }}>
        {choice.kind === "SUPPORT_GRANT" ? "SUPORTE AUTORIZADO" : "MEUS TENANTS"}</p>}
      <button className="btn" type="button"
      disabled={busy} onClick={() => choose(choice)}
      style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", gap: 6,
        whiteSpace: "normal",
        textAlign: "left", marginBottom: 8, minHeight: 44,
        background: "var(--surface-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <span style={{ flex: "1 1 140px", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>{choice.nome}</span>
      <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {choice.kind === "SUPPORT_GRANT" ? `Suporte ${choice.accessLevel === "READ_ONLY" ? "somente leitura" : "operacional"} · expira ${choice.expiresAt ? new Date(choice.expiresAt).toLocaleString("pt-BR") : "—"}` :
          choice.role === "MEMBER" ? "Membro" : choice.role === "OWNER" ? "Proprietário" : "Admin"}
      </span>
    </button></div>)}
    <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
  </div></div>;
}
