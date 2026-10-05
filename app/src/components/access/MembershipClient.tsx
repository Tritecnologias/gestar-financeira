"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SearchableSelect from "@/components/ui/SearchableSelect";
import "./access.css";

type Profile = { id: string; nome: string; ativo: boolean };
type Membership = { id: string; role: "OWNER" | "ADMIN" | "MEMBER"; status: "ACTIVE" | "INACTIVE";
  profileId: string | null; identity: { nome: string; email: string; status: string }; profile: Profile | null };

export default function MembershipClient({ role, canManage, canViewProfiles }: { role: string; canManage: boolean; canViewProfiles: boolean }) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", role: "MEMBER", profileId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/access/memberships", { cache: "no-store" }), fetch("/api/access/profiles", { cache: "no-store" })]);
      const [am, bp] = await Promise.all([a.json(), b.json()]);
      if (!a.ok) throw new Error(am.error || "Falha ao carregar usuários.");
      if (!b.ok) throw new Error(bp.error || "Falha ao carregar perfis.");
      setMemberships(am); setProfiles(bp); setError("");
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
      const response = await fetch("/api/access/memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível adicionar acesso.");
      setModal(false); setForm({ nome: "", email: "", senha: "", role: "MEMBER", profileId: "" }); await load(); router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="access-page">
    <header className="access-header"><div><h1>Acessos / Usuários</h1><p>Identidades vinculadas ao tenant atual e seus perfis de acesso.</p></div>
      {canViewProfiles && <Link className="access-button access-button-secondary" href="/acessos/perfis">Perfis de Acesso</Link>}</header>
    <div className="access-toolbar"><input placeholder="Buscar usuário ou perfil" aria-label="Buscar usuários" value={query} onChange={e => setQuery(e.target.value)} />
      {canManage && <button className="access-button access-button-primary" onClick={() => setModal(true)}>+ Adicionar acesso</button>}</div>
    {error && <p role="alert" className="access-error">{error}</p>}
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
    {modal && <div className="access-modal-backdrop"><section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
      <h2 id="member-modal-title">Adicionar acesso</h2><p className="access-hint">Email existente reutiliza a identidade. Para nova identidade, informe nome e senha de pelo menos 12 caracteres.</p>
      <label>Nome (nova identidade)<input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></label>
      <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label>Senha (nova identidade)<input type="password" autoComplete="new-password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} /></label>
      <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
        {role === "OWNER" && <><option value="OWNER">OWNER</option><option value="ADMIN">ADMIN</option></>}
        <option value="MEMBER">MEMBER</option></select></label>
      <label>Perfil de Acesso<SearchableSelect label="Perfil de Acesso" value={form.profileId} options={profiles.filter(p => p.ativo).map(p => ({ value: p.id, label: p.nome }))}
        onChange={profileId => setForm({ ...form, profileId })} /></label>
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button className="access-button access-button-secondary" onClick={() => setModal(false)}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy} onClick={() => void create()}>Adicionar</button></div>
    </section></div>}
  </section>;
}
