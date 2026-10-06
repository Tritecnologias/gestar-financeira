"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import "./access.css";

type Event = {
  id: string; occurredAt: string; actorName: string; tenantName: string | null;
  accessMode: string; action: string; resourceType: string; resourceId: string | null;
  result: string; reason: string | null; metadata: Record<string, unknown> | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  supportGrantId: string | null;
};
const labels: Record<string, string> = {
  LOGIN_SUCCESS: "Login", LOGIN_FAILURE: "Falha de login", LOGOUT: "Saída",
  TENANT_CONTEXT_SELECTED: "Tenant selecionado", TENANT_CONTEXT_SWITCHED: "Troca de tenant",
  IDENTITY_CREATED: "Identidade criada", IDENTITY_ACTIVATED: "Identidade ativada",
  IDENTITY_DEACTIVATED: "Identidade desativada", MEMBERSHIP_CREATED: "Vínculo criado",
  MEMBERSHIP_ACTIVATED: "Vínculo ativado", MEMBERSHIP_DEACTIVATED: "Vínculo desativado",
  MEMBERSHIP_ROLE_CHANGED: "Papel alterado", ACCESS_PROFILE_CHANGED: "Perfil de acesso alterado",
  OWNER_ASSIGNED: "OWNER designado", OWNER_REMOVED: "OWNER removido", OWNER_REASSIGNED: "OWNER reassociado",
  PERMISSION_PROFILE_CREATED: "Perfil criado", PERMISSION_PROFILE_CHANGED: "Perfil alterado",
  PERMISSION_PROFILE_DISABLED: "Perfil inativado", TERM_DOCUMENT_CREATED: "Documento criado",
  TERM_VERSION_UPLOADED: "Versão enviada", TERM_VERSION_PUBLISHED: "Versão publicada",
  TERM_VERSION_RETIRED: "Versão retirada", TERM_ACCEPTED: "Termo aceito",
  TERM_REACCEPT_REQUIRED: "Reaceite necessário", SUPPORT_REQUESTED: "Suporte solicitado",
  SUPPORT_APPROVED: "Suporte aprovado", SUPPORT_REJECTED: "Suporte rejeitado",
  SUPPORT_ACTIVATED: "Suporte ativado", SUPPORT_CONTEXT_ENTERED: "Modo suporte iniciado",
  SUPPORT_ACTION_EXECUTED: "Acesso de suporte", SUPPORT_ACTION_DENIED: "Ação de suporte negada",
  SUPPORT_REVOKED: "Suporte revogado", SUPPORT_EXPIRED: "Suporte expirado",
  SUPPORT_ENDED_BY_PLATFORM_ADMIN: "Suporte encerrado pelo solicitante",
};
const fieldLabels: Record<string, string> = {
  role: "Papel", status: "Status", profile: "Perfil de Acesso", name: "Nome", nome: "Nome",
  active: "Ativo", ativo: "Ativo", permissions: "Permissões", plano: "Plano", plan: "Plano",
  membershipId: "Vínculo responsável",
};
function value(item: unknown) {
  if (item == null) return "—";
  if (typeof item === "boolean") return item ? "Sim" : "Não";
  if (Array.isArray(item)) return item.join(", ");
  return String(item);
}

