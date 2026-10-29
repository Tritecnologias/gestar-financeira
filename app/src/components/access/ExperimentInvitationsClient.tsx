"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./access.css";
import "./experiment-invitations.css";

type Item = { id: string; recipientName: string; status: string; createdAt: string; expiresAt: string; revokedAt: string | null; viewedAt: string | null; acknowledgedAt: string | null; interestAt: string | null };
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Ainda não";
export default function ExperimentInvitationsClient() {
  const [rows, setRows] = useState<Item[]>([]), [name, setName] = useState(""), [hours, setHours] = useState("72");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [link, setLink] = useState(""), [revokeId, setRevokeId] = useState("");
  const linkRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/platform/experiment-invitations", { cache: "no-store" }); const b = await r.json();
    if (!r.ok) throw new Error(b.error || "Não foi possível consultar."); setRows(b);
  }, []);
  useEffect(() => { void load().catch(e => setError(e.message)); return () => { /* links are never persisted */ }; }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice(""); setLink("");
    try {
      const r = await fetch("/api/platform/experiment-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientName: name, hours: Number(hours) }) }); const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Não foi possível criar."); setLink(b.link); setName(""); setNotice("Convite criado. Copie o link abaixo antes de sair desta página."); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice("Link copiado. Abra uma janela anônima para testar como convidado."); }
    catch { linkRef.current?.focus(); linkRef.current?.select(); setNotice("Selecione o link e use Ctrl+C ou a opção Copiar do dispositivo."); }
  }
  async function revoke() {
    setBusy(true); setError("");
    try { const r = await fetch(`/api/platform/experiment-invitations/${revokeId}`, { method: "DELETE" }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setRevokeId(""); setLink(""); setNotice("Convite revogado. O link não permite novas interações."); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="access-page access-platform experiment-admin"><header className="access-header"><div><h1>Convites Especiais</h1><p>Piloto de experimentação · LOCAL / HOMOLOG</p></div><Link href="/plataforma" className="access-button access-button-secondary">Administração da Plataforma</Link></header>
    <p>Convide uma pessoa para conhecer a DEZ. Este convite não cria conta, empresa ou acesso à plataforma e não representa aceite contratual. Nenhum e-mail será enviado.</p>
    {error && <p role="alert" className="access-error">{error}</p>}<p role="status" aria-live="polite">{notice}</p>
    <section className="experiment-panel"><h2>Criar convite especial</h2><form onSubmit={create} className="experiment-form"><label>Nome do destinatário<input name="recipientName" required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label>Validade em horas<input name="hours" type="number" min="1" max="168" required value={hours} onChange={e => setHours(e.target.value)} /></label><button type="submit" className="access-button access-button-primary" disabled={busy}>{busy ? "Aguarde…" : "Criar convite"}</button></form></section>
    {link && <section className="experiment-panel" aria-labelledby="share-title"><h2 id="share-title">Copiar e testar o convite</h2><p>O link completo só aparece nesta criação. Após sair ou atualizar a página, crie outro convite se precisar de um novo link.</p><label>Link individual<input ref={linkRef} readOnly value={link} aria-label="Link individual" /></label><button className="access-button access-button-primary" onClick={() => void copy()}>Copiar link</button><p>Abra uma janela anônima, cole o link e assuma a persona do destinatário. Não é necessário autenticar para conhecer a landing.</p></section>}
    <section className="experiment-panel"><div className="experiment-list-heading"><h2>Convites e manifestações de interesse</h2><button className="access-button access-button-secondary" onClick={() => void load().catch(e => setError(e.message))}>Atualizar lista</button></div><p>Últimos 100 convites. Atualize a lista depois do teste do convidado.</p><div className="experiment-list">{rows.length ? rows.map(row => <article className="experiment-item" key={row.id}><h3>{row.recipientName}</h3><p><strong>{row.status === "REVOKED" ? "Revogado" : row.status === "EXPIRED" ? "Expirado" : "Ativo"}</strong> · Referência {row.id.slice(0, 8)}</p><dl><div><dt>Criado</dt><dd>{date(row.createdAt)}</dd></div><div><dt>Expira</dt><dd>{date(row.expiresAt)}</dd></div><div><dt>Visualizado</dt><dd>{date(row.viewedAt)}</dd></div><div><dt>Boas-vindas confirmadas</dt><dd>{date(row.acknowledgedAt)}</dd></div><div><dt>Interesse</dt><dd>{row.interestAt ? `Interesse registrado · ${date(row.interestAt)}` : "Ainda não manifestado"}</dd></div></dl>{row.status === "ACTIVE" && <button className="access-button access-button-secondary" disabled={busy} onClick={() => setRevokeId(row.id)}>Revogar convite de {row.recipientName}</button>}</article>) : <p>Nenhum convite especial cadastrado.</p>}</div></section>
    {revokeId && <section className="experiment-panel" role="alert" aria-label="Confirmar revogação"><p>Revogar o convite de {rows.find(r => r.id === revokeId)?.recipientName}? O link deixará de permitir interações.</p><button disabled={busy} className="access-button access-button-primary" onClick={() => void revoke()}>Confirmar revogação</button><button disabled={busy} className="access-button access-button-secondary" onClick={() => setRevokeId("")}>Cancelar</button></section>}
  </main>;
}
