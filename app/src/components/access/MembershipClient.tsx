"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TermsStatusPanel from "@/components/access/TermsStatusPanel";
import "./access.css";

type Profile = { id: string; nome: string; ativo: boolean };
type Membership = { id: string; role: "OWNER" | "ADMIN" | "MEMBER"; status: "ACTIVE" | "INACTIVE";
  profileId: string | null; identity: { nome: string; email: string; status: string }; profile: Profile | null };
type Invitation = { id: string; name: string; email: string; role: Membership["role"];
  status: "PENDING" | "EXPIRED" | "REVOKED" | "ACCEPTED"; expiresAt: string; profile: { nome: string } };

export default function MembershipClient({ role, canManage, canViewProfiles }: { role: string; canManage: boolean; canViewProfiles: boolean }) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", role: "MEMBER", profileId: "" });
  const [devLink, setDevLink] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([fetch("/api/access/memberships", { cache: "no-store" }),
        fetch("/api/access/profiles", { cache: "no-store" }), fetch("/api/access/invitations", { cache: "no-store" })]);
      const [am, bp, ci] = await Promise.all([a.json(), b.json(), c.json()]);
      if (!a.ok) throw new Error(am.error || "Falha ao carregar usuários.");
      if (!b.ok) throw new Error(bp.error || "Falha ao carregar perfis.");
      if (!c.ok) throw new Error(ci.error || "Falha ao carregar convites.");
      setMemberships(am); setProfiles(bp); setInvitations(ci); setError("");
    } catch (cause) { setError((cause as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => memberships.filter(m => `${m.identity.nome} ${m.identity.email} ${m.profile?.nome ?? ""}`
    .toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [memberships, query]);

  async function patch(id: string, payload: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/access/memberships/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível alterar o vínculo.");
      await load(); router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível criar convite.");
      setDevLink(body.devLink || "");
      setDeliveryNotice(body.delivery?.status === "SENT" ? "Convite criado e e-mail enviado." :
        body.delivery?.status === "SIMULATED" ? "Convite criado em modo simulado. Nenhum e-mail real foi enviado." :
          "Convite criado, mas o e-mail não pôde ser enviado. Você pode tentar reenviar.");
      setModal(false);
      setForm({ nome: "", email: "", role: "MEMBER", profileId: "" }); await load(); router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function invitationAction(id: string, action: "resend" | "revoke") {
    if (!window.confirm(action === "revoke" ? "Revogar este convite?" : "Gerar novo link e invalidar o anterior?")) return;
    setBusy(true); setError(""); setDevLink(""); setDeliveryNotice("");
    try {
      const response = await fetch(`/api/access/invitations/${id}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível alterar o convite.");
      setDevLink(body.devLink || "");
      setDeliveryNotice(action === "revoke" ? "Convite revogado." : body.delivery?.status === "SENT" ?
        "Novo convite enviado por e-mail." : body.delivery?.status === "SIMULATED" ?
          "Novo convite simulado no DEV; nenhum e-mail foi enviado." :
          "Novo convite criado, mas o e-mail não foi enviado. Tente reenviar após o limite de segurança.");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="access-page">
    <header className="access-header"><div><h1>Acessos / Usuários</h1><p>Identidades vinculadas ao tenant atual e seus perfis de acesso.</p></div>
      <div className="access-header-actions">
        {role === "OWNER" && <Link className="access-button access-button-secondary" href="/acessos/suporte">Suporte</Link>}
        {canViewProfiles && <Link className="access-button access-button-secondary" href="/acessos/perfis">Perfis de Acesso</Link>}
      </div></header>
    <div className="access-toolbar"><input placeholder="Buscar usuário ou perfil" aria-label="Buscar usuários" value={query} onChange={e => setQuery(e.target.value)} />
      {canManage && <button className="access-button access-button-primary" onClick={() => { setDevLink(""); setDeliveryNotice(""); setModal(true); }}>+ Convidar usuário</button>}</div>
    {error && <p role="alert" className="access-error">{error}</p>}
    {deliveryNotice && <p role="status" className="access-hint">{deliveryNotice}</p>}
    {devLink && <div className="access-dev-link" role="status"><strong>Link de convite DEV</strong>
      <p>Envie por canal privado ao destinatário. Este link aparece somente agora; contém um segredo de uso único.</p>
      <input readOnly aria-label="Link de convite DEV" value={devLink} onFocus={e => e.currentTarget.select()} />
      <button className="access-button access-button-secondary" onClick={() => void navigator.clipboard.writeText(devLink)}>Copiar link</button>
      <button className="access-button access-button-secondary" onClick={() => setDevLink("")}>Ocultar</button></div>}
    <div className="access-table-wrap"><table className="access-table"><thead><tr><th>Identidade</th><th>Role estrutural</th><th>Perfil de Acesso</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {shown.map(m => <tr key={m.id}><td><strong>{m.identity.nome}</strong><small>{m.identity.email}</small></td>
        <td>{canManage && role === "OWNER" ? <select aria-label={`Role de ${m.identity.nome}`} disabled={busy} value={m.role} onChange={e => void patch(m.id, { role: e.target.value })}>
          <option value="OWNER">OWNER</option><option value="ADMIN">ADMIN</option><option value="MEMBER">MEMBER</option></select> : m.role}</td>
        <td><SearchableSelect label={`Perfil de ${m.identity.nome}`} value={m.profileId ?? ""} disabled={!canManage || busy || (role !== "OWNER" && m.role !== "MEMBER")}
          options={profiles.filter(p => p.ativo).map(p => ({ value: p.id, label: p.nome }))} onChange={value => void patch(m.id, { profileId: value })} /></td>
        <td>{m.status === "ACTIVE" ? "Ativo" : "Inativo"}</td><td className="access-actions">
          {canManage && (role === "OWNER" || m.role === "MEMBER") && <button disabled={busy} onClick={() => {
            if (window.confirm(`${m.status === "ACTIVE" ? "Inativar" : "Ativar"} o vínculo de ${m.identity.nome}?`)) void patch(m.id, { status: m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
          }}>{m.status === "ACTIVE" ? "Inativar" : "Ativar"}</button>}</td></tr>)}
      {!shown.length && <tr><td className="access-empty" colSpan={5}>Nenhum vínculo encontrado.</td></tr>}
    </tbody></table></div>
    <h2 className="access-subtitle">Convites</h2>
    <div className="access-table-wrap"><table className="access-table"><thead><tr><th>Destinatário</th><th>Papel</th><th>Perfil</th><th>Status</th><th>Expira</th><th>Ações</th></tr></thead><tbody>
      {invitations.filter(i => `${i.name} ${i.email} ${i.profile.nome}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).map(i =>
        <tr key={i.id}><td><strong>{i.name}</strong><small>{i.email}</small></td><td>{i.role}</td><td>{i.profile.nome}</td>
          <td>{i.status === "PENDING" ? "Convite pendente" : i.status === "EXPIRED" ? "Convite expirado" :
            i.status === "ACCEPTED" ? "Ativo" : "Revogado"}</td>
          <td>{new Date(i.expiresAt).toLocaleString("pt-BR")}</td><td className="access-actions">
            {canManage && (role === "OWNER" || i.role === "MEMBER") && (i.status === "PENDING" || i.status === "EXPIRED") && <>
              <button disabled={busy} onClick={() => void invitationAction(i.id, "resend")}>Reenviar</button>
              {i.status === "PENDING" && <button disabled={busy} onClick={() => void invitationAction(i.id, "revoke")}>Revogar</button>}
            </>}</td></tr>)}
      {!invitations.length && <tr><td className="access-empty" colSpan={6}>Nenhum convite neste tenant.</td></tr>}
    </tbody></table></div>
    {role !== "MEMBER" && <TermsStatusPanel />}
    {modal && <div className="access-modal-backdrop"><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
      <h2 id="member-modal-title">Convidar usuário</h2><p className="access-hint">O titular confirmará o convite e definirá a própria senha se ainda não tiver identidade. Nenhum acesso fica ativo antes do aceite.</p>
      <label>Nome<input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></label>
      <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
        {role === "OWNER" && <><option value="OWNER">OWNER</option><option value="ADMIN">ADMIN</option></>}
        <option value="MEMBER">MEMBER</option></select></label>
      <label>Perfil de Acesso<SearchableSelect label="Perfil de Acesso" value={form.profileId} options={profiles.filter(p => p.ativo).map(p => ({ value: p.id, label: p.nome }))}
        onChange={profileId => setForm({ ...form, profileId })} /></label>
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button className="access-button access-button-secondary" onClick={() => setModal(false)}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy} onClick={() => void create()}>Criar convite</button></div>
    </section></div>}
  </section>;
}
