"use client";
import { messagePtBr } from "@/lib/presentation";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { roleLabel } from "@/lib/presentation";
import { HomologIdentityBadge } from "@/components/identity/EnvironmentIdentity";
import "./tenant-selection.css";

type Choice = { id: string; nome: string; role?: "OWNER" | "ADMIN" | "MEMBER";
  kind?: "MEMBERSHIP" | "SUPPORT_GRANT" | "ADVISORY"; advisoryGrantId?: string; grantId?: string; accessLevel?: string;
  expiresAt?: string; entryPath?: string; isActive: boolean };

export default function SelecionarTenant() {
  const router = useRouter();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [supportOperator, setSupportOperator] = useState(false);
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);


  useEffect(() => {
    fetch("/api/tenants", { cache: "no-store" })
      .then(async res => {
        if (res.status === 401) { router.replace("/login"); return null; }
        if (!res.ok) throw new Error("Não foi possível carregar os vínculos ativos.");
        setPlatformAdmin(res.headers.get("X-Platform-Admin") === "true");
        setSupportOperator(res.headers.get("X-Support-Operator") === "true");
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setChoices(data); })
      .catch(() => setError("Não foi possível carregar os vínculos ativos."));
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (controller.signal.aborted || !data?.user) return;
        const name = typeof data.user.name === "string" ? data.user.name.trim() : "";
        const email = typeof data.user.email === "string" ? data.user.email.trim() : "";
        if (name || email) setIdentity({ name, email });
      }).catch(() => { /* Do not infer identity from a tenant or other data. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !choices?.length) return;
    let frame = 0;
    const rows = Array.from(list.children).slice(0, 5) as HTMLLIElement[];
    const measure = () => {
      const style = getComputedStyle(list);
      const height = rows.reduce((total, row) => total + row.getBoundingClientRect().height, 0)
        + parseFloat(style.rowGap) * (rows.length - 1)
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      list.style.setProperty("--five-choices-height", `${Math.ceil(height)}px`);
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(list);
    rows.forEach(row => observer.observe(row));
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [choices]);

  async function choose(choice: Choice) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tenants/switch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: choice.id, ...(choice.advisoryGrantId ? { advisoryGrantId: choice.advisoryGrantId } : {}), ...(choice.grantId ? { grantId: choice.grantId } : {}) }),
      });
      if (!res.ok) throw new Error("Este vínculo não está mais disponível.");
      window.location.assign(choice.grantId ? choice.entryPath ?? "/suporte" : "/inicio");
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return <main className="login-page tenant-selection-page" aria-labelledby="tenant-selection-title"><section className="login-card tenant-selection-card">
    <header className="tenant-selection-header">
      <img className="tenant-selection-brand" src="/experimentacao/assets/brand-approved.png" width={2508} height={627} alt="DEZ Soluções — Assessoria Empresarial" />
      <HomologIdentityBadge />
      {identity && <div className="tenant-selection-identity" role="group" aria-label="Usuário autenticado">
        {identity.name && <p className="tenant-selection-user-name">{identity.name}</p>}
        {identity.email && <p className="tenant-selection-user-email">{identity.email}</p>}
      </div>}
      <h1 id="tenant-selection-title">Selecionar empresa</h1>
      <p>Escolha seu vínculo empresarial, assessoria ou suporte autorizado.</p>
    </header>
    {(platformAdmin || supportOperator) && <nav className="tenant-selection-platform" aria-label="Administração e suporte">
      {platformAdmin && <Link className="btn tenant-selection-platform-button" href="/plataforma"><span>Administração da Plataforma</span><span aria-hidden="true">→</span></Link>}
      {supportOperator && <Link className="btn tenant-selection-support-button" href="/suporte">Área de Suporte</Link>}
    </nav>}
    {error && <p className="login-error" role="alert">{messagePtBr(error)}</p>}
    {choices === null && !error && <p className="tenant-selection-empty" role="status">Carregando...</p>}
    {choices?.length === 0 && <p className="tenant-selection-empty">Sua conta não possui acesso ativo a nenhuma empresa.</p>}
    {!!choices?.length && <section className="tenant-selection-choices" aria-labelledby="tenant-selection-list-title">
    <h2 id="tenant-selection-list-title">Minhas empresas</h2>
    <div className="tenant-selection-columns" aria-hidden="true"><span>ACESSO</span><span>MINHA FUNÇÃO</span></div>
    <ul className="tenant-selection-list" ref={listRef} aria-label="Empresas e vínculos disponíveis" tabIndex={choices.length > 5 ? 0 : undefined} aria-describedby={choices.length > 5 ? "tenant-selection-scroll-hint" : undefined}>
    {choices.map((choice, index) => <li key={choice.advisoryGrantId ?? choice.grantId ?? choice.id}>
      {(choice.kind === "ADVISORY" || choice.kind === "SUPPORT_GRANT") && (index === 0 || choices[index - 1].kind !== choice.kind) && <p className="tenant-selection-group">
        {choice.kind === "ADVISORY" ? "ASSESSORIA DEZ" : "SUPORTE AUTORIZADO"}</p>}
      <button className="btn tenant-selection-choice" type="button" aria-current={choice.isActive ? "true" : undefined}
      disabled={busy} onClick={() => choose(choice)}
      >
      <span className="tenant-selection-name">{choice.nome}</span>
      <span className="tenant-selection-role">
        {choice.kind === "SUPPORT_GRANT" ? `Suporte ${choice.accessLevel === "READ_ONLY" ? "somente leitura" : "operacional"} · expira ${choice.expiresAt ? new Date(choice.expiresAt).toLocaleString("pt-BR") : "—"}` :
          choice.kind === "ADVISORY" ? "Assessoria DEZ" : roleLabel(choice.role ?? "ADMIN")}
      </span>
    </button></li>)}
    </ul></section>}
    {(choices?.length ?? 0) > 5 && <p id="tenant-selection-scroll-hint" className="tenant-selection-scroll-hint">Role a lista para ver os outros acessos.</p>}
    <nav className="tenant-selection-account" aria-label="Conta e sessão">
      <button className="btn tenant-selection-clear" type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await fetch("/api/access/context/clear", { method: "POST" }); if (r.ok) window.location.assign(platformAdmin ? "/plataforma" : "/selecionar-tenant"); else { setError("Não foi possível encerrar o contexto."); setBusy(false); } }}>Sair do contexto empresarial</button>
      <Link className="btn" href="/minha-conta">Minha conta</Link>
      <button type="button" className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
    </nav>
  </section></main>;
}
