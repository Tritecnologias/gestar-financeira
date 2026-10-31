"use client";
import { messagePtBr } from "@/lib/presentation";

import { useRef, useState } from "react";
import { signOut } from "next-auth/react";
import type { PendingTerm } from "@/lib/terms";
import TermDocumentDialog, { type DisplayedTerm } from "./TermDocumentDialog";

export default function TermsAcceptanceClient({ initialPending, returnPath = "/inicio", personalSupport = false, audience, canReturnToChoice = false }: { initialPending: PendingTerm[]; returnPath?: string; personalSupport?: boolean; audience?: "USUARIO"; canReturnToChoice?: boolean }) {
  const acceptUrl = personalSupport ? "/api/support/terms" : "/api/terms/accept";
  const pendingUrl = personalSupport ? "/api/support/terms" : "/api/terms/pending";
  const [pending, setPending] = useState(initialPending);
  const [opened, setOpened] = useState<PendingTerm | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = pending.find(item => item.actionable) ?? pending[0];


  async function loadPending(): Promise<PendingTerm[]> {
    const response = await fetch(pendingUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível conferir os aceites pendentes.");
    const body = await response.json();
    if (!Array.isArray(body.pending)) throw new Error("Não foi possível conferir os documentos.");
    return audience ? body.pending.filter((item: PendingTerm) => item.audience === audience) : body.pending;
  }
  function close() { setOpened(null); requestAnimationFrame(() => trigger.current?.focus()); }
  async function backToChoice() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding/contractual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "back" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível retornar à escolha. Atualize a situação e tente novamente.");
      window.location.assign("/onboarding");
    } catch (cause) { setError(messagePtBr((cause as Error).message)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (busy) return;
    setBusy(true); setError("");
    try { const next = await loadPending(); setPending(next); close(); if (!next.length) window.location.assign(returnPath); }
    catch (cause) { setError(messagePtBr((cause as Error).message)); }
    finally { setBusy(false); }
  }
  async function accept(shown: DisplayedTerm) {
    if (!opened?.actionable || shown.versionId !== opened.versionId || shown.sha256 !== opened.sha256 || busy) return;
    setBusy(true); setError("");
    try {
      // A newly published version must be read and agreed to independently.
      const fresh = await loadPending();
      if (!fresh.some(t => t.actionable && t.versionId === shown.versionId && t.sha256 === shown.sha256)) {
        setPending(fresh); close();
        throw new Error("Os documentos mudaram durante a leitura. Abra a versão atual antes de registrar o aceite.");
      }
      const response = await fetch(acceptUrl, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: shown.versionId, agreed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o aceite.");
      const next = await loadPending();
      setPending(next); setOpened(next.find(t => t.actionable) ?? null);
      if (!next.length) window.location.assign(returnPath);
    } catch (cause) { setError(messagePtBr((cause as Error).message)); }
    finally { setBusy(false); }
  }

  return <main className="terms-page"><section className="terms-card">
    <header><span className="terms-eyebrow">DEZ SOLUÇÕES · DOCUMENTOS OFICIAIS</span><h1>Aceite pendente</h1>
      <p>{current?.audience === "USUARIO" ? "Este é o seu Termo de Uso da DEZ Soluções. Ele identifica você como usuário da plataforma e estabelece as condições de acesso, utilização e responsabilidades, contribuindo para a segurança das suas informações."
        : current?.documentCode === "TERM_CONTRATANTE" && current.audience === "CONTRATANTE" ? "Este é o Termo de Contratação da DEZ Soluções. Ele estabelece as condições de utilização do espaço contratado e as responsabilidades assumidas pelo responsável contratual, garantindo clareza e segurança na relação entre as partes."
        : "Consulte a versão publicada antes de registrar sua concordância."}</p></header>
    {current && <div className="terms-document"><span className="terms-audience">{current.audience === "CONTRATANTE" ? "Responsável da empresa" : "Usuário da plataforma"}</span>
      <h2>{current.title}</h2><p>Versão {current.version} · publicada em {current.publishedAt ? new Date(current.publishedAt).toLocaleDateString("pt-BR") : "data indisponível"}</p>
      <button ref={trigger} type="button" className="btn btn-primary" disabled={busy} onClick={() => { setError(""); setOpened(current); }}>{current.actionable ? "Ler e aceitar documento" : "Ler documento"}</button>
      {!current.actionable && <p className="terms-wait" role="status">{current.reason}</p>}
    </div>}
    {pending.length > 1 && <p className="terms-remaining">{pending.length} documentos pendentes neste contexto.</p>}
    {error && <div><p role="alert" className="terms-error">{messagePtBr(error)}</p><button type="button" className="terms-signout" disabled={busy} onClick={() => void refresh()}>Tentar novamente</button></div>}
    {canReturnToChoice && <button type="button" className="terms-signout terms-choice-back" disabled={busy} onClick={() => void backToChoice()}>Voltar à escolha</button>}
    <button type="button" className="terms-signout" onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>
  </section>{opened && <TermDocumentDialog key={opened.versionId} term={opened} personalSupport={personalSupport}
    busy={busy} error={error} backLabel={opened.audience === "CONTRATANTE" ? "Voltar" : undefined}
    onClose={opened.audience === "CONTRATANTE" && canReturnToChoice ? () => void backToChoice() : close} onAccept={accept} />}</main>;
}
