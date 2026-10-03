"use client";

import { useState } from "react";
import type { FinancialIssue, FinancialPreview, FinancialRow } from "@/lib/financial-import";

type Props = { onClose: () => void; onImported: () => void };

export default function FinancialImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinancialPreview | null>(null);
  const [localErrors, setLocalErrors] = useState<FinancialIssue[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<FinancialPreview["resumo"] | null>(null);

  async function downloadStructure() {
    setDownloading(true); setError("");
    try {
      const response = await fetch("/api/estrutura-financeira/exportar", { cache: "no-store" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Não foi possível baixar a estrutura."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "estrutura_financeira_10s.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível baixar a estrutura."); }
    finally { setDownloading(false); }
  }

  async function request(selected: File, mode: "preview" | "confirm") {
    const form = new FormData(); form.append("file", selected); form.append("mode", mode);
    const response = await fetch("/api/estrutura-financeira/importar", { method: "POST", body: form });
    const body = await response.json();
    if (body.preview) setPreview(body.preview);
    if (!response.ok) throw new Error(body.error || "Não foi possível processar o arquivo.");
    return body;
  }

  async function selectFile(selected: File | null) {
    setFile(selected); setPreview(null); setResult(null); setError(""); setLocalErrors([]);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) { setError("Selecione um arquivo .xlsx."); return; }
    setBusy(true);
    try {
      const { parseFinancialWorkbook, validateFinancialWorkbookInput } = await import("@/lib/financial-import");
      const parsed = parseFinancialWorkbook(new Uint8Array(await selected.arrayBuffer()));
      setLocalErrors(validateFinancialWorkbookInput(parsed));
      await request(selected, "preview");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao ler o Excel."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!file || !preview || preview.errors.length || busy) return;
    setBusy(true); setError("");
    try { const body = await request(file, "confirm"); setResult(body.resumo); onImported(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Importação não concluída."); }
    finally { setBusy(false); }
  }

  function rows(title: string, data: FinancialRow[], isAccount: boolean) {
    return <section className="management-import-section">
      <h3>{title}</h3>
      <div className="management-import-table-wrap"><table className="data-table management-import-table">
        <thead><tr><th>Linha</th><th>Código</th><th>Descrição</th>{isAccount && <><th>Código Categoria</th><th>Tipo</th></>}<th>Ação</th></tr></thead>
        <tbody>{data.map(row => <tr key={row.linha}><td>{row.linha}</td><td>{row.codigo || "—"}</td><td>{row.descricao || "—"}</td>{isAccount && <><td>{row.codigoCategoria || "—"}</td><td>{row.tipo || "—"}</td></>}<td>{row.acao === "novo" ? "Novo" : row.acao === "atualizar" ? "Atualizar" : "Erro"}{row.detalhes?.map((detail, index) => <div className="management-import-diff" key={index}>{detail}</div>)}</td></tr>)}</tbody>
      </table></div>
    </section>;
  }

  return <div className="modal-overlay open management-import-overlay" onClick={onClose}>
    <div className="modal-content management-import-modal" role="dialog" aria-modal="true" aria-labelledby="financial-import-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 id="financial-import-title">Importar Estrutura Financeira</h2><button className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button></div>
      <div className="management-import-body">
        <ol className="management-import-steps">
          <li><button className="btn btn-secondary" onClick={downloadStructure} disabled={downloading}>Baixar Estrutura Financeira</button><p>Baixe os cadastros atuais para editar ou acrescentar novos registros. Sem dados, o arquivo virá vazio para preenchimento.</p></li>
          <li>Preencha as abas da planilha. Mantenha os códigos como texto e informe o tipo da Conta.</li>
          <li><label className="management-import-file">Selecione o arquivo .xlsx <input type="file" accept=".xlsx" onChange={event => selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li>
          <li>Confira a prévia e os erros abaixo.</li>
          <li>Confirme a importação após revisar os dados.</li>
        </ol>
        {busy && <p role="status">{preview ? "Confirmando e revalidando..." : "Lendo e validando..."}</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {result && <div className="management-import-success" role="status">Importação concluída: {result.totalNovo} novos e {result.totalAtualizado} atualizados. Nenhum registro foi excluído.</div>}
        {!preview && localErrors.length > 0 && <div className="management-import-issues"><h3>Erros encontrados no arquivo</h3>{localErrors.map((issue, index) => <p key={index}>{issue.aba}, linha {issue.linha}, {issue.campo}: {issue.motivo}</p>)}</div>}
        {preview && <>
          <div className="management-import-summary"><div><strong>Total lido</strong><span>{preview.resumo.totalLido}</span></div><div><strong>Novos</strong><span>{preview.resumo.totalNovo}</span></div><div><strong>Atualizações</strong><span>{preview.resumo.totalAtualizado}</span></div><div><strong>Inválidos</strong><span>{preview.resumo.totalInvalido}</span></div></div>
          <p className="management-import-subsummary">Categorias: {preview.resumo.categorias.novos} novas, {preview.resumo.categorias.atualizacoes} atualizações, {preview.resumo.categorias.erros} erros. Contas: {preview.resumo.contas.novos} novas, {preview.resumo.contas.atualizacoes} atualizações, {preview.resumo.contas.erros} erros.</p>
          {rows("Categorias N1", preview.categorias, false)}
          {rows("Contas N2", preview.contas, true)}
          {preview.errors.length > 0 && <div className="management-import-issues"><h3>Erros bloqueantes</h3>{preview.errors.map((issue, index) => <p key={index}><strong>{issue.aba}, linha {issue.linha}, {issue.campo}</strong>{issue.codigo ? `, código ${issue.codigo}` : ""}: {issue.motivo}</p>)}</div>}
        </>}
      </div>
      <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={confirm} disabled={!preview || !!preview.errors.length || !preview.resumo.totalLido || !!result || busy}>Confirmar importação</button></div>
    </div>
  </div>;
}
