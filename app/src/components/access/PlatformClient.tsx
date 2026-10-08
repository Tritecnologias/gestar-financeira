"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./access.css";

type Tenant = { id: string; nome: string; slug: string; email: string; plano: string; ativo: boolean;
  _count: { memberships: number }; activeOwnerCount: number; lastOwnerDesignationAt: string | null;
  contractualResponsibleMembershipId: string | null; contractualResponsibleReady: boolean };
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

export default function PlatformClient() {
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
  const [devLink, setDevLink] = useState("");
  const [ownerInvites, setOwnerInvites] = useState<OwnerInvite[]>([]);
  const [responsibleMembershipId, setResponsibleMembershipId] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  }, []);
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

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
    if (mode === "owner" && !window.confirm(`Designar ${ownerForm.email} como OWNER de ${selected?.nome}? Esta ação concede administração essencial do tenant e será registrada.`)) return;
    if (mode === "responsible" && !window.confirm(`Designar o OWNER selecionado como responsável contratual de ${selected?.nome}?`)) return;
    setBusy(true); setError(""); setDevLink("");
    try {
      const existingOwnerCandidate = mode === "owner" && memberships.some(m =>
        m.tenant.id === selected?.id && m.identity.email.toLowerCase() === ownerForm.email.trim().toLowerCase());
      const url = mode === "responsible" ? `/api/platform/tenants/${selected!.id}/contractual-responsible`
        : mode === "owner" ? `/api/platform/tenants/${selected!.id}/${existingOwnerCandidate ? "owners" : "owner-invitations"}`
        : mode === "edit" ? `/api/platform/tenants/${selected!.id}` : "/api/tenants";
      const response = await fetch(url, { method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "responsible" ? { membershipId: responsibleMembershipId, confirm: true }
          : mode === "owner" ? { ...ownerForm, confirm: true } : tenantForm) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir.");
      setDevLink(body.devLink || ""); setMode(""); setSelected(null); setOwnerForm({ nome: "", email: "" }); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function openOwner(t: Tenant) {
    setSelected(t); setOwnerForm({ nome: "", email: "" }); setError(""); setMode("owner");
    try { setOwnerInvites(await read<OwnerInvite[]>(`/api/platform/tenants/${t.id}/owner-invitations`)); }
    catch (cause) { setError((cause as Error).message); }
  }

  async function ownerInviteAction(inviteId: string, action: "resend" | "revoke") {
    if (!selected || !window.confirm(action === "revoke" ? "Revogar convite OWNER?" : "Gerar novo link OWNER e invalidar o anterior?")) return;
    setBusy(true); setError(""); setDevLink("");
    try {
      const url = `/api/platform/tenants/${selected.id}/owner-invitations`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar convite OWNER.");
      setDevLink(body.devLink || ""); setOwnerInvites(await read<OwnerInvite[]>(url));
      if (body.devLink) { setMode(""); setSelected(null); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function edit(t: Tenant) { setSelected(t); setTenantForm({ nome: t.nome, email: t.email, plano: t.plano }); setMode("edit"); }
  async function toggle(t: Tenant) {
    if (!window.confirm(`${t.ativo ? "Inativar" : "Ativar"} o tenant ${t.nome}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/platform/tenants/${t.id}`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !t.ativo }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar tenant.");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="access-page access-platform">
    <header className="access-header"><div><h1>Administração da Plataforma</h1>
      <p>Tenants, identidades e vínculos da plataforma. Dados financeiros ficam no contexto de cada tenant.</p></div>
      <div className="access-header-actions"><button type="button" className="access-button access-button-secondary" onClick={toggleTheme}>Alternar tema</button>
        <Link href="/plataforma/suporte" className="access-button access-button-secondary">Suporte</Link>
        <Link href="/plataforma/auditoria" className="access-button access-button-secondary">Auditoria</Link>
        <Link href="/plataforma/termos" className="access-button access-button-secondary">Termos e Políticas</Link>
        <Link href="/selecionar-tenant" className="access-button access-button-secondary">Selecionar tenant</Link></div>
    </header>
    <div className="access-toolbar">
      <div className="access-tabs" role="tablist" aria-label="Administração da plataforma">
        {(["tenants", "identidades", "vinculos"] as const).map(key =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""}
            onClick={() => { setTab(key); setQuery(""); }}>{key === "vinculos" ? "Memberships" : key === "tenants" ? "Tenants" : "Identidades"}</button>)}
      </div>
      <input aria-label="Buscar registros" placeholder="Buscar por nome ou email" value={query} onChange={e => setQuery(e.target.value)} />
      {tab === "tenants" && <button type="button" className="access-button access-button-primary" onClick={() => {
        setTenantForm({ nome: "", email: "", plano: "trial" }); setMode("create");
      }}>+ Novo tenant</button>}
    </div>
    {error && <p className="access-error" role="alert">{error}</p>}
    {devLink && <div className="access-dev-link" role="status"><strong>Link de convite OWNER · DEV</strong>
      <p>Compartilhe somente por canal privado. O vínculo ficará ativo após o aceite.</p>
      <input readOnly aria-label="Link de convite OWNER DEV" value={devLink} onFocus={e => e.currentTarget.select()} />
      <button className="access-button access-button-secondary" onClick={() => void navigator.clipboard.writeText(devLink)}>Copiar link</button>
      <button className="access-button access-button-secondary" onClick={() => setDevLink("")}>Ocultar</button></div>}
    <div className="access-table-wrap"><table className="access-table"><thead><tr>
      {tab === "tenants" ? <><th>Tenant</th><th>Email</th><th>Plano</th><th>Status</th><th>Vínculos</th><th>Ações</th></>
        : tab === "identidades" ? <><th>Identidade</th><th>Email</th><th>Status</th><th>PlatformAdmin</th><th>Tenants</th></>
        : <><th>Identidade</th><th>Tenant</th><th>Role</th><th>Perfil</th><th>Status</th></>}
    </tr></thead><tbody>
      {tab === "tenants" && (shown as Tenant[]).map(t => <tr key={t.id}><td><strong>{t.nome}</strong><small>{t.slug}</small></td>
        <td>{t.email}</td><td>{t.plano}</td><td>{t.ativo ? "Ativo" : "Inativo"}
          {t.activeOwnerCount === 0 && <small className="access-warning">Sem OWNER ativo · designação necessária</small>}
          {!t.contractualResponsibleReady && <small className="access-warning">Responsável contratual pendente ou inativo</small>}
          {t.lastOwnerDesignationAt && <small>Última designação: {new Date(t.lastOwnerDesignationAt).toLocaleDateString("pt-BR")}</small>}</td><td>{t._count.memberships}</td>
        <td className="access-actions"><button onClick={() => edit(t)}>Editar</button><button disabled={busy} onClick={() => toggle(t)}>{t.ativo ? "Inativar" : "Ativar"}</button>
          <button onClick={() => void openOwner(t)}>
            {t.activeOwnerCount ? "Adicionar OWNER" : "Designar OWNER"}
          </button><button onClick={() => { setSelected(t); setResponsibleMembershipId(t.contractualResponsibleMembershipId || ""); setMode("responsible"); }}>Responsável contratual</button></td></tr>)}
      {tab === "identidades" && (shown as Identity[]).map(i => <tr key={i.id}><td><strong>{i.nome}</strong></td><td>{i.email}</td>
        <td>{i.status}</td><td>{i.platformAdmin?.status === "ACTIVE" ? "Sim" : "Não"}</td>
        <td>{i.memberships.map(m => `${m.tenant.nome} (${m.role})`).join(", ") || "—"}</td></tr>)}
      {tab === "vinculos" && (shown as Membership[]).map(m => <tr key={m.id}><td><strong>{m.identity.nome}</strong><small>{m.identity.email}</small></td>
        <td>{m.tenant.nome}</td><td>{m.role}</td><td>{m.profile?.nome ?? "Sem perfil"}</td><td>{m.status}</td></tr>)}
      {!shown.length && <tr><td colSpan={6} className="access-empty">Nenhum registro encontrado.</td></tr>}
    </tbody></table></div>
    {mode && <div className="access-modal-backdrop" role="presentation"><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="platform-modal-title">
      <h2 id="platform-modal-title">{mode === "responsible" ? `Responsável contratual · ${selected?.nome}` : mode === "owner" ? `Adicionar OWNER · ${selected?.nome}` : mode === "edit" ? "Editar tenant" : "Novo tenant"}</h2>
      {mode === "responsible" ? <><p className="access-hint">Escolha explicitamente um OWNER ativo deste tenant. O vínculo designado será o único autorizado a aceitar o termo do contratante.</p>
        <label>OWNER responsável<select value={responsibleMembershipId} onChange={event => setResponsibleMembershipId(event.target.value)}>
          <option value="">Selecione</option>{memberships.filter(m => m.tenant.id === selected?.id && m.role === "OWNER" && m.status === "ACTIVE").map(m =>
            <option key={m.id} value={m.id}>{m.identity.nome} · {m.identity.email}</option>)}
        </select></label></> : mode === "owner" ? <>
        <p className="access-hint">Um vínculo existente será promovido. Para outro email, será criado um convite; o titular definirá a própria senha se necessário.</p>
        <label>Vínculo existente neste tenant
          <select value={memberships.some(m => m.tenant.id === selected?.id && m.identity.email === ownerForm.email) ? ownerForm.email : ""}
            onChange={e => setOwnerForm({ nome: "", email: e.target.value })}>
            <option value="">Selecionar ou informar email abaixo</option>
            {memberships.filter(m => m.tenant.id === selected?.id && !(m.role === "OWNER" && m.status === "ACTIVE")).map(m =>
              <option key={m.id} value={m.identity.email}>{m.identity.nome} · {m.identity.email} · {m.role} / {m.status}</option>)}
          </select>
        </label>
        <label>Nome (para convite)<input value={ownerForm.nome} onChange={e => setOwnerForm({ ...ownerForm, nome: e.target.value })} /></label>
        <label>Email<input type="email" required value={ownerForm.email} onChange={e => setOwnerForm({ ...ownerForm, email: e.target.value })} /></label>
        {ownerInvites.length > 0 && <div className="access-owner-invites"><strong>Convites OWNER</strong>
          {ownerInvites.map(i => <div key={i.id}><span>{i.name} · {i.email} · {i.status === "PENDING" ? "Pendente" :
            i.status === "EXPIRED" ? "Expirado" : i.status === "ACCEPTED" ? "Aceito" : "Revogado"}</span>
            {(i.status === "PENDING" || i.status === "EXPIRED") && <span>
              <button type="button" disabled={busy} onClick={() => void ownerInviteAction(i.id, "resend")}>Reenviar</button>
              {i.status === "PENDING" && <button type="button" disabled={busy} onClick={() => void ownerInviteAction(i.id, "revoke")}>Revogar</button>}
            </span>}</div>)}</div>}
      </> : <>
        <label>Nome<input required value={tenantForm.nome} onChange={e => setTenantForm({ ...tenantForm, nome: e.target.value })} /></label>
        <label>Email administrativo<input type="email" required value={tenantForm.email} onChange={e => setTenantForm({ ...tenantForm, email: e.target.value })} /></label>
        <label>Plano<select value={tenantForm.plano} onChange={e => setTenantForm({ ...tenantForm, plano: e.target.value })}>
          <option value="trial">Trial</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></label>
      </>}
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button className="access-button access-button-secondary" onClick={() => setMode("")}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy} onClick={submit}>{busy ? "Aguarde…" : "Confirmar"}</button></div>
    </section></div>}
  </main>;
}
