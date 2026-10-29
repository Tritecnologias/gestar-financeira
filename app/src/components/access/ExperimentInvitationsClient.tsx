"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./access.css";
import "./experiment-invitations.css";

type Item = { id: string; recipientName: string; status: string; createdAt: string; expiresAt: string; revokedAt: string | null; viewedAt: string | null; acknowledgedAt: string | null; interestAt: string | null; linkRecoverable: boolean; canCopyLink: boolean };
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Ainda não";
export default function ExperimentInvitationsClient() {
  const [rows, setRows] = useState<Item[]>([]), [name, setName] = useState(""), [hours, setHours] = useState("72");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [cancelId, setCancelId] = useState("");
  const [bindId, setBindId] = useState(""), [originalLink, setOriginalLink] = useState("");
  const [fallback, setFallback] = useState<{ id: string; link: string } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const fallbackRef = useRef<HTMLInputElement>(null), confirmRef = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/platform/experiment-invitations", { cache: "no-store" }); const b = await r.json();
    if (!r.ok) throw new Error(b.error || "Não foi possível consultar."); setRows(b); setClock(Date.now()); setFallback(null); setBindId(""); setOriginalLink("");
  }, []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => { if (fallback) { fallbackRef.current?.focus(); fallbackRef.current?.select(); } }, [fallback]);
  useEffect(() => { if (cancelId) confirmRef.current?.focus(); }, [cancelId]);
  useEffect(() => {
    const next = Math.min(...rows.filter(row => row.status === "ACTIVE" && Date.parse(row.expiresAt) > clock).map(row => Date.parse(row.expiresAt)));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => { setClock(Date.now()); setFallback(null); }, Math.max(0, next - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [rows, clock]);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice(""); setFallback(null);
    try {
      const r = await fetch("/api/platform/experiment-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientName: name, hours: Number(hours) }) }); const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Não foi possível criar."); setName(""); await load(); setNotice("Convite criado. Use Copiar link na linha da tabela; o mesmo link ficará disponível enquanto o convite estiver válido.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy(row: Item) {
    setBusy(true); setError(""); setNotice(""); setFallback(null);
    try {
      const r = await fetch(`/api/platform/experiment-invitations/${row.id}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy" }), cache: "no-store" }); const b = await r.json();
      if (!r.ok) { await load(); throw new Error(b.error || "Não foi possível recuperar o link."); }
      try { await navigator.clipboard.writeText(b.link); setNotice("Mesmo link copiado. Abra uma janela anônima para testar como convidado."); }
      catch { setFallback({ id: row.id, link: b.link }); setNotice("O navegador não permitiu copiar automaticamente. Selecione o campo desta linha e use Ctrl+C ou Copiar do dispositivo."); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function bind(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch(`/api/platform/experiment-invitations/${bindId}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bind", link: originalLink }), cache: "no-store" }); const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Não foi possível vincular."); setOriginalLink(""); setBindId(""); await load(); setNotice("Link original validado e protegido. O convite e o token foram preservados; use Copiar link na linha.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { const r = await fetch(`/api/platform/experiment-invitations/${cancelId}`, { method: "DELETE" }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setCancelId(""); await load(); setNotice("Convite cancelado. O link foi invalidado no servidor."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const displayedRows = rows.map(row => ({ ...row, status: row.status !== "REVOKED" && Date.parse(row.expiresAt) <= clock ? "EXPIRED" : row.status, canCopyLink: row.canCopyLink && row.status === "ACTIVE" && Date.parse(row.expiresAt) > clock }));
  return <main className="access-page access-platform experiment-admin"><header className="access-header"><div><h1>Convites Especiais</h1><p>Piloto de experimentação · LOCAL / HOMOLOG</p></div><Link href="/plataforma" className="access-button access-button-secondary">Administração da Plataforma</Link></header>
    <p>Convide uma pessoa para conhecer a DEZ. Este convite não cria conta, empresa ou acesso à plataforma e não representa aceite contratual. Nenhum e-mail será enviado.</p>
    {error && <p role="alert" className="access-error">{error}</p>}<p role="status" aria-live="polite">{notice}</p>
    <section className="experiment-panel"><h2>Criar convite especial</h2><form onSubmit={create} className="experiment-form"><label>Nome do destinatário<input name="recipientName" required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label>Validade em horas<input name="hours" type="number" min="1" max="168" required value={hours} onChange={e => setHours(e.target.value)} /></label><button type="submit" className="access-button access-button-primary" disabled={busy}>{busy ? "Aguarde…" : "Criar convite"}</button></form></section>
    <section className="experiment-panel"><div className="experiment-list-heading"><h2>Convites e manifestações de interesse</h2><button className="access-button access-button-secondary" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Atualizar lista</button></div><p id="experiment-table-help">Últimos 100 convites. Copiar link recupera o mesmo convite, sem renová-lo. Em telas pequenas, deslize a tabela na horizontal.</p>
      <div className="experiment-table-scroll" role="region" aria-label="Tabela de convites especiais" aria-describedby="experiment-table-help" tabIndex={0}><table className="experiment-table"><caption>Convites especiais e acompanhamento da jornada</caption><thead><tr>{["Nome", "Referência", "Status", "Criado em", "Expira em", "Visualizado", "Boas-vindas confirmadas", "Interesse", "Ações"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>
        {displayedRows.length ? displayedRows.map(row => <tr key={row.id}><th scope="row">{row.recipientName}</th><td><span title={row.id}>{row.id.slice(0, 8)}</span></td><td><span className={`experiment-pill ${row.status === "REVOKED" ? "experiment-pill-danger" : row.status === "EXPIRED" ? "experiment-pill-muted" : "experiment-pill-active"}`}>{row.status === "REVOKED" ? "Cancelado" : row.status === "EXPIRED" ? "Expirado" : "Ativo"}</span></td><td>{date(row.createdAt)}</td><td>{date(row.expiresAt)}</td><td>{date(row.viewedAt)}</td><td>{row.acknowledgedAt ? date(row.acknowledgedAt) : "Pendentes"}</td><td>{row.interestAt ? <><span className="experiment-pill experiment-pill-success">Interesse registrado</span><small>{date(row.interestAt)}</small></> : "Ainda não manifestado"}</td><td className="experiment-actions">
          <button type="button" className="access-button access-button-secondary" aria-label={`Copiar link de ${row.recipientName}`} title={row.canCopyLink ? "Copiar o mesmo link" : row.status !== "ACTIVE" ? "Convite expirado ou cancelado" : "Convite antigo: vinculação opcional do link original necessária para recuperar"} disabled={busy || !row.canCopyLink} onClick={() => void copy(row)}>Copiar link</button>
          {row.status === "ACTIVE" && <button type="button" className="experiment-pill experiment-pill-danger experiment-cancel" disabled={busy} aria-label={`Cancelar convite de ${row.recipientName}`} onClick={() => setCancelId(row.id)}>Cancelar</button>}
          {row.status === "ACTIVE" && !row.linkRecoverable && <><small>Convite anterior sem link recuperável. A vinculação é opcional e não altera o convite.</small><button type="button" className="access-button access-button-secondary" disabled={busy} aria-label={`Vincular link original de ${row.recipientName}`} onClick={() => { setBindId(row.id); setOriginalLink(""); }}>Vincular link original</button></>}
          {bindId === row.id && <form className="experiment-bind" onSubmit={bind}><label>Link original de {row.recipientName}<input type="password" name="originalInvitationLink" autoComplete="off" maxLength={1024} required value={originalLink} onChange={e => setOriginalLink(e.target.value)} /></label><button className="access-button access-button-primary" disabled={busy} type="submit">Validar e vincular</button><button className="access-button access-button-secondary" disabled={busy} type="button" onClick={() => { setBindId(""); setOriginalLink(""); }}>Voltar</button></form>}
          {fallback?.id === row.id && <label>Link recuperado para cópia manual<input ref={fallbackRef} readOnly value={fallback.link} onBlur={() => setFallback(null)} /></label>}
        </td></tr>) : <tr><td colSpan={9}>Nenhum convite especial cadastrado.</td></tr>}
      </tbody></table></div>
    </section>
    {cancelId && <section className="experiment-panel" role="alert" aria-label="Confirmar cancelamento"><p>Cancelar o convite de {rows.find(r => r.id === cancelId)?.recipientName}? O link será invalidado no servidor e não permitirá novas interações.</p><button ref={confirmRef} disabled={busy} className="experiment-pill experiment-pill-danger experiment-cancel" onClick={() => void cancel()}>Confirmar cancelamento</button><button disabled={busy} className="access-button access-button-secondary" onClick={() => setCancelId("")}>Manter convite</button></section>}
  </main>;
}
