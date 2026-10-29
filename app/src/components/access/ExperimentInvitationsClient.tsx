"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { selectExperimentInvitations, experimentSituationTone, type ExperimentAdminItem, type InvitationInterest, type InvitationSituation } from "@/lib/experiment-admin-list";
import "./access.css";
import "./experiment-invitations.css";

type Item = ExperimentAdminItem;
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Ainda não";
export default function ExperimentInvitationsClient({ homolog = false }: { homolog?: boolean }) {
  const [rows, setRows] = useState<Item[]>([]), [name, setName] = useState(""), [hours, setHours] = useState("72");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [cancelId, setCancelId] = useState("");
  const [bindId, setBindId] = useState(""), [originalLink, setOriginalLink] = useState("");
  const [fallback, setFallback] = useState<{ id: string; link: string } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState(""), [situation, setSituation] = useState<InvitationSituation>("ALL"), [interest, setInterest] = useState<InvitationInterest>("ALL");
  const fallbackRef = useRef<HTMLInputElement>(null), returnRef = useRef<HTMLButtonElement>(null), cancelDialog = useRef<HTMLDialogElement>(null), tableRegion = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/platform/experiment-invitations", { cache: "no-store" }); const b = await r.json();
    if (!r.ok) throw new Error(b.error || "Não foi possível consultar."); setRows(b); setClock(Date.now()); setFallback(null); setBindId(""); setOriginalLink("");
  }, []);
  useEffect(() => { setReady(true); void load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => { if (fallback) { fallbackRef.current?.focus(); fallbackRef.current?.select(); } }, [fallback]);
  useEffect(() => {
    if (!cancelId) return;
    const dialog = cancelDialog.current, opener = document.activeElement as HTMLElement | null;
    dialog?.showModal(); returnRef.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      if (opener?.isConnected && !(opener as HTMLButtonElement).disabled) opener.focus({ preventScroll: true });
      else tableRegion.current?.focus({ preventScroll: true });
    };
  }, [cancelId]);
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
  const displayedRows = selectExperimentInvitations(rows, query, situation, interest, clock);
  return <main className="access-page access-platform experiment-admin"><div className="experiment-admin-top"><header className="access-header"><div><h1>Convites Especiais</h1><p>{homolog ? "Convites de experimentação · HOMOLOG" : "Convites de experimentação"}</p></div><Link href="/plataforma" className="access-button access-button-secondary">Administração da Plataforma</Link></header>
    <p className="experiment-intro">Convide uma pessoa para conhecer a DEZ. Este convite não cria conta, empresa ou acesso à plataforma e não representa aceite contratual. Nenhum e-mail será enviado.</p>
    {error && <p role="alert" className="access-error">{error}</p>}<p role="status" aria-live="polite">{notice}</p>
    <section className="experiment-panel"><h2>Criar convite especial</h2><form method="post" onSubmit={create} className="experiment-form"><label>Nome do destinatário<input name="recipientName" required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label>Validade em horas<input name="hours" type="number" min="1" max="168" required value={hours} onChange={e => setHours(e.target.value)} /></label><button type="submit" className="access-button access-button-primary" disabled={!ready || busy}>{!ready || busy ? "Aguarde…" : "Criar convite"}</button></form></section>
    </div>
    <section className="experiment-panel experiment-list-panel"><div className="experiment-list-controls"><div className="experiment-list-heading"><h2>Convites e manifestações de interesse</h2><button className="access-button access-button-secondary" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Atualizar lista</button></div>
      <div className="experiment-filters"><label>Buscar por nome ou referência<input type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Situação do convite<select value={situation} onChange={e => setSituation(e.target.value as InvitationSituation)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="REVOKED">Cancelados</option><option value="EXPIRED">Expirados</option></select></label><label>Manifestação de interesse<select value={interest} onChange={e => setInterest(e.target.value as InvitationInterest)}><option value="ALL">Todos</option><option value="REGISTERED">Interesse registrado</option><option value="WAITING">Aguardando interesse</option></select></label></div>
      <p id="experiment-table-help">Busca nos últimos 100 convites. Cancelados ao final. A tabela tem rolagem própria, vertical e horizontal.</p><p className="experiment-result-count" role="status" aria-live="polite">{displayedRows.length} de {rows.length} convites exibidos.</p></div>
      <div ref={tableRegion} className="experiment-table-scroll" role="region" aria-label="Tabela de convites especiais" aria-describedby="experiment-table-help" tabIndex={0}><table className="experiment-table"><caption>Convites especiais e acompanhamento da jornada</caption><thead><tr>{["Nome", "Referência", "Situação", "Criado em", "Expira em", "Visualizado", "Boas-vindas confirmadas", "Interesse", "Ações"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>
        {displayedRows.length ? displayedRows.map(row => <tr key={row.id}><th scope="row">{row.recipientName}</th><td><span title={row.id}>{row.id.slice(0, 8)}</span></td><td><span className={`experiment-pill experiment-pill-${experimentSituationTone(row)}`}>{row.status === "REVOKED" ? "Cancelado" : row.status === "EXPIRED" ? "Expirado" : "Ativo"}</span></td><td>{date(row.createdAt)}</td><td>{date(row.expiresAt)}</td><td>{date(row.viewedAt)}</td><td>{row.acknowledgedAt ? date(row.acknowledgedAt) : "Pendentes"}</td><td>{row.interestAt ? <><span className="experiment-pill experiment-pill-success">Interesse registrado</span><small>{date(row.interestAt)}</small></> : <span className="experiment-pill experiment-pill-warning">Ainda não manifestado</span>}</td><td className="experiment-actions">
          <button type="button" className="access-button access-button-secondary" aria-label={`Copiar link de ${row.recipientName}`} title={row.canCopyLink ? "Copiar o mesmo link" : row.status !== "ACTIVE" ? "Convite expirado ou cancelado" : "Convite antigo: vinculação opcional do link original necessária para recuperar"} disabled={busy || !row.canCopyLink} onClick={() => void copy(row)}>Copiar link</button>
          {row.status === "ACTIVE" && <button type="button" className="experiment-pill experiment-pill-danger experiment-cancel" disabled={busy} aria-label={`Cancelar convite de ${row.recipientName}`} onClick={() => setCancelId(row.id)}>Cancelar</button>}
          {row.status === "ACTIVE" && !row.linkRecoverable && <><small>Convite anterior sem link recuperável. A vinculação é opcional e não altera o convite.</small><button type="button" className="access-button access-button-secondary" disabled={busy} aria-label={`Vincular link original de ${row.recipientName}`} onClick={() => { setBindId(row.id); setOriginalLink(""); }}>Vincular link original</button></>}
          {bindId === row.id && <form method="post" className="experiment-bind" onSubmit={bind}><label>Link original de {row.recipientName}<input type="password" name="originalInvitationLink" autoComplete="off" maxLength={1024} required value={originalLink} onChange={e => setOriginalLink(e.target.value)} /></label><button className="access-button access-button-primary" disabled={!ready || busy} type="submit">Validar e vincular</button><button className="access-button access-button-secondary" disabled={busy} type="button" onClick={() => { setBindId(""); setOriginalLink(""); }}>Voltar</button></form>}
          {fallback?.id === row.id && <label>Link recuperado para cópia manual<input ref={fallbackRef} readOnly value={fallback.link} onBlur={() => setFallback(null)} /></label>}
        </td></tr>) : <tr><td colSpan={9}>{rows.length ? "Nenhum convite corresponde à busca e aos filtros." : "Nenhum convite especial cadastrado."}</td></tr>}
      </tbody></table></div>
    </section>
    {cancelId && <dialog ref={cancelDialog} className="access-modal experiment-cancel-dialog" aria-labelledby="experiment-cancel-title" aria-describedby="experiment-cancel-description" onKeyDown={e => { if (e.key !== "Tab") return; const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")); const first = buttons[0], last = buttons[buttons.length - 1]; if (!first) { e.preventDefault(); return; } if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }} onCancel={e => { e.preventDefault(); if (!busy) setCancelId(""); }}><h2 id="experiment-cancel-title">Cancelar convite?</h2><p id="experiment-cancel-description">O convite de <strong>{rows.find(r => r.id === cancelId)?.recipientName}</strong> será cancelado. O link será invalidado imediatamente e o registro permanecerá no histórico.</p>{error && <p role="alert" className="access-error">{error}</p>}<div className="access-modal-actions"><button ref={returnRef} disabled={busy} className="access-button access-button-secondary" onClick={() => setCancelId("")}>Voltar</button><button disabled={busy} className="experiment-pill experiment-pill-danger experiment-cancel" onClick={() => void cancel()}>Confirmar cancelamento</button></div></dialog>}
  </main>;
}
