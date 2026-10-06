"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SUPPORT_MODULES } from "@/lib/support-policy";
import "./access.css";

type Grant = {
  id: string; status: string; reason: string; modules: (keyof typeof SUPPORT_MODULES)[];
  accessLevel: "READ_ONLY" | "OPERATIONAL"; requestedMinutes: number;
  requestedAt: string; expiresAt: string | null; rejectionReason: string | null;
  revocationReason: string | null; tenant: { id: string; nome: string };
  requester: { nome: string; email: string };
  events: { type: string; createdAt: string; detail: string | null }[];
};
type TenantChoice = { id: string; nome: string; ativo: boolean };

const statusLabel: Record<string, string> = {
  PENDING: "Pendente", ACTIVE: "Ativo", REJECTED: "Rejeitado",
  REVOKED: "Revogado", EXPIRED: "Expirado",
};
const eventLabel: Record<string, string> = {
  REQUESTED: "Solicitado", APPROVED: "Aprovado", REJECTED: "Rejeitado",
  ACTIVATED: "Ativado", USED: "Utilizado", REVOKED: "Revogado", EXPIRED: "Expirado",
};
function when(value: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }

export default function SupportClient({ mode }: { mode: "platform" | "tenant" }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [tenants, setTenants] = useState<TenantChoice[]>([]);
  const [form, setForm] = useState({ tenantId: "", reason: "", requestedMinutes: 60,
    accessLevel: "READ_ONLY" as "READ_ONLY" | "OPERATIONAL", modules: ["ESTRUTURA_EMPRESA"] as (keyof typeof SUPPORT_MODULES)[] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
  }, []);
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/support-grants?view=${mode}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar solicitações.");
      setGrants(data); setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (mode !== "platform") return;
    fetch("/api/platform/tenants", { cache: "no-store" }).then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTenants(data.filter((t: TenantChoice) => t.ativo)); })
      .catch(() => setError("Falha ao carregar tenants da plataforma."));
  }, [mode]);

  async function submit() {
    if (!form.tenantId || form.reason.trim().length < 15 || !form.modules.length) {
      setError("Escolha o tenant, ao menos um escopo e informe um motivo específico com 15 caracteres ou mais."); return;
    }
    if (form.accessLevel === "OPERATIONAL" && !window.confirm("Solicitar permissão operacional de criação, edição e importação nas telas selecionadas?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/support-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao solicitar acesso.");
      setForm(f => ({ ...f, reason: "" })); setNotice("Solicitação enviada ao responsável contratual do tenant."); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function decide(grant: Grant, action: "approve" | "reject" | "revoke") {
    if (action === "approve" && !window.confirm(`Autorizar ${grant.requester.nome} em ${grant.tenant.nome} por ${grant.requestedMinutes} minutos, nível ${grant.accessLevel}, escopo ${grant.modules.map(m => SUPPORT_MODULES[m].label).join(", ")}?`)) return;
    if (action === "revoke" && !window.confirm("Revogar este acesso imediatamente? A ação é irreversível.")) return;
    const reason = action === "reject" ? window.prompt("Motivo da rejeição (opcional):") :
      action === "revoke" ? window.prompt("Motivo da revogação (opcional):") : null;
    if ((action === "reject" || action === "revoke") && reason === null) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/support-grants/${grant.id}`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao decidir solicitação.");
      setNotice(action === "approve" ? "Acesso autorizado." : action === "reject" ? "Solicitação rejeitada." : "Acesso revogado.");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function toggleModule(module: keyof typeof SUPPORT_MODULES) {
    setForm(f => ({ ...f, modules: f.modules.includes(module) ? f.modules.filter(x => x !== module) : [...f.modules, module] }));
  }

  return <section className={`access-page ${mode === "platform" ? "access-platform" : ""}`}>
    <header className="access-header"><div><h1>{mode === "platform" ? "Administração da Plataforma / Suporte" : "Acessos / Suporte"}</h1>
      <p>{mode === "platform" ? "Solicite acesso temporário. A plataforma não concede acesso empresarial por si só." :
        "O responsável contratual decide solicitações externas para este tenant."}</p></div>
      <div className="access-header-actions">{mode === "platform" && <button className="access-button access-button-secondary" onClick={toggleTheme}>Alternar tema</button>}
        <Link className="access-button access-button-secondary" href={mode === "platform" ? "/plataforma" : "/acessos"}>Voltar</Link></div></header>

    {mode === "platform" && <div className="access-terms-form support-request">
      <h2>Solicitar acesso</h2>
      <label>Tenant<select value={form.tenantId} onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}>
        <option value="">Selecione o tenant</option>{tenants.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select></label>
      <label>Motivo específico<textarea value={form.reason} maxLength={500} rows={2}
        placeholder="Descreva o chamado, erro ou atividade autorizada" onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></label>
      <label>Duração<select value={form.requestedMinutes} onChange={e => setForm(f => ({ ...f, requestedMinutes: Number(e.target.value) }))}>
        <option value={60}>1 hora</option><option value={240}>4 horas</option><option value={1440}>1 dia</option>
      </select></label>
      <label>Nível<select value={form.accessLevel} onChange={e => setForm(f => ({ ...f, accessLevel: e.target.value as typeof form.accessLevel }))}>
        <option value="READ_ONLY">Somente leitura</option><option value="OPERATIONAL">Operacional: criar, editar e importar</option>
      </select></label>
      <fieldset className="support-modules"><legend>Escopo solicitado</legend>
        {(Object.keys(SUPPORT_MODULES) as (keyof typeof SUPPORT_MODULES)[]).map(m =>
          <label key={m}><input type="checkbox" checked={form.modules.includes(m)} onChange={() => toggleModule(m)} />{SUPPORT_MODULES[m].label}</label>)}
      </fieldset>
      <button className="access-button access-button-primary" disabled={busy} onClick={submit}>Solicitar autorização</button>
    </div>}
    {error && <p className="access-error" role="alert">{error}</p>}
    {notice && <p className="support-notice" role="status">{notice}</p>}
    <div className="access-terms-card"><div className="access-terms-card-head"><h2>Solicitações e histórico</h2>
      <button className="access-button access-button-secondary" disabled={busy} onClick={() => void load()}>Atualizar</button></div>
      {loading && <p>Carregando...</p>}
      {!loading && grants.length === 0 && <p className="access-hint">Nenhuma solicitação encontrada.</p>}
      <div className="support-grant-list">{grants.map(g => <article className="support-grant" key={g.id}>
        <div className="support-grant-head"><div><strong>{g.tenant.nome}</strong> <span className={`support-state support-state-${g.status.toLowerCase()}`}>{statusLabel[g.status] ?? g.status}</span></div>
          <span>{g.accessLevel === "READ_ONLY" ? "Somente leitura" : "Operacional"} · {g.requestedMinutes} min</span></div>
        <p><strong>Solicitante:</strong> {g.requester.nome} ({g.requester.email})</p>
        <p><strong>Motivo:</strong> {g.reason}</p>
        <p><strong>Escopo:</strong> {g.modules.map(m => SUPPORT_MODULES[m].label).join(", ")}</p>
        <p><strong>Solicitado:</strong> {when(g.requestedAt)} · <strong>Expira:</strong> {when(g.expiresAt)}</p>
        {g.rejectionReason && <p><strong>Rejeição:</strong> {g.rejectionReason}</p>}
        {g.revocationReason && <p><strong>Revogação:</strong> {g.revocationReason}</p>}
        <div className="support-actions">
          {mode === "tenant" && g.status === "PENDING" && <><button className="access-button access-button-primary" disabled={busy} onClick={() => void decide(g, "approve")}>Aprovar</button>
            <button className="access-button access-button-secondary" disabled={busy} onClick={() => void decide(g, "reject")}>Rejeitar</button></>}
          {g.status === "ACTIVE" && <button className="access-button access-button-secondary" disabled={busy} onClick={() => void decide(g, "revoke")}>Revogar acesso</button>}
        </div>
        <details><summary>Eventos ({g.events.length})</summary><ul>{g.events.map((event, i) =>
          <li key={i}>{when(event.createdAt)} · {eventLabel[event.type] ?? event.type}{event.detail ? ` · ${event.detail}` : ""}</li>)}</ul></details>
      </article>)}</div>
    </div>
  </section>;
}
