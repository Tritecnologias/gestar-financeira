"use client";
import { useEffect, useState } from "react";
import { ADVISORY_CATALOG } from "@/lib/advisory-policy";
import "./access.css";

type Row = { id: string; identity: { nome: string; email: string }; purpose: string; permissions: string[];
  authorizer: { identity: { nome: string } }; startsAt: string; expiresAt: string | null; status: string; revokedAt: string | null };
const labels = Object.fromEntries(ADVISORY_CATALOG.flatMap(m => m.screens.flatMap(s => s.actions.map(([a, label]) => [`${m.id}.${s.id}.${a}`, `${s.label} — ${label}`]))));
const date = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR") : "Sem prazo definido";
export default function AdvisoryClient() {
  const [rows, setRows] = useState<Row[]>([]), [grantable, setGrantable] = useState<string[]>([]);
  const [canManage, setCanManage] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]), [revoking, setRevoking] = useState<Row | null>(null);
  async function load() {
    const response = await fetch("/api/access/advisory", { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível consultar os acessos.");
    setRows(data.rows); setGrantable(data.grantable); setCanManage(data.canManage);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  function toggle(key: string, checked: boolean) {
    const view = key.slice(0, key.lastIndexOf(".")) + ".view";
    setPermissions(current => checked ? [...new Set([...current, view, key])] : current.filter(p => p !== key && (!key.endsWith(".view") || !p.startsWith(key.slice(0, -4)))));
  }
  async function grant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/access/advisory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        email: data.get("email"), purpose: data.get("purpose"), permissions,
        startsAt: data.get("startsAt") ? new Date(String(data.get("startsAt"))).toISOString() : null,
        expiresAt: data.get("expiresAt") ? new Date(String(data.get("expiresAt"))).toISOString() : null, confirm: data.get("confirm") === "on" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      form.reset(); setPermissions([]); await load(); setNotice("Acesso de Assessoria concedido. Nenhum vínculo empresarial foi criado.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!revoking) return;
    const data = new FormData(e.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/access/advisory/${revoking.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", reason: data.get("reason"), confirm: true }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setRevoking(null); await load(); setNotice("Assessoria revogada. A próxima requisição por esta autorização será bloqueada.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="access-page" style={{ height: "100%", minHeight: 0 }}>
    <header className="access-header"><div><h1>Acesso de Assessoria</h1><p>Autorizações explícitas para trabalho empresarial, separadas de vínculos e suporte.</p></div></header>
    {error && <p role="alert" className="access-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {canManage && <details><summary style={{ cursor: "pointer", padding: "12px 0" }}>Conceder Acesso de Assessoria</summary>
      <form onSubmit={grant} style={{ display: "grid", gap: 12, maxWidth: 900 }}>
        <label>E-mail da conta do assessor<input name="email" type="email" required maxLength={254} style={{ display: "block", width: "100%" }} /></label>
        <p className="access-hint">O assessor deve possuir conta ativa. Esta ação não cria conta, vínculo empresarial ou acesso global.</p>
        <label>Finalidade<textarea name="purpose" required minLength={3} maxLength={500} style={{ display: "block", width: "100%" }} /></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}><label>Início (vazio = agora)<input name="startsAt" type="datetime-local" style={{ display: "block" }} /></label>
          <label>Validade (opcional)<input name="expiresAt" type="datetime-local" style={{ display: "block" }} /></label></div>
        <fieldset style={{ border: "1px solid var(--border)", padding: 12 }}><legend>Permissões autorizadas</legend>
          <p className="access-hint">Nenhuma permissão vem selecionada. Ações exigem visualizar a respectiva tela.</p>
          {ADVISORY_CATALOG.map(m => <details key={m.id}><summary style={{ padding: "10px 0", cursor: "pointer" }}>{m.label}</summary>
            {m.screens.map(s => <div key={s.id} style={{ marginBottom: 12 }}><strong>{s.label}</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {s.actions.map(([a, label]) => { const key = `${m.id}.${s.id}.${a}`; return grantable.includes(key) && <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 44 }}><input type="checkbox" checked={permissions.includes(key)} onChange={e => toggle(key, e.target.checked)} />{label}</label>; })}
            </div></div>)}
          </details>)}
        </fieldset>
        <label><input name="confirm" type="checkbox" required /> Autorizo esta identidade a atuar nesta empresa com a finalidade e o escopo selecionados.</label>
        <button className="access-button access-button-primary" disabled={busy || !permissions.length}>Conceder assessoria</button>
      </form></details>}
    {revoking && <form onSubmit={revoke} style={{ padding: 16, border: "1px solid var(--border)", margin: "16px 0" }}>
      <h2>Revogar assessoria de {revoking.identity.nome}</h2><label>Motivo<textarea name="reason" required minLength={3} maxLength={500} style={{ display: "block", width: "100%", margin: "10px 0" }} /></label>
      <button className="access-button access-button-primary" disabled={busy}>Confirmar revogação</button> <button className="access-button access-button-secondary" type="button" disabled={busy} onClick={() => setRevoking(null)}>Cancelar</button>
    </form>}
    <div style={{ display: "grid", gap: 12, marginTop: 20 }}>{rows.map(row => <article key={row.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, overflowWrap: "anywhere" }}>
      <h2 style={{ fontSize: 16 }}>{row.identity.nome}</h2><p className="access-hint">{row.identity.email}</p><p>{row.purpose}</p>
      <p>Autorizado por: {row.authorizer.identity.nome}</p><p>Início: {date(row.startsAt)} · Validade: {date(row.expiresAt)}</p>
      <p>Status: {row.status === "INACTIVE" ? "Revogado" : row.expiresAt && new Date(row.expiresAt) <= new Date() ? "Expirado" : new Date(row.startsAt) > new Date() ? "Agendado" : "Ativo"}</p>
      <details><summary>Permissões ({row.permissions.length})</summary><ul>{row.permissions.map(p => <li key={p}>{labels[p] ?? "Permissão indisponível"}</li>)}</ul></details>
      {canManage && row.status === "ACTIVE" && <button className="access-button access-button-secondary" disabled={busy} onClick={() => setRevoking(row)} style={{ marginTop: 10 }}>Revogar</button>}
    </article>)}</div>{!rows.length && <p className="access-hint">Nenhum acesso de assessoria registrado nesta empresa.</p>}
  </div>;
}
