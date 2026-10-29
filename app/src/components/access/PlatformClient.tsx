"use client";
import { messagePtBr } from "@/lib/presentation";
import { AppearanceButton } from "@/components/appearance/AppearanceProvider";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { planLabel, roleLabel, statusLabel } from "@/lib/presentation";
import InvitationShareDialog, { type InvitationShare } from "@/components/access/InvitationShareDialog";
import "./access.css";
import "./platform-hierarchy.css";
import { platformHierarchy, type PlatformTenant as Tenant, type PlatformIdentity as Identity, type PlatformMembership as Membership } from "@/lib/platform-hierarchy";
import { HomologIdentityBadge } from "@/components/identity/EnvironmentIdentity";

type OwnerInvite = { id: string; name: string; email: string; status: string; expiresAt: string };


async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Falha ao carregar.");
  return body;
}

export default function PlatformClient({ supportOperator = false, experimentPilot = false }: { supportOperator?: boolean; experimentPilot?: boolean }) {

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [searchCollapsed, setSearchCollapsed] = useState<Set<string>>(() => new Set());
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"" | "create" | "edit" | "owner" | "responsible">("");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ nome: "", email: "", plano: "trial" });
  const [ownerForm, setOwnerForm] = useState({ nome: "", email: "" });
  const [share, setShare] = useState<InvitationShare | null>(null);
  const closeShare = useCallback(() => setShare(null), []);
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [ownerInvites, setOwnerInvites] = useState<OwnerInvite[]>([]);
  const [responsibleMembershipId, setResponsibleMembershipId] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!mode) return;
    const element = dialog.current, opener = document.activeElement as HTMLElement | null;
    element?.showModal(); element?.querySelector<HTMLButtonElement>('[data-dialog-back]')?.focus();
    return () => { element?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, i, m] = await Promise.all([
        read<Tenant[]>("/api/platform/tenants"), read<Identity[]>("/api/platform/identities"),
        read<Membership[]>("/api/platform/memberships"),
      ]);
      setTenants(t); setIdentities(i); setMemberships(m); setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => platformHierarchy(tenants, identities, memberships, query), [query, tenants, identities, memberships]);
  function toggleGroup(id: string) {
    const update = (old: Set<string>) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; };
    if (query.trim()) setSearchCollapsed(update); else setExpanded(update);
  }

  async function submit() {
    if (mode === "owner" && !window.confirm(`Designar ${ownerForm.email} como Proprietário de ${selected?.nome}? Esta ação concede administração essencial da empresa e será registrada.`)) return;
    if (mode === "responsible" && !window.confirm(`Designar o Proprietário selecionado como responsável contratual de ${selected?.nome}?`)) return;
    setBusy(true); setError(""); setShare(null); setDeliveryNotice("");
    try {
      const existingOwnerCandidate = mode === "owner" && memberships.some(m =>
        m.tenant.id === selected?.id && m.identity.email.toLowerCase() === ownerForm.email.trim().toLowerCase());
      const url = mode === "responsible" ? `/api/platform/tenants/${selected!.id}/contractual-responsible`
        : mode === "owner" ? `/api/platform/tenants/${selected!.id}/${existingOwnerCandidate ? "owners" : "owner-invitations"}`
        : mode === "edit" ? `/api/platform/tenants/${selected!.id}` : "/api/tenants";
      const response = await fetch(url, { method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "responsible" ? { membershipId: responsibleMembershipId, confirm: true }
          : mode === "owner" ? { ...ownerForm, confirm: true, channel: "MANUAL_SHARE" } : tenantForm) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir.");
      setShare(body.share ?? null);
      if (mode === "owner" && !existingOwnerCandidate) setDeliveryNotice(body.delivery?.status === "SENT" ?
        "Convite de proprietário enviado por e-mail." : body.delivery?.status === "MANUAL_SHARE" ?
          "Convite de proprietário criado. Compartilhe somente com o destinatário." : body.delivery?.status === "SIMULATED" ?
          "Convite de proprietário simulado no DEV; nenhum e-mail foi enviado." :
          "Convite de proprietário criado, mas o e-mail não foi enviado. Reenvie pela lista de convites.");
      setMode(""); setSelected(null); setOwnerForm({ nome: "", email: "" }); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function openOwner(t: Tenant, candidate?: Membership) {
    setOwnerInvites([]); setShare(null); setSelected(t); setOwnerForm({ nome: "", email: candidate?.identity.email ?? "" }); setError(""); setMode("owner");
    try { setOwnerInvites(await read<OwnerInvite[]>(`/api/platform/tenants/${t.id}/owner-invitations`)); }
    catch (cause) { setError((cause as Error).message); }
  }

  async function ownerInviteAction(inviteId: string, action: "resend" | "revoke") {
    if (!selected || !window.confirm(action === "revoke" ? "Revogar convite de proprietário?" : "Gerar novo link de proprietário e invalidar o anterior?")) return;
    setBusy(true); setError(""); setShare(null); setDeliveryNotice("");
    try {
      const url = `/api/platform/tenants/${selected.id}/owner-invitations`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, action, channel: "MANUAL_SHARE" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar convite de proprietário.");
      setShare(body.share ?? null);
      setDeliveryNotice(action === "revoke" ? "Convite de proprietário revogado." : body.delivery?.status === "SENT" ?
        "Novo convite de proprietário enviado por e-mail." : body.delivery?.status === "MANUAL_SHARE" ?
          "Novo convite de proprietário criado. O link anterior não funciona mais." : body.delivery?.status === "SIMULATED" ?
          "Novo convite de proprietário simulado no DEV; nenhum e-mail foi enviado." :
          "Novo convite de proprietário criado, mas o e-mail não foi enviado. Tente novamente após o limite de segurança.");
      setOwnerInvites(await read<OwnerInvite[]>(url));
      if (body.share) { setMode(""); setSelected(null); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function edit(t: Tenant) { setSelected(t); setTenantForm({ nome: t.nome, email: t.email, plano: t.plano }); setMode("edit"); }
  async function toggle(t: Tenant) {
    if (!window.confirm(`${t.ativo ? "Inativar" : "Ativar"} a empresa ${t.nome}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/platform/tenants/${t.id}`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !t.ativo }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar empresa.");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="access-page access-platform platform-hierarchy">
    <header className="access-header"><div><h1>Administração da Plataforma</h1><HomologIdentityBadge />
      <p>Empresas, contas e vínculos de acesso. Os dados de cada empresa exigem acesso autorizado.</p></div>
      <div className="access-header-actions"><Link href="/minha-conta" className="access-button access-button-secondary">Minha conta</Link><AppearanceButton />
        {supportOperator && <Link href="/suporte" className="access-button access-button-secondary">Área de Suporte</Link>}
        <Link href="/plataforma/auditoria" className="access-button access-button-secondary">Auditoria da Plataforma</Link>
        <Link href="/plataforma/termos" className="access-button access-button-secondary">Termos e Políticas</Link>
        <Link href="/selecionar-tenant" className="access-button access-button-secondary">Selecionar empresa</Link></div>
    </header>
    <div className="access-toolbar platform-global-toolbar">
      <label>Busca global<input type="search" aria-label="Busca global da administração" placeholder="Empresa, conta, nome, e-mail ou vínculo" autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setSearchCollapsed(new Set()); }} /></label>
      <button type="button" className="access-button access-button-primary" onClick={() => { setTenantForm({ nome: "", email: "", plano: "trial" }); setError(""); setMode("create"); }}>+ Criar tenant manual</button>
      {experimentPilot && <Link href="/plataforma/convites-especiais" className="access-button access-button-secondary">+ Convites Especiais</Link>}
    </div>
    {error && <p className="access-error" role="alert">{messagePtBr(error)}</p>}
    {deliveryNotice && <p className="access-hint" role="status">{deliveryNotice}</p>}
    {share && <InvitationShareDialog invitation={share} onClose={closeShare} />}
    <section aria-labelledby="platform-companies-title"><h2 id="platform-companies-title" className="platform-section-title">Empresas e contas vinculadas</h2>
      <p className="access-hint" role="status">{loading ? "Carregando catálogo administrativo…" : `${shown.groups.length} de ${tenants.length} empresas. Expanda uma empresa para consultar suas contas, papéis e perfis.`}</p>
      <div className="access-table-wrap platform-company-scroll" role="region" aria-label="Empresas e vínculos" tabIndex={0}><table className="access-table platform-company-table"><caption>Empresas e relações administrativas</caption><thead><tr><th scope="col">Empresa</th><th scope="col">E-mail administrativo</th><th scope="col">Plano</th><th scope="col">Situação</th><th scope="col">Vínculos</th><th scope="col">Ações</th></tr></thead><tbody>
      {shown.groups.map(({ tenant: t, memberships: members, totalMemberships }) => {
        const open = query.trim() ? !searchCollapsed.has(t.id) : expanded.has(t.id);
        return <Fragment key={t.id}><tr><th scope="row"><button type="button" className="platform-expand" aria-expanded={open} aria-controls={`platform-members-${t.id}`} aria-label={`${open ? "Recolher" : "Expandir"} contas de ${t.nome}`} onClick={() => toggleGroup(t.id)}><span aria-hidden="true">{open ? "▾" : "▸"}</span><span><strong>{t.nome}</strong><small>{t.slug}</small></span></button></th>
          <td className="platform-email">{t.email}</td><td>{planLabel(t.plano)}</td><td><span className={`platform-state ${t.ativo ? "platform-state-active" : "platform-state-inactive"}`}>{t.ativo ? "Ativo" : "Inativo"}</span>
            {t.activeOwnerCount === 0 && <small className="access-warning">Sem Proprietário ativo · designação necessária</small>}
            <small className={t.contractualStatus === "Contrato ativo" ? "access-hint" : "access-warning"}>{t.contractualStatus}</small>
            {t.lastOwnerDesignationAt && <small>Última designação: {new Date(t.lastOwnerDesignationAt).toLocaleDateString("pt-BR")}</small>}</td><td>{query.trim() && members.length !== totalMemberships ? `${members.length} de ${totalMemberships}` : totalMemberships}</td>
          <td><div className="platform-tenant-actions"><button type="button" disabled={busy} className="platform-action platform-action-edit" aria-label={`Editar empresa ${t.nome}`} title="Editar empresa" onClick={() => edit(t)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="m16 3 5 5-12 12H4v-5L16 3Zm-1 4 2 2M3 22h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <button type="button" className={`platform-action ${t.ativo ? "platform-action-danger" : "platform-action-warning"}`} disabled={busy} onClick={() => toggle(t)}>{t.ativo ? "Inativar" : "Ativar"}</button>
            <button type="button" disabled={busy} className="platform-action platform-action-neutral" onClick={() => void openOwner(t)}>{t.activeOwnerCount ? "Adicionar Proprietário" : "Designar Proprietário"}</button>
            <button type="button" disabled={busy} className="platform-action platform-action-neutral" onClick={() => { setSelected(t); setResponsibleMembershipId(t.contractualResponsibleMembershipId || ""); setError(""); setMode("responsible"); }}>Responsável contratual</button></div></td></tr>
          {open && <tr className="platform-detail-row"><td colSpan={6}><section id={`platform-members-${t.id}`} aria-label={`Contas vinculadas a ${t.nome}`}><h3>Contas vinculadas · {t.nome}</h3>
            <div className="access-table-wrap" role="region" aria-label={`Vínculos de ${t.nome}`} tabIndex={0}><table className="access-table platform-member-table"><caption>Contas, funções e perfis em {t.nome}</caption><thead><tr><th scope="col">Conta global</th><th scope="col">Função no tenant</th><th scope="col">Perfil de acesso</th><th scope="col">Situação do vínculo</th><th scope="col">Ações administrativas</th></tr></thead><tbody>
            {members.map(m => { const identity = shown.accountById.get(m.identity.id); return <tr key={m.id}><th scope="row"><strong>{m.identity.nome}</strong><small className="platform-email">{m.identity.email}</small><small>Conta: {statusLabel(identity?.status ?? "")}{identity?.platformAdmin ? ` · PlatformAdmin ${statusLabel(identity.platformAdmin.status).toLowerCase()}` : ""}</small></th>
              <td>{roleLabel(m.role)}</td><td>{m.profile?.nome ?? "Sem perfil"}</td><td><span className={`platform-state ${m.status === "ACTIVE" ? "platform-state-active" : "platform-state-inactive"}`}>{statusLabel(m.status)}</span><small>Referência: {m.id.slice(0, 8)}</small></td>
              <td>{m.role === "OWNER" && m.status === "ACTIVE" ? t.contractualResponsibleMembershipId === m.id ? <span className="access-hint">Responsável contratual atual</span> : <button type="button" className="platform-action platform-action-neutral" onClick={() => { setSelected(t); setResponsibleMembershipId(m.id); setError(""); setMode("responsible"); }}>Responsável contratual</button>
                : <button type="button" className="platform-action platform-action-neutral" onClick={() => void openOwner(t, m)}>{t.activeOwnerCount ? "Adicionar Proprietário" : "Designar Proprietário"}</button>}</td></tr>; })}
            {!members.length && <tr><td colSpan={5} className="access-empty">{query.trim() ? "Nenhum vínculo corresponde à busca nesta empresa." : "Esta empresa ainda não possui contas vinculadas."}</td></tr>}
            </tbody></table></div></section></td></tr>}
        </Fragment>;
      })}
      {!shown.groups.length && <tr><td colSpan={6} className="access-empty">{loading ? "Carregando empresas…" : "Nenhuma empresa ou conta vinculada corresponde à busca."}</td></tr>}
      </tbody></table></div>
    </section>
    <section className="platform-global-accounts" aria-labelledby="platform-global-accounts-title"><h2 id="platform-global-accounts-title" className="platform-section-title">Contas globais sem vínculo empresarial</h2>
      <p className="access-hint">Inclui PlatformAdmins sem membership. A administração da plataforma não concede acesso automático aos dados operacionais das empresas.</p>
      <div className="access-table-wrap" role="region" aria-label="Contas globais sem vínculo empresarial" tabIndex={0}><table className="access-table platform-unlinked-table"><caption>Identidades globais sem vínculo empresarial</caption><thead><tr><th scope="col">Conta</th><th scope="col">E-mail</th><th scope="col">Situação da conta</th><th scope="col">Administrador da Plataforma</th><th scope="col">Acesso empresarial</th></tr></thead><tbody>
        {shown.unlinked.map(i => <tr key={i.id}><th scope="row">{i.nome}</th><td className="platform-email">{i.email}</td><td><span className={`platform-state ${i.status === "ACTIVE" ? "platform-state-active" : "platform-state-inactive"}`}>{statusLabel(i.status)}</span></td><td>{i.platformAdmin ? <span className={`platform-state ${i.platformAdmin.status === "ACTIVE" ? "platform-state-active" : "platform-state-inactive"}`}>{statusLabel(i.platformAdmin.status)}</span> : "Não"}</td><td>Sem vínculo empresarial</td></tr>)}
        {!shown.unlinked.length && <tr><td colSpan={5} className="access-empty">{loading ? "Carregando contas globais…" : query.trim() ? "Nenhuma conta sem vínculo corresponde à busca." : "Nenhuma conta global sem vínculo empresarial."}</td></tr>}
      </tbody></table></div>
    </section>
    {mode && <dialog ref={dialog} className="access-modal platform-admin-dialog" aria-labelledby="platform-modal-title" onCancel={e => { e.preventDefault(); if (!busy) setMode(""); }} onKeyDown={e => { if (e.key !== "Tab") return; const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]")); const first = items[0], last = items[items.length - 1]; if (!first) { e.preventDefault(); return; } if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }}>
      <h2 id="platform-modal-title">{mode === "responsible" ? `Responsável contratual · ${selected?.nome}` : mode === "owner" ? `${selected?.activeOwnerCount ? "Adicionar" : "Designar"} Proprietário · ${selected?.nome}` : mode === "edit" ? "Editar empresa" : "Criar tenant manual"}</h2>
      {mode === "responsible" ? <><p className="access-hint">Escolha explicitamente um Proprietário ativo desta empresa. O vínculo designado será o único autorizado a aceitar o termo do contratante.</p>
        <label>Proprietário responsável<select value={responsibleMembershipId} onChange={event => setResponsibleMembershipId(event.target.value)}>
          <option value="">Selecione</option>{memberships.filter(m => m.tenant.id === selected?.id && m.role === "OWNER" && m.status === "ACTIVE").map(m =>
            <option key={m.id} value={m.id}>{m.identity.nome} · {m.identity.email}</option>)}
        </select></label></> : mode === "owner" ? <>
        <p className="access-hint">Um vínculo existente será promovido. Para outro email, será criado um convite; o titular definirá a própria senha se necessário.</p>
        <label>Vínculo existente nesta empresa
          <select value={memberships.some(m => m.tenant.id === selected?.id && m.identity.email === ownerForm.email) ? ownerForm.email : ""}
            onChange={e => setOwnerForm({ nome: "", email: e.target.value })}>
            <option value="">Selecionar ou informar email abaixo</option>
            {memberships.filter(m => m.tenant.id === selected?.id && !(m.role === "OWNER" && m.status === "ACTIVE")).map(m =>
              <option key={m.id} value={m.identity.email}>{m.identity.nome} · {m.identity.email} · {roleLabel(m.role)} / {statusLabel(m.status)}</option>)}
          </select>
        </label>
        <label>Nome (para convite)<input value={ownerForm.nome} onChange={e => setOwnerForm({ ...ownerForm, nome: e.target.value })} /></label>
        <label>Email<input type="email" required value={ownerForm.email} onChange={e => setOwnerForm({ ...ownerForm, email: e.target.value })} /></label>
        {ownerInvites.length > 0 && <div className="access-owner-invites"><strong>Convites de proprietário</strong>
          {ownerInvites.map(i => <div key={i.id}><span>{i.name} · {i.email} · {i.status === "PENDING" ? "Pendente" :
            i.status === "EXPIRED" ? "Expirado" : i.status === "ACCEPTED" ? "Aceito" : "Revogado"}</span>
            {(i.status === "PENDING" || i.status === "EXPIRED") && <span>
              <button type="button" disabled={busy} onClick={() => void ownerInviteAction(i.id, "resend")}>Gerar novo convite</button>
              {i.status === "PENDING" && <button type="button" disabled={busy} onClick={() => void ownerInviteAction(i.id, "revoke")}>Revogar convite</button>}
            </span>}</div>)}</div>}
      </> : <>
        <label>Nome<input required value={tenantForm.nome} onChange={e => setTenantForm({ ...tenantForm, nome: e.target.value })} /></label>
        <label>Email administrativo<input type="email" required value={tenantForm.email} onChange={e => setTenantForm({ ...tenantForm, email: e.target.value })} /></label>
        <label>Plano<select value={tenantForm.plano} onChange={e => setTenantForm({ ...tenantForm, plano: e.target.value })}>
          <option value="trial">Período de teste</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label>
      </>}
      {error && <p role="alert" className="access-error">{messagePtBr(error)}</p>}
      <div className="access-modal-actions"><button type="button" data-dialog-back disabled={busy} className="access-button access-button-secondary" onClick={() => setMode("")}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy} onClick={submit}>{busy ? "Aguarde…" : "Confirmar"}</button></div>
    </dialog>}
  </main>;
}
