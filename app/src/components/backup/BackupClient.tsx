"use client";
import { useState } from "react";
import { messagePtBr } from "@/lib/presentation";

const sectionLabels: Record<string,string> = { areas_negocio:"Áreas de negócio",centros_custo:"Centros de custo",categorias:"Categorias",plano_contas:"Contas",fornecedores:"Fornecedores",clientes:"Clientes",dre:"DRE",dados_bancarios:"Dados bancários",empresas:"Empresas",pessoas:"Pessoas",produto_grupos:"Grupos de produtos",produto_tipos:"Tipos de produtos",produto_linhas:"Linhas de produtos",produtos:"Produtos",produto_sequencias:"Sequências de produtos",tarefa_status:"Situações de tarefas",tarefas:"Tarefas",status_manual_tipos:"Situações manuais",layouts_colunas:"Disposição de colunas",lancamentos:"Lançamentos" };

type Preview = { checksum: string; currentDigest: string; tenant: string; counts: { table: string; before: number; after: number }[]; preserved: string };
export default function BackupClient({ tenantId, tenantName, canCreate, canRestore }: { tenantId: string; tenantName: string; canCreate: boolean; canRestore: boolean }) {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState<string | null>(null), [unknown, setUnknown] = useState(false);
  async function download() {
    setBusy(true); setMessage("");
    try { const r = await fetch("/api/backups"); if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = url;
      a.download = `10s-tenant-${tenantId}-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup gerado. Guarde o arquivo em local privado e protegido.");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function submit(restore: boolean) {
    if (!file) return;
    setBusy(true); setMessage("");
    const id = restore ? crypto.randomUUID() : null;
    if (id) { setAttempt(id); sessionStorage.setItem(`10s-restore-${tenantId}`, id); }
    try {
      const r = await fetch(`/api/backups?action=${restore ? "restore" : "preview"}`, { method: "POST", body: file,
        headers: { "Content-Type": "application/json", ...(restore ? { "x-backup-confirm": tenantId, "x-backup-preview": preview!.currentDigest, "x-backup-attempt": id! } : {}) } });
      const result = await r.json();
      if (!r.ok) { throw Object.assign(new Error(result.error), { confirmedRejection: r.status < 500 }); }
      if (restore) { setPreview(null); setConfirmed(false); setMessage("Restauração concluída. Recarregue as telas empresariais antes de editar."); sessionStorage.removeItem(`10s-restore-${tenantId}`); }
      else { setPreview(result.preview); setConfirmed(false); }
    } catch (e) { if (restore) setUnknown(!(e as { confirmedRejection?: boolean }).confirmedRejection); setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  async function checkReceipt() {
    const id = attempt ?? sessionStorage.getItem(`10s-restore-${tenantId}`); if (!id) { setMessage("Nenhuma tentativa registrada nesta aba."); return; }
    setBusy(true);
    try { const r = await fetch(`/api/backups?attempt=${id}`); const data = await r.json(); if (!r.ok) throw Error(data.error);
      if (data.receipt) { setUnknown(false); setPreview(null); setMessage("Recibo confirmado: restauração concluída."); sessionStorage.removeItem(`10s-restore-${tenantId}`); }
      else setMessage("Recibo ainda não encontrado. Resultado não confirmado; não repita o restore sem conferir a operação.");
    } catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="backup-page">
    <h1>Backup e Restauração</h1><p>Administração do Sistema · Empresa selecionada: <strong>{tenantName}</strong></p>
    <section><h2>Gerar backup</h2><p>Cadastros, lançamentos e configurações empresariais. Credenciais e acessos globais ficam preservados.</p>
      <button disabled={busy || !canCreate} onClick={download}>Baixar backup</button></section>
    {canRestore && <section><h2>Restaurar nesta empresa</h2><p>Substitui os dados empresariais pelo estado do arquivo. Uma cópia de segurança é criada antes da operação. Apenas backups desta mesma empresa, até 8 MB.</p>
      <label>Arquivo de backup <input aria-label="Arquivo de backup" type="file" accept=".json,application/json" disabled={busy || unknown} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setConfirmed(false); }} /></label>
      <button disabled={busy || unknown || !file || file.size > 8 * 1024 * 1024} onClick={() => submit(false)}>Validar e ver prévia</button>
      {preview && <div><p>{messagePtBr(preview.preserved)}</p><p>Verificação de integridade: <code>{preview.checksum}</code></p>
        <div className="backup-table"><table><thead><tr><th>Conjunto</th><th>Atual</th><th>Após restaurar</th></tr></thead><tbody>{preview.counts.map(c => <tr key={c.table}><td>{sectionLabels[c.table] ?? "Dados da empresa"}</td><td>{c.before}</td><td>{c.after}</td></tr>)}</tbody></table></div>
        <label><input type="checkbox" checked={confirmed} disabled={busy || unknown} onChange={e => setConfirmed(e.target.checked)} /> Confirmo substituir os dados de {tenantName} pelo backup validado.</label>
        <button disabled={busy || unknown || !confirmed} onClick={() => submit(true)}>Restaurar empresa</button></div>}
      <button disabled={busy} onClick={checkReceipt}>Conferir recibo da última tentativa</button>
    </section>}
    <p role="status" aria-live="polite">{busy ? "Processando…" : messagePtBr(message)}</p>
    <style jsx>{`
      .backup-page {flex:1;min-height:0;min-width:0;width:100%;max-width:1100px;overflow-y:auto;overscroll-behavior-y:contain;scrollbar-gutter:stable;padding:24px;color:var(--text-primary);}
      h1 {font-size:24px;} h2 {font-size:18px;} p {margin:12px 0;line-height:1.6;}
      section {margin:20px 0;padding:20px;border:1px solid var(--border);border-radius:10px;background:var(--surface);}
      button {padding:10px 16px;margin:12px 12px 12px 0;border:1px solid var(--action);border-radius:6px;color:var(--text-primary);background:var(--surface-elevated);cursor:pointer;}
      button:disabled {opacity:.45;cursor:not-allowed;} button:focus-visible,input:focus-visible {outline:2px solid var(--backup-focus);outline-offset:3px;}
      label {display:block;margin:14px 0;} input[type=file] {display:block;max-width:100%;margin-top:10px;}
      code {overflow-wrap:anywhere;} .backup-table {overflow:auto;max-height:340px;} table {width:100%;border-collapse:collapse;} th,td {padding:6px;text-align:left;border-bottom:1px solid var(--border);}
      @media(max-width:600px){.backup-page{padding:12px}section{padding:12px}button{width:100%;margin-right:0}}
    `}</style>
  </div>;
}