export default function AuditClient({ mode }: { mode: "platform" | "tenant" }) {
  const [filters, setFilters] = useState({ from: "", to: "", user: "", action: "", type: "", result: "",
    tenantId: "", identityId: "", platformAdminId: "", supportGrantId: "" });
  const [applied, setApplied] = useState(filters);
  const [rows, setRows] = useState<Event[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ view: mode, page: String(page) });
      for (const [key, item] of Object.entries(applied)) if (item) query.set(key, item);
      const response = await fetch(`/api/audit?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao consultar auditoria.");
      setRows(result.rows); setHasMore(result.hasMore); setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [mode, page, applied]);
  useEffect(() => { void load(); }, [load]);
  function apply() { setPage(1); setApplied({ ...filters }); }
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next); localStorage.setItem("theme", next);
  }
  return <main className={`access-page ${mode === "platform" ? "access-platform" : ""}`}>
    <header className="access-header"><div><h1>{mode === "platform" ? "Auditoria da Plataforma" : "Auditoria do Tenant"}</h1>
      <p>Eventos críticos de acesso e administração. Histórico somente leitura.</p></div>
      <div className="access-header-actions">{mode === "platform" && <button type="button" className="access-button access-button-secondary" onClick={toggleTheme}>Alternar tema</button>}
        <Link className="access-button access-button-secondary" href={mode === "platform" ? "/plataforma" : "/acessos"}>Voltar</Link></div></header>
    <form className="audit-filters" onSubmit={event => { event.preventDefault(); apply(); }}>
      <label>De<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Até<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <label>Usuário<input value={filters.user} onChange={event => setFilters({ ...filters, user: event.target.value })} placeholder="Nome" /></label>
      <label>Ação<input value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value.toUpperCase() })} placeholder="Ex.: SUPPORT_APPROVED" /></label>
      <label>Tipo<input value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })} placeholder="Ex.: SupportGrant" /></label>
      <label>Resultado<select value={filters.result} onChange={event => setFilters({ ...filters, result: event.target.value })}>
        <option value="">Todos</option><option value="SUCCESS">Sucesso</option><option value="DENIED">Negado</option><option value="FAILURE">Falha</option>
      </select></label>
      {mode === "platform" && <><label>Tenant ID<input value={filters.tenantId} onChange={event => setFilters({ ...filters, tenantId: event.target.value })} /></label>
        <label>Identity ID<input value={filters.identityId} onChange={event => setFilters({ ...filters, identityId: event.target.value })} /></label>
        <label>PlatformAdmin ID<input value={filters.platformAdminId} onChange={event => setFilters({ ...filters, platformAdminId: event.target.value })} /></label>
        <label>SupportGrant ID<input value={filters.supportGrantId} onChange={event => setFilters({ ...filters, supportGrantId: event.target.value })} /></label></>}
      <button className="access-button access-button-primary" type="submit">Filtrar</button>
    </form>
    {error && <p className="access-error" role="alert">{error}</p>}
    <div className="audit-list" aria-live="polite">{loading ? <p>Carregando auditoria…</p> : rows.length ? rows.map(row => <article className="audit-event" key={row.id}>
      <div className="audit-event-head"><strong>{labels[row.action] ?? row.action}</strong>
        <span className={row.result === "SUCCESS" ? "audit-result-ok" : "audit-result-denied"}>{row.result === "SUCCESS" ? "Concluído" : row.result === "DENIED" ? "Negado" : "Falhou"}</span></div>
      <p>{new Date(row.occurredAt).toLocaleString("pt-BR")} · {row.actorName} · {row.tenantName ?? "Plataforma"} · {row.accessMode}</p>
      <p>{row.resourceType}{row.resourceId ? ` · ${row.resourceId}` : ""}{row.supportGrantId ? ` · Grant ${row.supportGrantId}` : ""}</p>
      {row.changes && <div className="audit-changes">{[...new Set([...Object.keys(row.changes.before ?? {}), ...Object.keys(row.changes.after ?? {})])].map(key =>
        <div key={key}><strong>{fieldLabels[key] ?? key}</strong><span>{value(row.changes?.before?.[key])}</span><span aria-hidden="true">→</span><span>{value(row.changes?.after?.[key])}</span></div>)}</div>}
      {row.reason && <p>Motivo: {row.reason}</p>}
      {row.metadata && <details><summary>Detalhes técnicos</summary><pre>{JSON.stringify(row.metadata, null, 2)}</pre></details>}
    </article>) : <p className="access-hint">Nenhum evento encontrado.</p>}</div>
    <div className="audit-pages"><button className="access-button access-button-secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button>
      <span>Página {page}</span><button className="access-button access-button-secondary" disabled={!hasMore || loading} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </main>;
}
