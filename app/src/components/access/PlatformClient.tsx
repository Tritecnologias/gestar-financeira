"use client";
import { messagePtBr } from "@/lib/presentation";
import { AppearanceButton } from "@/components/appearance/AppearanceProvider";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { planLabel, roleLabel, statusLabel } from "@/lib/presentation";
import InvitationShareDialog, { type InvitationShare } from "@/components/access/InvitationShareDialog";
import "./access.css";

type Tenant = { id: string; nome: string; slug: string; email: string; plano: string; ativo: boolean;
  _count: { memberships: number }; activeOwnerCount: number; lastOwnerDesignationAt: string | null;
  contractualResponsibleMembershipId: string | null; contractualResponsibleReady: boolean; contractualStatus: string };
type Identity = { id: string; nome: string; email: string; status: string;
  platformAdmin: { status: string } | null; memberships: { id: string; role: string; tenant: { nome: string } }[] };
type Membership = { id: string; role: string; status: string; identity: { nome: string; email: string };
  tenant: { id: string; nome: string }; profile: { nome: string } | null };
type OwnerInvite = { id: string; name: string; email: string; status: string; expiresAt: string };
type Tab = "tenants" | "identidades" | "vinculos";

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Falha ao carregar.");
  return body;
}

export default function PlatformClient({ supportOperator = false, experimentPilot = false }: { supportOperator?: boolean; experimentPilot?: boolean }) {
  const [tab, setTab] = useState<Tab>("tenants");
  const [query, setQuery] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"" | "create" | "edit" | "owner" | "responsible">("");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ nome: "", email: "", plano: "trial" });
  const [ownerForm, setOwnerForm] = useState({ nome: "", email: "" });
  const [share, setShare] = useState<InvitationShare | null>(null);
  const closeShare = useCallback(() => setShare(null), []);
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [ownerInvites, setOwnerInvites] = useState<OwnerInvite[]>([]);
  const [responsibleMembershipId, setResponsibleMembershipId] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, i, m] = await Promise.all([
        read<Tenant[]>("/api/platform/tenants"), read<Identity[]>("/api/platform/identities"),
        read<Membership[]>("/api/platform/memberships"),
      ]);
      setTenants(t); setIdentities(i); setMemberships(m); setError("");
    } catch (cause) { setError((cause as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.toLocaleLowerCase("pt-BR");
    if (tab === "tenants") return tenants.filter(t => `${t.nome} ${t.slug} ${t.email}`.toLocaleLowerCase("pt-BR").includes(q));
    if (tab === "identidades") return identities.filter(i => `${i.nome} ${i.email}`.toLocaleLowerCase("pt-BR").includes(q));
    return memberships.filter(m => `${m.identity.nome} ${m.identity.email} ${m.tenant.nome} ${m.profile?.nome ?? ""}`.toLocaleLowerCase("pt-BR").includes(q));
  }, [tab, query, tenants, identities, memberships]);

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

  async function openOwner(t: Tenant) {
    setShare(null); setSelected(t); setOwnerForm({ nome: "", email: "" }); setError(""); setMode("owner");
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

  return <main className="access-page access-platform">
    <header className="access-header"><div><h1>Administração da Plataforma</h1>
      <p>Empresas, contas e vínculos de acesso. Os dados de cada empresa exigem acesso autorizado.</p></div>
      <div className="access-header-actions"><Link href="/minha-conta" className="access-button access-button-secondary">Minha conta</Link>{experimentPilot && <Link href="/plataforma/convites-especiais" className="access-button access-button-secondary">Convites Especiais</Link>}<AppearanceButton />
        {supportOperator && <Link href="/suporte" className="access-button access-button-secondary">Área de Suporte</Link>}
        <Link href="/plataforma/auditoria" className="access-button access-button-secondary">Auditoria da Plataforma</Link>
        <Link href="/plataforma/termos" className="access-button access-button-secondary">Termos e Políticas</Link>
        <Link href="/selecionar-tenant" className="access-button access-button-secondary">Selecionar empresa</Link></div>
    </header>
    <div className="access-toolbar">
      <div className="access-tabs" role="tablist" aria-label="Administração da plataforma">
        {(["tenants", "identidades", "vinculos"] as const).map(key =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""}
            onClick={() => { setShare(null); setTab(key); setQuery(""); }}>{key === "vinculos" ? "Vínculos com a Empresa" : key === "tenants" ? "Empresas" : "Contas"}</button>)}
      </div>
      <input aria-label="Buscar registros" placeholder="Buscar por nome ou email" value={query} onChange={e => setQuery(e.target.value)} />
      {tab === "tenants" && <button type="button" className="access-button access-button-primary" onClick={() => {
        setTenantForm({ nome: "", email: "", plano: "trial" }); setMode("create");
      }}>+ Nova empresa</button>}
    </div>
    {error && <p className="access-error" role="alert">{messagePtBr(error)}</p>}
    {deliveryNotice && <p className="access-hint" role="status">{deliveryNotice}</p>}
    {share && <InvitationShareDialog invitation={share} onClose={closeShare} />}
    <div className="access-table-wrap"><table className="access-table"><thead><tr>
      {tab === "tenants" ? <><th>Empresa</th><th>Email</th><th>Plano</th><th>Status</th><th>Vínculos</th><th>Ações</th></>
        : tab === "identidades" ? <><th>Conta</th><th>Email</th><th>Status</th><th>Administrador da Plataforma</th><th>Empresas</th></>
        : <><th>Conta</th><th>Empresa</th><th>Função</th><th>Perfil</th><th>Status</th></>}
    </tr></thead><tbody>
      {tab === "tenants" && (shown as Tenant[]).map(t => <tr key={t.id}><td><strong>{t.nome}</strong><small>{t.slug}</small></td>
        <td>{t.email}</td><td>{planLabel(t.plano)}</td><td>{t.ativo ? "Ativo" : "Inativo"}
          {t.activeOwnerCount === 0 && <small className="access-warning">Sem Proprietário ativo · designação necessária</small>}
          <small className={t.contractualStatus === "Contrato ativo" ? "access-hint" : "access-warning"}>{t.contractualStatus}</small>
          {t.lastOwnerDesignationAt && <small>Última designação: {new Date(t.lastOwnerDesignationAt).toLocaleDateString("pt-BR")}</small>}</td><td>{t._count.memberships}</td>
        <td className="access-actions"><button onClick={() => edit(t)}>Editar</button><button disabled={busy} onClick={() => toggle(t)}>{t.ativo ? "Inativar" : "Ativar"}</button>
          <button onClick={() => void openOwner(t)}>
            {t.activeOwnerCount ? "Adicionar Proprietário" : "Designar Proprietário"}
          </button><button onClick={() => { setSelected(t); setResponsibleMembershipId(t.contractualResponsibleMembershipId || ""); setMode("responsible"); }}>Responsável contratual</button></td></tr>)}
      {tab === "identidades" && (shown as Identity[]).map(i => <tr key={i.id}><td><strong>{i.nome}</strong></td><td>{i.email}</td>
        <td>{statusLabel(i.status)}</td><td>{i.platformAdmin?.status === "ACTIVE" ? "Sim" : "Não"}</td>
        <td>{i.memberships.map(m => `${m.tenant.nome} (${roleLabel(m.role)})`).join(", ") || "—"}</td></tr>)}
      {tab === "vinculos" && (shown as Membership[]).map(m => <tr key={m.id}><td><strong>{m.identity.nome}</strong><small>{m.identity.email}</small></td>
        <td>{m.tenant.nome}</td><td>{roleLabel(m.role)}</td><td>{m.profile?.nome ?? "Sem perfil"}</td><td>{statusLabel(m.status)}</td></tr>)}
      {!shown.length && <tr><td colSpan={6} className="access-empty">Nenhum registro encontrado.</td></tr>}
    </tbody></table></div>
    {mode && <div className="access-modal-backdrop" role="presentation"><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="platform-modal-title">
      <h2 id="platform-modal-title">{mode === "responsible" ? `Responsável contratual · ${selected?.nome}` : mode === "owner" ? `Adicionar Proprietário · ${selected?.nome}` : mode === "edit" ? "Editar empresa" : "Nova empresa"}</h2>
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
      <div className="access-modal-actions"><button className="access-button access-button-secondary" onClick={() => setMode("")}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy} onClick={submit}>{busy ? "Aguarde…" : "Confirmar"}</button></div>
    </section></div>}
  </main>;
}
