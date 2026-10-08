"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import type { PendingTerm } from "@/lib/terms";

export default function TermsAcceptanceClient({ initialPending, returnPath = "/inicio" }: { initialPending: PendingTerm[]; returnPath?: string }) {
  const [pending, setPending] = useState(initialPending);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = pending.find(item => item.actionable) ?? pending[0];

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
  }, []);

  async function accept() {
    if (!current?.actionable || !agreed || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/terms/accept", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: current.versionId, agreed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o aceite.");
      const next = await fetch("/api/terms/pending", { cache: "no-store" });
      if (!next.ok) throw new Error("Não foi possível conferir os aceites pendentes.");
      const body = await next.json();
      setPending(body.pending); setAgreed(false);
      if (!body.pending.length) window.location.assign(returnPath);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="terms-page"><section className="terms-card">
    <header><span className="terms-eyebrow">DEZ SOLUÇÕES · DOCUMENTOS OFICIAIS</span><h1>Aceite pendente</h1>
      <p>Consulte a versão publicada antes de registrar sua concordância.</p></header>
    {current && <div className="terms-document"><span className="terms-audience">{current.audience === "CONTRATANTE" ? "Responsável do tenant" : "Usuário da plataforma"}</span>
      <h2>{current.title}</h2><p>Versão {current.version} · publicada em {current.publishedAt ? new Date(current.publishedAt).toLocaleDateString("pt-BR") : "data indisponível"}</p>
      <a className="terms-file-link" href={`/api/terms/versions/${current.versionId}/file`} target="_blank" rel="noopener noreferrer">Visualizar ou baixar PDF</a>
      {current.actionable ? <><label className="terms-agreement"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
        <span>Li e concordo com os termos apresentados.</span></label>
        <button type="button" className="btn btn-primary" disabled={!agreed || busy} onClick={() => void accept()}>{busy ? "Registrando…" : "Aceitar documento"}</button></>
        : <p className="terms-wait" role="status">{current.reason}</p>}
    </div>}
    {pending.length > 1 && <p className="terms-remaining">{pending.length} documentos pendentes neste contexto.</p>}
    {error && <p role="alert" className="terms-error">{error}</p>}
    <button type="button" className="terms-signout" onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
  </section></main>;
}
