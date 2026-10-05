"use client";

import { useState } from "react";
import type { OfficialPreviewRow } from "@/lib/lancamento-official-import";
import "./official-import.css";

type Preview = {
  rows: OfficialPreviewRow[];
  resumo: { novos: number; alterados: number; inalterados: number; erros: number; conflitos: number; avisos: number };
  errors: { linha: number; campo: string; motivo: string }[];
};
type Props = { open: boolean; onClose: () => void; onImported: () => void; filters: string };

export default function OfficialImportModal({ open, onClose, onImported, filters }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewToken, setPreviewToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ criados: number; atualizados: number; inalterados: number; avisos: number } | null>(null);
  if (!open) return null;

  function close() {
    setFile(null); setPreview(null); setPreviewToken(""); setError(""); setResult(null);
    onClose();
  }

  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/lancamentos/importacao-oficial/base?${filters}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Falha ao baixar a base."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "lancamentos_10s.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao baixar a base."); }
    finally { setBusy(false); }
  }

  async function send(selected: File, mode: "preview" | "confirm", token = "") {
    const form = new FormData();
    form.append("file", selected); form.append("mode", mode);
    if (token) form.append("previewToken", token);
    const response = await fetch("/api/lancamentos/importacao-oficial", { method: "POST", body: form });
    const body = await response.json();
    if (body.preview) setPreview(body.preview);
    if (!response.ok) throw new Error(body.error || "Não foi possível processar o XLSX.");
    return body;
  }

  async function selectFile(selected: File | null) {
    setFile(selected); setPreview(null); setPreviewToken(""); setResult(null); setError("");
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) { setError("Use o XLSX oficial. Arquivos CSV legados não atualizam lançamentos."); return; }
    setBusy(true);
    try { const body = await send(selected, "preview"); setPreviewToken(body.previewToken); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao gerar prévia."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!file || !previewToken || !preview || preview.errors.length || busy) return;
    setBusy(true); setError("");
    try { const body = await send(file, "confirm", previewToken); setResult(body.result); onImported(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na confirmação. Nenhuma gravação parcial foi mantida."); setPreviewToken(""); }
    finally { setBusy(false); }
  }

  return <div className="modal-overlay open lanc-official-overlay" onClick={() => { if (!busy) close(); }}>
    <div className="modal-content lanc-official-modal" role="dialog" aria-modal="true" aria-labelledby="official-import-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 id="official-import-title">Importar Lançamentos</h2><button className="modal-close" aria-label="Fechar" onClick={close} disabled={busy}>✕</button></div>
      <div className="lanc-official-body">
        <ol className="lanc-official-steps">
          <li><button className="btn btn-secondary" onClick={() => void download()} disabled={busy}>Baixar Base XLSX</button><p>A base inclui todos os registros do filtro atual, além do modelo para novos lançamentos.</p></li>
          <li>Mantenha REGISTRO_ID e REGISTRO_VERSAO dos existentes. Para novos, deixe ambos vazios. Remover uma linha não exclui o registro.</li>
          <li><label>Selecione o arquivo .xlsx <input type="file" accept=".xlsx" onClick={event => { event.currentTarget.value = ""; }} onChange={event => void selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li>
          <li>Confira novos, alterações, inalterados, erros e avisos na prévia.</li>
          <li>Confirme somente após revisar. A aplicação é atômica e revalida o arquivo.</li>
        </ol>
        {busy && <p role="status">{preview ? "Revalidando e processando..." : "Lendo e validando todo o arquivo..."}</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {result && <div className="lanc-official-success" role="status">Concluído: {result.criados} criados, {result.atualizados} atualizados, {result.inalterados} inalterados e {result.avisos} avisos. Nenhum registro foi excluído.</div>}
        {preview && <>
          <div className="lanc-official-summary">{Object.entries(preview.resumo).map(([key, value]) => <div key={key}><strong>{key}</strong><span>{value}</span></div>)}</div>
          {preview.errors.length > 0 && <div className="lanc-official-errors"><strong>Erros bloqueantes — nenhuma escrita será realizada</strong>{preview.errors.map((issue, index) => <p key={index}>Linha {issue.linha}: {issue.motivo}</p>)}</div>}
          <div className="lanc-official-table-wrap"><table className="data-table lanc-official-table"><thead><tr><th>Linha</th><th>Registro</th><th>Ação</th><th>Diferenças / avisos / erros</th></tr></thead>
            <tbody>{preview.rows.slice(0, 200).map(row => <tr key={row.linha}><td>{row.linha}</td><td>{row.registroId || "Novo"}</td><td><span className={`lanc-official-state lanc-official-state--${row.acao.toLowerCase()}`}>{row.acao}</span></td><td>
              {row.diferencas.map(diff => <p key={diff.campo}><strong>{diff.campo}:</strong> antes “{diff.antes || "—"}” → depois “{diff.depois || "—"}”</p>)}
              {row.avisos.map((warning, index) => <p key={`w${index}`} className="lanc-official-warning">Aviso: {warning}</p>)}
              {row.erros.map((reason, index) => <p key={`e${index}`} className="lanc-official-error">{reason}</p>)}
            </td></tr>)}</tbody></table></div>
          {preview.rows.length > 200 && <p>Prévia visual limitada às primeiras 200 linhas; todas as {preview.rows.length} linhas foram validadas.</p>}
        </>}
      </div>
      <div className="modal-actions"><button className="btn btn-secondary" onClick={close} disabled={busy}>Fechar</button><button className="btn btn-primary" onClick={() => void confirm()} disabled={!preview || !!preview.errors.length || !preview.rows.length || !previewToken || !!result || busy}>Confirmar importação</button></div>
    </div>
  </div>;
}
