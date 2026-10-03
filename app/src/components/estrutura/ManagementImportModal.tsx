"use client";

import { useState } from "react";
import type { ImportIssue, ImportPreview, ImportRow } from "@/lib/management-import";

type Props = { onClose: () => void; onImported: () => void };

export default function ManagementImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [localErrors, setLocalErrors] = useState<ImportIssue[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportPreview["resumo"] | null>(null);

  async function downloadTemplate() {
    setDownloading(true); setError("");
    try {
      const { createManagementImportTemplate, MANAGEMENT_TEMPLATE_FILENAME } = await import("@/lib/management-import-template");
      const url = URL.createObjectURL(new Blob([createManagementImportTemplate()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      const link = document.createElement("a");
      link.href = url;
      link.download = MANAGEMENT_TEMPLATE_FILENAME;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("Não foi possível gerar o modelo Excel."); }
    finally { setDownloading(false); }
  }

  async function request(selected: File, mode: "preview" | "confirm") {
    const form = new FormData();
    form.append("file", selected);
    form.append("mode", mode);
    const response = await fetch("/api/estrutura-gerencial/importar", { method: "POST", body: form });
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
      const { parseManagementWorkbook, validateManagementWorkbookInput } = await import("@/lib/management-import");
      const parsed = parseManagementWorkbook(new Uint8Array(await selected.arrayBuffer()));
      setLocalErrors(validateManagementWorkbookInput(parsed));
      await request(selected, "preview");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao ler o Excel."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!file || !preview || preview.errors.length || busy) return;
    setBusy(true); setError("");
    try {
      const body = await request(file, "confirm");
      setResult(body.resumo);
      onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Importação não concluída."); }
    finally { setBusy(false); }
  }

  function rows(title: string, data: ImportRow[], isCenter: boolean) {
    return <section className="management-import-section">
      <h3>{title}</h3>
      <div className="management-import-table-wrap"><table className="data-table management-import-table">
        <thead><tr><th>Linha</th><th>Código</th><th>Descrição</th>{isCenter && <th>Código Área</th>}<th>Ação</th></tr></thead>
        <tbody>{data.map(row => <tr key={row.linha}><td>{row.linha}</td><td>{row.codigo || "—"}</td><td>{row.descricao || "—"}</td>{isCenter && <td>{row.codigoArea || "—"}</td>}<td>{row.acao === "novo" ? "Novo" : row.acao === "atualizar" ? "Atualizar" : "Erro"}{row.detalhes?.map((detail, index) => <div className="management-import-diff" key={index}>{detail}</div>)}</td></tr>)}</tbody>
      </table></div>
    </section>;
  }

  return <div className="modal-overlay open management-import-overlay" onClick={onClose}>
    <div className="modal-content management-import-modal" role="dialog" aria-modal="true" aria-labelledby="management-import-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 id="management-import-title">Importar Estrutura Gerencial</h2><button className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button></div>
      <div className="management-import-body">
        <ol className="management-import-steps">
          <li><button className="btn btn-secondary" onClick={downloadTemplate} disabled={downloading}>Baixar Modelo Excel</button></li>
          <li>Preencha as abas do modelo. Mantenha os códigos como texto.</li>
          <li><label className="management-import-file">Selecione o arquivo .xlsx <input type="file" accept=".xlsx" onChange={event => selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li>
          <li>Confira a prévia e os erros abaixo.</li>
          <li>Confirme a importação após revisar os dados.</li>
        </ol>
        {busy && <p role="status">{preview ? "Confirmando e revalidando..." : "Lendo e validando..."}</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {result && <div className="management-import-success" role="status">Importação concluída: {result.totalNovo} novos e {result.totalAtualizado} atualizados. Nenhum registro foi excluído.</div>}
        {!preview && localErrors.length > 0 && <div className="management-import-issues"><h3>Erros encontrados no arquivo</h3>{localErrors.map((issue, index) => <p key={index}>{issue.aba}, linha {issue.linha}, {issue.campo}: {issue.motivo}</p>)}</div>}
        {preview && <>
          <div className="management-import-summary">
            <div><strong>Total lido</strong><span>{preview.resumo.totalLido}</span></div>
            <div><strong>Novos</strong><span>{preview.resumo.totalNovo}</span></div>
            <div><strong>Atualizações</strong><span>{preview.resumo.totalAtualizado}</span></div>
            <div><strong>Inválidos</strong><span>{preview.resumo.totalInvalido}</span></div>
          </div>
          <p className="management-import-subsummary">Áreas: {preview.resumo.areas.novos} novas, {preview.resumo.areas.atualizacoes} atualizações, {preview.resumo.areas.erros} erros. Centros: {preview.resumo.centros.novos} novos, {preview.resumo.centros.atualizacoes} atualizações, {preview.resumo.centros.erros} erros.</p>
          {rows("Áreas de Negócio", preview.areas, false)}
          {rows("Centros de Custo", preview.centros, true)}
          {preview.errors.length > 0 && <div className="management-import-issues"><h3>Erros bloqueantes</h3>{preview.errors.map((issue, index) => <p key={index}><strong>{issue.aba}, linha {issue.linha}, {issue.campo}</strong>{issue.codigo ? `, código ${issue.codigo}` : ""}: {issue.motivo}</p>)}</div>}
        </>}
      </div>
      <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={confirm} disabled={!preview || !!preview.errors.length || !preview.resumo.totalLido || !!result || busy}>Confirmar importação</button></div>
    </div>
  </div>;
}
