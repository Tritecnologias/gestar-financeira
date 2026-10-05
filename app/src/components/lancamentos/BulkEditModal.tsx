"use client";

import { useState } from "react";

type Category = { id: string; codigo: string; nome: string };
type Account = { id: string; codigo: string | null; descricao: string; categoriaId: string | null };
type Status = { id: string; codigo: string; nome: string };
type Field = "dataPagamento" | "dataVencOriginal" | "dataVencPlano" | "categoria" | "contaId" | "statusManual" | "centroCusto" | "banco";
const LABELS: Record<Field, string> = {
  dataPagamento: "Data de Realização", dataVencOriginal: "Vencimento Original", dataVencPlano: "Vencimento Plano",
  categoria: "Categoria N1", contaId: "Conta N2", statusManual: "Status Manual", centroCusto: "Centro de Custo", banco: "Local Financeiro",
};
const FIELDS = Object.keys(LABELS) as Field[];
type Preview = { count: number; before: Record<string, string | null>; after: Record<string, string | null>; implicitCategory?: string | null };

export default function BulkEditModal({ ids, categories, accounts, statuses, onClose, onApplied }: {
  ids: string[]; categories: Category[]; accounts: Account[]; statuses: Status[];
  onClose: () => void; onApplied: () => void;
}) {
  const [enabled, setEnabled] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<Field, string>>({ dataPagamento: "", dataVencOriginal: "", dataVencPlano: "", categoria: "", contaId: "", statusManual: "", centroCusto: "", banco: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changes = () => Object.fromEntries(enabled.map(key => [key, values[key] || null]));
  const displayValue = (field: Field, value: string | null | undefined) => {
    if (!value) return "—";
    if (value === "múltiplos valores") return value;
    if (field === "contaId") {
      const account = accounts.find(item => item.id === value);
      return account ? `${account.codigo ?? ""} – ${account.descricao}` : "Conta não disponível no cadastro ativo";
    }
    if (field === "categoria") {
      const category = categories.find(item => item.codigo === value);
      return category ? `${category.codigo} – ${category.nome}` : value;
    }
    if (field === "statusManual") return statuses.find(item => item.codigo === value)?.nome ?? value;
    return value;
  };

  const request = async (mode: "preview" | "apply") => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/lancamentos/edicao-em-massa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ids, changes: changes() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível validar os lançamentos.");
      if (mode === "preview") setPreview(result);
      else onApplied();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro de conexão."); setPreview(null); }
    finally { setBusy(false); }
  };

  const update = (field: Field, value: string) => {
    setValues(current => ({ ...current, [field]: value, ...(field === "categoria" ? { contaId: "" } : {}) }));
    setPreview(null);
  };
  const toggle = (field: Field) => {
    setEnabled(current => current.includes(field) ? current.filter(item => item !== field) : [...current, field]);
    setPreview(null);
  };

  return <div className="lanc-bulk-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="lanc-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="lanc-bulk-title" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }}>
      <header><div><h2 id="lanc-bulk-title">Editar em massa</h2><p>{ids.length} lançamento(s) selecionado(s). Marque apenas os campos que deseja substituir.</p></div><button type="button" className="btn btn-outline" onClick={onClose} disabled={busy} aria-label="Fechar">✕</button></header>
      <div className="lanc-bulk-content">
        <div className="lanc-bulk-fields">
          {FIELDS.map(field => <label className="lanc-bulk-field" key={field}>
            <span><input type="checkbox" checked={enabled.includes(field)} onChange={() => toggle(field)} /> {LABELS[field]}</span>
            {field === "categoria" ? <select disabled={!enabled.includes(field)} value={values[field]} onChange={event => update(field, event.target.value)}><option value="">— Limpar / sem categoria —</option>{categories.map(item => <option key={item.id} value={item.codigo}>{item.codigo} – {item.nome}</option>)}</select>
            : field === "contaId" ? <select disabled={!enabled.includes(field)} value={values[field]} onChange={event => {
              const account = accounts.find(item => item.id === event.target.value);
              const category = categories.find(item => item.id === account?.categoriaId);
              setValues(current => ({ ...current, contaId: event.target.value, ...(category ? { categoria: category.codigo } : {}) }));
              setPreview(null);
            }}><option value="">— Limpar / sem conta —</option>{accounts.filter(item => !enabled.includes("categoria") || !values.categoria || item.categoriaId === categories.find(category => category.codigo === values.categoria)?.id).map(item => <option key={item.id} value={item.id}>{item.codigo} – {item.descricao}</option>)}</select>
            : field === "statusManual" ? <select disabled={!enabled.includes(field)} value={values[field]} onChange={event => update(field, event.target.value)}><option value="">— Limpar status —</option>{statuses.map(item => <option key={item.id} value={item.codigo}>{item.nome}</option>)}</select>
            : <input disabled={!enabled.includes(field)} type={field.startsWith("data") ? "date" : "text"} value={values[field]} onChange={event => update(field, event.target.value)} placeholder="Vazio para limpar" />}
          </label>)}
        </div>
        {preview && <div className="lanc-bulk-preview" role="status"><strong>Prévia — {preview.count} lançamento(s)</strong>
          {enabled.map(field => <p key={field}><b>{LABELS[field]}:</b> antes: {displayValue(field, preview.before[field])} → depois: {displayValue(field, preview.after[field])}</p>)}
          {preview.implicitCategory && <p><b>Categoria N1 vinculada:</b> {displayValue("categoria", preview.implicitCategory)} será preenchida pela Conta N2.</p>}
          {enabled.includes("dataPagamento") && <p className="lanc-bulk-warning">Alterar a Data de Realização pode mudar status financeiro, caixa realizado, cards, Relatórios e Análises.</p>}
          <p>Todos os registros serão validados novamente antes da gravação. Se um falhar, nenhum será alterado.</p>
        </div>}
        {error && <p className="lanc-bulk-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
        {!preview ? <button type="button" className="btn btn-primary" disabled={busy || !enabled.length} onClick={() => void request("preview")}>{busy ? "Validando…" : "Conferir prévia"}</button>
          : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void request("apply")}>{busy ? "Gravando…" : "Confirmar edição"}</button>}</footer>
    </section>
  </div>;
}
