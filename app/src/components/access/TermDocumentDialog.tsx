"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingTerm } from "@/lib/terms";
import OfficialPdfDocument from "./OfficialPdfDocument";

export type DisplayedTerm = { versionId: string; sha256: string };
type VerifiedPdf = DisplayedTerm & { bytes: Uint8Array; url: string };

export default function TermDocumentDialog({ term, personalSupport, busy, error, label = "Documento oficial", onClose, onAccept }: {
  term: PendingTerm; personalSupport: boolean; busy: boolean; error: string;
  label?: string;
  onClose: () => void; onAccept: (shown: DisplayedTerm) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<VerifiedPdf | null>(null), [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false), [agreed, setAgreed] = useState(false), [zoom, setZoom] = useState(100), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    element?.showModal(); heading.current?.focus();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    setFile(null); setLoadError(""); setReady(false); setAgreed(false);
    void (async () => {
      const path = personalSupport ? `/api/support/terms/${term.versionId}` : `/api/terms/versions/${term.versionId}/file`;
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Não foi possível abrir o documento oficial. Atualize os documentos e tente novamente.");
      if (!/^[a-f0-9]{64}$/.test(term.sha256) || response.headers.get("X-Term-Version-Id") !== term.versionId ||
          response.headers.get("X-Term-Sha256") !== term.sha256 || !response.headers.get("Content-Type")?.startsWith("application/pdf")) throw new Error("Não foi possível confirmar a versão e a integridade do documento.");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 10 * 1024 * 1024 || new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-") throw new Error("Documento PDF indisponível.");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), b => b.toString(16).padStart(2, "0")).join("");
      if (hash !== term.sha256) throw new Error("A integridade do PDF não foi confirmada. O aceite permanece indisponível.");
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
      setFile({ versionId: term.versionId, sha256: hash, bytes: new Uint8Array(buffer), url });
    })().catch(cause => { if (!controller.signal.aborted) setLoadError((cause as Error).message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [term.versionId, term.sha256, personalSupport, attempt]);
  const painted = useCallback(() => setReady(true), []);
  const failed = useCallback(() => { setReady(false); setAgreed(false); setLoadError("Não foi possível exibir o PDF. Tente novamente ou baixe o arquivo para consulta."); }, []);
  const canAccept = term.actionable && file?.versionId === term.versionId && file.sha256 === term.sha256 && ready && !loadError && agreed && !busy;
  return <dialog ref={dialog} className="term-reader-dialog" aria-labelledby="term-reader-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="term-reader-shell">
      <header className="term-reader-heading"><div><span className="terms-eyebrow">{label} · Versão {term.version}</span>
        <h2 id="term-reader-title" ref={heading} tabIndex={-1}>{term.title}</h2></div>
        <button type="button" className="term-reader-close" aria-label="Fechar documento" disabled={busy} onClick={onClose}>×</button></header>
      <div className="term-reader-toolbar"><div className="term-reader-zoom" role="group" aria-label="Ampliação do PDF">
        <button type="button" aria-label="Diminuir zoom" disabled={zoom <= 100} onClick={() => setZoom(z => z - 25)}>−</button><output aria-live="polite">{zoom}%</output>
        <button type="button" aria-label="Aumentar zoom" disabled={zoom >= 200} onClick={() => setZoom(z => z + 25)}>+</button>
        <button type="button" className="term-reader-fit" onClick={() => setZoom(100)}>Ajustar largura</button></div>
        {file && <a href={file.url} download={`DEZ-${term.audience}-${term.version}.pdf`} className="terms-file-link">Baixar PDF</a>}</div>
      {loadError ? <div className="term-reader-failure"><p role="alert">{loadError}</p><button type="button" className="btn" onClick={() => setAttempt(n => n + 1)}>Tentar novamente</button></div>
        : file ? <OfficialPdfDocument bytes={file.bytes} zoom={zoom} onReady={painted} onError={failed} /> : <div className="term-reader-loading" role="status">Carregando e verificando o PDF oficial…</div>}
      <footer className="term-reader-footer">
        {error && <p role="alert" className="terms-error">{error}</p>}
        {term.actionable ? <><label className="terms-agreement"><input type="checkbox" checked={agreed} disabled={!ready || !!loadError || busy} onChange={event => setAgreed(event.target.checked)} />
          <span>Li e concordo com o documento oficial apresentado, versão {term.version}.</span></label>
          <button type="button" className="btn btn-primary" disabled={!canAccept} onClick={() => { if (canAccept && file) void onAccept({ versionId: file.versionId, sha256: file.sha256 }); }}>{busy ? "Registrando…" : "Aceitar documento"}</button></>
          : <p className="terms-wait" role="status">{term.reason}</p>}
        <details className="term-reader-integrity"><summary>Integridade do documento</summary><span>SHA-256: {term.sha256}</span></details>
      </footer>
    </div>
  </dialog>;
}
