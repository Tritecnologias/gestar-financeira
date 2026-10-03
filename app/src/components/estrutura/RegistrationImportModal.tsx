"use client";

import { useState } from "react";
import type { RegistrationIssue, RegistrationPreview, RegistrationRow } from "@/lib/registration-import";
import { REGISTRATION_FILENAME } from "@/lib/registration-import-template";

type Props = { onClose: () => void; onImported: () => void };
type CreatedCodes = { clientes: { linha: number; codigo: string; nome: string }[]; fornecedores: { linha: number; codigo: string; nome: string }[] };
const actionName = { novo: "Novo", atualizar: "Atualização", igual: "Sem alteração", erro: "Erro" } as const;

export default function RegistrationImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RegistrationPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<RegistrationPreview["resumo"] | null>(null);
  const [created, setCreated] = useState<CreatedCodes | null>(null);

  async function download() {
    setDownloading(true); setError("");
    try {
      const response = await fetch("/api/dimensoes-cadastrais/exportar", { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Não foi possível baixar cadastros."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = REGISTRATION_FILENAME;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível baixar cadastros."); }
    finally { setDownloading(false); }
  }

  async function request(selected: File, mode: "preview" | "confirm") {
    const form = new FormData(); form.append("file", selected); form.append("mode", mode);
    const response = await fetch("/api/dimensoes-cadastrais/importar", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (body.preview) setPreview(body.preview);
    if (!response.ok) throw new Error(body.error || "Não foi possível processar a planilha.");
    return body;
  }

  async function selectFile(selected: File | null) {
    setFile(selected); setPreview(null); setResult(null); setCreated(null); setError("");
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".xlsx")) { setError("Selecione um arquivo .xlsx."); return; }
    setBusy(true);
    try { await request(selected, "preview"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao ler a planilha."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!file || !preview || preview.errors.length || !preview.resumo.totalLido || busy || result) return;
    setBusy(true); setError("");
    try { const body = await request(file, "confirm"); setResult(body.resumo); setCreated(body.criados); onImported(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Importação não concluída."); }
    finally { setBusy(false); }
  }

  function issues(title: string, data: RegistrationIssue[], kind: string) {
    return data.length > 0 && <details className={`registration-import-issues registration-import-issues--${kind}`} open={kind === "error"}>
      <summary>{title} ({data.length})</summary>
      {data.map((item, index) => <p key={index}><strong>{item.aba}, linha {item.linha || "—"}, {item.campo}</strong>{item.codigo ? `, código ${item.codigo}` : ""}: {item.motivo}</p>)}
    </details>;
  }

  function section(title: string, rows: RegistrationRow[], counts: RegistrationPreview["resumo"]["clientes"]) {
    return <section className="registration-import-section">
      <h3>{title}</h3>
      <p className="registration-import-subsummary">{counts.novos} novos · {counts.atualizacoes} atualizações · {counts.semAlteracao} sem alteração · {counts.avisos} avisos · {counts.erros} erros</p>
      <div className="registration-import-table-wrap"><table className="data-table registration-import-table">
        <thead><tr><th>Linha</th><th>Código</th><th>Nome / Razão Social</th><th>Tipo</th><th>Documento</th><th>Categoria N1</th><th>Conta N2</th><th>Ação / alterações</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.linha}>
          <td>{row.linha}</td><td>{row.codigo || "Gerado na confirmação"}</td><td>{row.nome || "—"}</td><td>{row.tipoPessoa || "—"}</td><td>{row.documento || "—"}</td>
          <td>{row.codigoCategoria || "—"}</td><td>{row.codigoConta || "—"}</td>
          <td><span className={`registration-import-state registration-import-state--${row.acao || "erro"}`}>{actionName[row.acao || "erro"]}</span>
            {row.detalhes?.map((detail, index) => <div className="registration-import-detail" key={index}>{detail}</div>)}
            {row.avisos?.map((warning, index) => <div className="registration-import-warning" key={index}>Aviso: {warning}</div>)}
            {row.sugestoes?.map((suggestion, index) => <div className="registration-import-suggestion" key={index}>Sugestão: {suggestion}</div>)}
          </td>
        </tr>)}</tbody>
      </table></div>
    </section>;
  }

  return <div className="modal-overlay open registration-import-overlay" onClick={() => { if (!busy) onClose(); }}>
    <div className="modal-content registration-import-modal" role="dialog" aria-modal="true" aria-labelledby="registration-import-title" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h2 id="registration-import-title">Importar Cadastros</h2><button type="button" className="modal-close" aria-label="Fechar" disabled={busy} onClick={onClose}>✕</button></div>
      <div className="registration-import-body">
        <ol className="registration-import-steps">
          <li><button type="button" className="btn btn-secondary" onClick={() => void download()} disabled={busy || downloading}>{downloading ? "Baixando..." : "Baixar Cadastros"}</button><p>Baixe Clientes e Fornecedores ativos para editar ou incluir registros. Sem dados, o mesmo arquivo virá vazio.</p></li>
          <li>Edite ou preencha as abas CLIENTES e FORNECEDORES. Mantenha os códigos como texto.</li>
          <li><label className="registration-import-file">Selecione o arquivo .xlsx <input type="file" accept=".xlsx" onClick={event => { event.currentTarget.value = ""; setFile(null); setPreview(null); setResult(null); setCreated(null); setError(""); }} onChange={event => void selectFile(event.target.files?.[0] || null)} disabled={busy} /></label></li>
          <li>Confira a prévia, os avisos e os erros.</li>
          <li>Confirme a importação conjunta das duas abas.</li>
        </ol>
        {busy && <p role="status">{preview ? "Confirmando e revalidando..." : "Lendo e validando..."}</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {result && <div className="registration-import-success" role="status">Importação concluída: {result.totalNovo} novos, {result.totalAtualizado} atualizados e {result.totalSemAlteracao} sem alteração. Nenhum cadastro foi excluído.</div>}
        {created && (created.clientes.length > 0 || created.fornecedores.length > 0) && <div className="registration-import-created" role="status">
          <strong>Códigos gerados</strong>
          {created.clientes.map(item => <p key={`C-${item.linha}`}>Cliente, linha {item.linha}: {item.codigo} — {item.nome}</p>)}
          {created.fornecedores.map(item => <p key={`F-${item.linha}`}>Fornecedor, linha {item.linha}: {item.codigo} — {item.nome}</p>)}
        </div>}
        {preview && <>
          <div className="registration-import-summary"><div><strong>Total lido</strong><span>{preview.resumo.totalLido}</span></div><div><strong>Novos</strong><span>{preview.resumo.totalNovo}</span></div><div><strong>Atualizações</strong><span>{preview.resumo.totalAtualizado}</span></div><div><strong>Sem alteração</strong><span>{preview.resumo.totalSemAlteracao}</span></div><div><strong>Erros</strong><span>{preview.resumo.totalErros}</span></div></div>
          <p className="registration-import-subsummary">{preview.resumo.ausentes.clientes} Clientes e {preview.resumo.ausentes.fornecedores} Fornecedores ativos ausentes da planilha permanecerão inalterados.</p>
          {section("Clientes", preview.clientes, preview.resumo.clientes)}
          {section("Fornecedores", preview.fornecedores, preview.resumo.fornecedores)}
          {issues("Erros bloqueantes", preview.errors, "error")}
          {issues("Avisos para revisar", preview.warnings, "warning")}
          {issues("Sugestões", preview.suggestions, "suggestion")}
        </>}
      </div>
      <div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Fechar</button><button type="button" className="btn btn-primary" disabled={!preview || !!preview.errors.length || !preview.resumo.totalLido || !!result || busy} onClick={() => void confirm()}>Confirmar importação</button></div>
    </div>
  </div>;
}
