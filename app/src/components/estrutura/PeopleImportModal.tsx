"use client";

import { useState } from "react";
import type { PeopleImportPreview } from "@/lib/people-import";

type Props = { onClose: () => void; onImported: () => void };

async function downloadPeople() {
  const response = await fetch("/api/pessoas/exportar", { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Não foi possível baixar Pessoas.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "pessoas_10s.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PeopleImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PeopleImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<PeopleImportPreview["resumo"] | null>(null);

  async function download() {
    setDownloading(true); setError("");
    try { await downloadPeople(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível baixar Pessoas."); }
    finally { setDownloading(false); }
  }

  async function request(selected: File, mode: "preview" | "confirm") {
    const form = new FormData();
    form.append("file", selected);
    form.append("mode", mode);
    const response = await fetch("/api/pessoas/importar", { method: "POST", body: form });
    const body = await response.json();
    if (body.preview) setPreview(body.preview);
    if (!response.ok) throw new Error(body.error || "Não foi possível processar o arquivo.");
    return body;
  }

  async function selectFile(selected: File | null) {
    setFile(selected); setPreview(null); setResult(null); setError("");
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) { setError("Selecione um arquivo .xlsx."); return; }
    setBusy(true);
    try { await request(selected, "preview"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao ler o Excel."); }
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

  return <div className="modal-overlay open people-import-overlay" onClick={onClose}>
    <div className="modal-content people-import-modal" role="dialog" aria-modal="true" aria-labelledby="people-import-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 id="people-import-title">Importar Pessoas</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>✕</button></div>
      <div className="people-import-body">
        <ol className="people-import-steps">
          <li><button type="button" className="btn btn-secondary" onClick={() => void download()} disabled={downloading}>Baixar Pessoas</button><p>Baixe os cadastros atuais para editar ou acrescentar novos registros. Sem dados, o arquivo virá vazio para preenchimento.</p></li>
          <li>Edite ou acrescente linhas no Excel. Mantenha os códigos como texto.</li>
          <li><label className="people-import-file">Selecione o arquivo .xlsx <input type="file" accept=".xlsx" onChange={event => void selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li>
          <li>Confira a prévia e os erros.</li>
          <li>Confirme a importação após revisar os dados.</li>
        </ol>
        {busy && <p role="status">{preview ? "Confirmando e revalidando..." : "Lendo e validando..."}</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {result && <div className="people-import-success" role="status">Importação concluída: {result.totalNovo} novas e {result.totalAtualizado} atualizadas. Nenhuma Pessoa foi excluída.</div>}
        {preview && <>
          <div className="people-import-summary">
            <div><strong>Total lido</strong><span>{preview.resumo.totalLido}</span></div>
            <div><strong>Novas</strong><span>{preview.resumo.totalNovo}</span></div>
            <div><strong>Atualizações</strong><span>{preview.resumo.totalAtualizado}</span></div>
            <div><strong>Inválidas</strong><span>{preview.resumo.totalInvalido}</span></div>
          </div>
          <div className="people-import-table-wrap"><table className="data-table people-import-table">
            <thead><tr><th>Linha</th><th>Código</th><th>Nome</th><th>Cargo</th><th>Código CC</th><th>Email</th><th>Telefone</th><th>Ação / alterações</th></tr></thead>
            <tbody>{preview.pessoas.map(row => <tr key={row.linha}><td>{row.linha}</td><td>{row.codigo || "—"}</td><td>{row.nome || "—"}</td><td>{row.cargo || "—"}</td><td>{row.codigoCC || "—"}</td><td>{row.email || "—"}</td><td>{row.telefone || "—"}</td><td>{row.acao === "novo" ? "Nova" : row.acao === "atualizar" ? "Atualizar" : "Erro"}{row.detalhes?.map((detail, index) => <div className="people-import-diff" key={index}>{detail}</div>)}</td></tr>)}</tbody>
          </table></div>
          {preview.errors.length > 0 && <div className="people-import-issues"><h3>Erros bloqueantes</h3>{preview.errors.map((issue, index) => <p key={index}><strong>{issue.aba}, linha {issue.linha || "—"}, {issue.campo}</strong>{issue.codigo ? `, código ${issue.codigo}` : ""}: {issue.motivo}</p>)}</div>}
        </>}
      </div>
      <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button><button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={!preview || !!preview.errors.length || !preview.resumo.totalLido || !!result || busy}>Confirmar importação</button></div>
    </div>
  </div>;
}
