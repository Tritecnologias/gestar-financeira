"use client";
import { AppearanceButton } from "@/components/appearance/AppearanceProvider";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { resourceLabel, resourceOptions, accessModeLabel, presentationValue, messagePtBr } from "@/lib/presentation";
import "./access.css";

type Event = {
  id: string; occurredAt: string; actorName: string; tenantName: string | null;
  accessMode: string; action: string; resourceType: string; resourceId: string | null;
  result: string; reason: string | null; metadata: Record<string, unknown> | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  supportGrantId: string | null;
};
const labels: Record<string, string> = {
  LOGIN_SUCCESS: "Entrada na conta", LOGIN_FAILURE: "Falha ao entrar", LOGOUT: "Saída",
  PASSWORD_CHANGED: "Senha alterada", PASSWORD_CHANGE_DENIED: "Alteração de senha negada",
  TENANT_CONTEXT_SELECTED: "Empresa selecionada", TENANT_CONTEXT_SWITCHED: "Troca de empresa",
  IDENTITY_CREATED: "Conta criada", IDENTITY_ACTIVATED: "Conta ativada",
  IDENTITY_DEACTIVATED: "Conta desativada", MEMBERSHIP_CREATED: "Vínculo criado",
  MEMBERSHIP_ACTIVATED: "Vínculo ativado", MEMBERSHIP_DEACTIVATED: "Vínculo desativado",
  INVITE_CREATED: "Convite criado", INVITE_REVOKED: "Convite revogado",
  INVITE_EXPIRED: "Convite expirado", INVITE_ACCEPTED: "Convite aceito",
  INVITE_EMAIL_SENT: "E-mail de convite enviado", INVITE_EMAIL_SIMULATED: "Envio de convite simulado",
  INVITE_EMAIL_FAILED: "Falha no e-mail de convite",
  MEMBERSHIP_ROLE_CHANGED: "Papel alterado", ACCESS_PROFILE_CHANGED: "Perfil de acesso alterado",
  OWNER_ASSIGNED: "Proprietário designado", OWNER_REMOVED: "Proprietário removido", OWNER_REASSIGNED: "Proprietário reassociado",
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
  SUPPORT_OPERATOR_GRANTED: "Operador de suporte habilitado", SUPPORT_OPERATOR_REACTIVATED: "Operador de suporte reativado",
  SUPPORT_OPERATOR_OFFBOARDED: "Operador de suporte desligado", PLATFORM_ADMIN_GRANTED: "Administrador da Plataforma habilitado",
  IDENTITY_PROVISIONED: "Conta preparada", TENANT_CREATED: "Empresa criada", TENANT_UPDATED: "Empresa atualizada",
  BACKUP_CREATED: "Backup criado", BACKUP_PREVIEWED: "Prévia de backup consultada", BACKUP_RESTORED: "Backup restaurado",
  IDENTITY_DISABLED_ACCESS_ATTEMPT: "Tentativa de acesso com conta inativa", MEMBERSHIP_INACTIVE_ACCESS_ATTEMPT: "Tentativa de acesso com vínculo inativo",
  SESSION_BLOCKED: "Sessão bloqueada", SUPPORT_CONTEXT_DENIED: "Acesso de suporte negado",
  SUPPORT_OPERATOR_DISABLED: "Operador de suporte desativado", SUPPORT_PERSONAL_TERM_ACCEPTED: "Termo de suporte aceito",
  SUPPORT_REVOKED_BY_OFFBOARDING: "Suporte revogado no desligamento", DEV_MEMBERSHIP_DISABLED_BY_OFFBOARDING: "Vínculo de testes desativado no desligamento",
};
const fieldLabels: Record<string, string> = {
  role: "Papel", status: "Status", profile: "Perfil de Acesso", name: "Nome", nome: "Nome",
  active: "Ativo", ativo: "Ativo", permissions: "Permissões", plano: "Plano", plan: "Plano",
  membershipId: "Vínculo responsável",
};
function value(item: unknown) {
  if (item == null) return "—";
  if (typeof item === "boolean") return item ? "Sim" : "Não";
  if (Array.isArray(item)) return item.map(part => presentationValue(String(part))).join(", ");
  return presentationValue(String(item));
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
  return <main className={`access-page ${mode === "platform" ? "access-platform" : ""}`}>
    <header className="access-header"><div><h1>{mode === "platform" ? "Auditoria da Plataforma" : "Auditoria do Sistema"}</h1>
      <p>{mode === "platform" ? "Eventos globais, administração da plataforma e suporte autorizado." : "Eventos da empresa selecionada, conforme seu acesso nesta empresa."} Histórico somente leitura.</p></div>
      <div className="access-header-actions">{mode === "platform" && <AppearanceButton />}
        <Link className="access-button access-button-secondary" href={mode === "platform" ? "/plataforma" : "/acessos"}>Voltar</Link></div></header>
    <form className="audit-filters" onSubmit={event => { event.preventDefault(); apply(); }}>
      <label>De<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Até<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <label>Usuário<input value={filters.user} onChange={event => setFilters({ ...filters, user: event.target.value })} placeholder="Nome" /></label>
      <label>Ação<select value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value })}><option value="">Todas</option>{Object.entries(labels).sort((a,b) => a[1].localeCompare(b[1], "pt-BR")).map(([code,label]) => <option value={code} key={code}>{label}</option>)}</select></label>
      <label>Tipo<select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })}><option value="">Todos</option>{resourceOptions.map(([code,label]) => <option value={code} key={code}>{label}</option>)}</select></label>
      <label>Resultado<select value={filters.result} onChange={event => setFilters({ ...filters, result: event.target.value })}>
        <option value="">Todos</option><option value="SUCCESS">Sucesso</option><option value="DENIED">Negado</option><option value="FAILURE">Falha</option>
      </select></label>
      {mode === "platform" && <><label>Identificador da empresa<input value={filters.tenantId} onChange={event => setFilters({ ...filters, tenantId: event.target.value })} /></label>
        <label>Identificador da conta<input value={filters.identityId} onChange={event => setFilters({ ...filters, identityId: event.target.value })} /></label>
        <label>Identificador do administrador da plataforma<input value={filters.platformAdminId} onChange={event => setFilters({ ...filters, platformAdminId: event.target.value })} /></label>
        <label>Identificador do acesso de suporte<input value={filters.supportGrantId} onChange={event => setFilters({ ...filters, supportGrantId: event.target.value })} /></label></>}
      <button className="access-button access-button-primary" type="submit">Filtrar</button>
    </form>
    {error && <p className="access-error" role="alert">{error}</p>}
    <div className="audit-list" aria-live="polite">{loading ? <p>Carregando auditoria…</p> : rows.length ? rows.map(row => <article className="audit-event" key={row.id}>
      <div className="audit-event-head"><strong>{labels[row.action] ?? "Evento registrado"}</strong>
        <span className={row.result === "SUCCESS" ? "audit-result-ok" : "audit-result-denied"}>{row.result === "SUCCESS" ? "Concluído" : row.result === "DENIED" ? "Negado" : "Falhou"}</span></div>
      <p>{new Date(row.occurredAt).toLocaleString("pt-BR")} · {row.actorName} · {row.tenantName ?? "Plataforma"} · {accessModeLabel(row.accessMode)}</p>
      <p>{resourceLabel(row.resourceType)}{row.resourceId ? ` · ${row.resourceId}` : ""}{row.supportGrantId ? ` · Acesso de suporte ${row.supportGrantId}` : ""}</p>
      {row.changes && <div className="audit-changes">{[...new Set([...Object.keys(row.changes.before ?? {}), ...Object.keys(row.changes.after ?? {})])].map(key =>
        <div key={key}><strong>{fieldLabels[key] ?? key}</strong><span>{value(row.changes?.before?.[key])}</span><span aria-hidden="true">→</span><span>{value(row.changes?.after?.[key])}</span></div>)}</div>}
      {row.reason && <p>Motivo: {messagePtBr(row.reason)}</p>}
      <details><summary>Detalhes técnicos</summary><pre>{JSON.stringify({ action: row.action, resourceType: row.resourceType, accessMode: row.accessMode, metadata: row.metadata }, null, 2)}</pre></details>
    </article>) : <p className="access-hint">Nenhum evento encontrado.</p>}</div>
    <div className="audit-pages"><button className="access-button access-button-secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button>
      <span>Página {page}</span><button className="access-button access-button-secondary" disabled={!hasMore || loading} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </main>;
}
