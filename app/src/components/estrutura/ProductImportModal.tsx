"use client";

import { useState } from "react";
import type { ProductImportIssue, ProductPreview, TypeRow, LineRow, ItemRow } from "@/lib/product-import";

type Props = { onClose: () => void; onImported: () => void };
type PreviewRow = TypeRow | LineRow | ItemRow;
const labels = { novo: "Novo", atualizar: "Atualização", igual: "Sem alteração", erro: "Erro" } as const;

export default function ProductImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [result, setResult] = useState<ProductPreview["resumo"] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true); setError("");
    try {
      const response = await fetch("/api/produtos/exportar", { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Não foi possível baixar a estrutura."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "produtos_servicos_10s.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível baixar a estrutura."); }
    finally { setDownloading(false); }
  }
  async function request(selected: File, mode: "preview" | "confirm") {
    const form = new FormData(); form.append("file", selected); form.append("mode", mode);
    const response = await fetch("/api/produtos/importar", { method: "POST", body: form });
    const body = await response.json().catch(() => null);
    if (body?.preview) setPreview(body.preview);
    if (!response.ok) throw new Error(body?.error || "Não foi possível processar o arquivo.");
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
    if (!file || !preview || preview.errors.length || busy || result) return;
    setBusy(true); setError("");
    try { const body = await request(file, "confirm"); setResult(body.resumo); onImported(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Importação não concluída."); }
    finally { setBusy(false); }
  }
  function issues(title: string, list: ProductImportIssue[]) {
    return list.length > 0 && <section className={`product-import-issues product-import-issues--${title === "Erros bloqueantes" ? "error" : title === "Avisos" ? "warning" : "suggestion"}`}><h3>{title} ({list.length})</h3>{list.map((issue, index) => <p key={`${issue.aba}-${issue.linha}-${issue.campo}-${index}`}><strong>{issue.aba}, linha {issue.linha}, {issue.campo}</strong>{issue.codigo ? `, código ${issue.codigo}` : ""}: {issue.motivo}</p>)}</section>;
  }
  function rows(title: string, data: PreviewRow[]) {
    return <section className="product-import-section"><h3>{title}</h3><div className="product-import-table-wrap"><table className="data-table product-import-table"><thead><tr><th>Linha</th><th>Código</th><th>Nome</th><th>Referência</th><th>Ação / revisão</th></tr></thead><tbody>
      {data.map(row => <tr key={row.linha}><td>{row.linha}</td><td>{row.codigo || ("grupo" in row && "codigoTipo" in row ? "Automático" : "—")}</td><td>{row.nome || "—"}</td><td>{"codigoTipo" in row ? `${"grupo" in row ? `${row.grupo} / ` : ""}${row.codigoTipo}${"codigoLinha" in row && row.codigoLinha ? ` / ${row.codigoLinha}` : ""}` : row.grupo}</td><td><strong className={`product-import-action product-import-action--${row.acao || "erro"}`}>{labels[row.acao || "erro"]}</strong>{row.detalhes?.map((detail, index) => <div key={index} className="product-import-diff">{detail}</div>)}{row.avisos?.map((warning, index) => <div key={`w-${index}`} className="product-import-warning">Aviso: {warning}</div>)}{row.sugestoes?.map((suggestion, index) => <div key={`s-${index}`} className="product-import-suggestion">Sugestão: {suggestion}</div>)}</td></tr>)}
      {!data.length && <tr><td colSpan={5}>Nenhuma linha nesta aba.</td></tr>}
    </tbody></table></div></section>;
  }

  return <div className="modal-overlay open product-import-overlay" onClick={onClose}><div className="modal-content product-import-modal" role="dialog" aria-modal="true" aria-labelledby="product-import-title" onClick={event => event.stopPropagation()}>
    <div className="modal-header"><h2 id="product-import-title">Importar Produtos e Serviços</h2><button className="modal-close" aria-label="Fechar" onClick={onClose}>×</button></div>
    <div className="product-import-body">
      <ol className="product-import-steps"><li><button className="btn btn-secondary" onClick={() => void download()} disabled={downloading}>Baixar Estrutura</button><p>Baixe os cadastros ativos para editar ou acrescentar. Sem dados, o arquivo vem vazio com cabeçalhos.</p></li><li>Edite ou preencha as abas TIPOS, LINHAS e ITENS no Excel. Preserve os códigos como texto.</li><li><label className="product-import-file">Selecione o arquivo .xlsx<input type="file" accept=".xlsx" onClick={event => { event.currentTarget.value = ""; setFile(null); setPreview(null); setResult(null); }} onChange={event => void selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li><li>Confira a prévia, avisos e erros.</li><li>Confirme a importação após revisar.</li></ol>
      {busy && <p role="status">{preview ? "Revalidando e confirmando…" : "Lendo e validando…"}</p>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {result && <div className="product-import-success" role="status">Importação concluída: {result.totalNovo} novos, {result.totalAtualizado} atualizados e {result.totalSemAlteracao} sem alteração. Nenhum registro foi excluído.</div>}
      {preview && <><div className="product-import-summary">{[["Lidos", preview.resumo.totalLido], ["Novos", preview.resumo.totalNovo], ["Atualizações", preview.resumo.totalAtualizado], ["Sem alteração", preview.resumo.totalSemAlteracao], ["Avisos", preview.resumo.totalAvisos], ["Erros", preview.resumo.totalErros]].map(([label, value]) => <div key={label}><strong>{label}</strong><span>{value}</span></div>)}</div>
        <p className="product-import-subsummary">Tipos: {preview.resumo.tipos.novos} novos, {preview.resumo.tipos.atualizacoes} atualizados. Linhas: {preview.resumo.linhas.novos} novas, {preview.resumo.linhas.atualizacoes} atualizadas. Itens: {preview.resumo.itens.novos} novos, {preview.resumo.itens.atualizacoes} atualizados.</p>
        <p className="product-import-subsummary">Ausentes do arquivo: {preview.resumo.ausentes.tipos} Tipos, {preview.resumo.ausentes.linhas} Linhas e {preview.resumo.ausentes.itens} Itens ativos. Permanecerão inalterados.</p>
        {rows("Tipos", preview.tipos)}{rows("Linhas", preview.linhas)}{rows("Itens", preview.itens)}
        {issues("Erros bloqueantes", preview.errors)}{issues("Avisos", preview.warnings)}{issues("Sugestões", preview.suggestions)}
      </>}
    </div>
    <div className="product-import-footer"><button className="btn btn-secondary" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={() => void confirm()} disabled={!preview || !!preview.errors.length || !preview.resumo.totalLido || !!result || busy}>Confirmar importação</button></div>
  </div></div>;
}
