"use client";
import { useEffect, useRef, useState, type Ref } from "react";
import type { StatusManualTipoDTO } from "@/types";
import { counterpartyDisplay, counterpartyIds, defaultAccount, type CounterpartyOption } from "@/lib/counterparty";
import CounterpartyPicker from "./CounterpartyPicker";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useCan } from "@/components/access/PermissionContext";
import "./novo-lancamento.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  counterparties: CounterpartyOption[];
  statusTipos: StatusManualTipoDTO[];
}

const emptyForm = () => ({
  dataLanc: new Date().toISOString().split("T")[0],
  descricao: "", valor: "", valorPrevisto: "",
  tipo: "SAIDA" as "ENTRADA" | "SAIDA",
  status: "realizado", statusManual: "",
  dataEmissao: "", dataVencOriginal: "", dataVencPlano: "", dataEvento: "", dataPagamento: "",
  banco: "", fornecedor: "", fornecedorId: "", clienteId: "", contaId: "", fantasiaPadrao: "",
  centroCusto: "", categoria: "", dre: "", cont: "", anotacao: "", statusExtrato: "", referencia: "",
});
type LancamentoForm = ReturnType<typeof emptyForm>;
type Defaults = Pick<LancamentoForm, "dataLanc" | "tipo" | "status" | "statusManual" |
  "categoria" | "contaId" | "dataPagamento">;
type Row = { key: number; data: LancamentoForm };
type Category = { id: string; codigo: string; nome: string; ativo: boolean };
type Account = { id: string; codigo: string | null; descricao: string; categoriaId: string | null; ativo: boolean };

const initialDefaults = (): Defaults => {
  const form = emptyForm();
  return { dataLanc: form.dataLanc, tipo: form.tipo, status: form.status, statusManual: "",
    categoria: "", contaId: "", dataPagamento: "" };
};
const newRow = (key: number, defaults: Defaults): Row => ({ key, data: { ...emptyForm(), ...defaults } });

function Field({ id, label, value, onChange, type = "text", required, inputMode, placeholder, inputRef }:
  { id: string; label: string; value: string; onChange: (value: string) => void; type?: string;
    required?: boolean; inputMode?: "decimal"; placeholder?: string; inputRef?: Ref<HTMLInputElement> }) {
  return <label className="lanc-new-field" htmlFor={id}>
    <span>{label}{required ? " *" : ""}</span>
    <input ref={inputRef} id={id} type={type} value={value} onChange={event => onChange(event.target.value)}
      required={required} inputMode={inputMode} placeholder={placeholder} />
  </label>;
}

export default function NovoLancamentoModal({ open, onClose, onCreated, counterparties, statusTipos }: Props) {
  const can = useCan();
  const [defaults, setDefaults] = useState(initialDefaults);
  const [rows, setRows] = useState<Row[]>(() => [newRow(1, initialDefaults())]);
  const [saving, setSaving] = useState(false);
  const [showDefaults, setShowDefaults] = useState(true);
  const [error, setError] = useState("");
  const [errorRow, setErrorRow] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const nextKey = useRef(2);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const initial = initialDefaults();
    setDefaults(initial);
    setRows([newRow(1, initial)]);
    nextKey.current = 2;
    setError("");
    setErrorRow(null);
    setShowDefaults(!window.matchMedia("(max-width: 900px), (max-height: 500px)").matches);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => firstField.current?.focus());
    const reload = () => { void Promise.all([fetch("/api/categorias", { cache: "no-store" }), fetch("/api/plano-contas", { cache: "no-store" })])
      .then(async ([categoriesResponse, accountsResponse]) => {
        if (!categoriesResponse.ok || !accountsResponse.ok) throw new Error("Classificação financeira indisponível.");
        setCategories(await categoriesResponse.json());
        setAccounts(await accountsResponse.json());
      }).catch(() => {}); };
    reload();
    window.addEventListener("focus", reload);
    return () => { cancelAnimationFrame(focusFrame); document.body.style.overflow = previousOverflow;
      window.removeEventListener("focus", reload); };
  }, [open]);

  const updateRow = (key: number, changes: Partial<LancamentoForm>) => {
    setError("");
    setErrorRow(null);
    setRows(current => current.map(row => row.key === key ? { ...row, data: { ...row.data, ...changes } } : row));
  };
  const updateDefault = (changes: Partial<Defaults>) => setDefaults(current => ({ ...current, ...changes }));
  const categoryForAccount = (accountId: string) => {
    const account = accounts.find(item => item.id === accountId);
    return categories.find(item => item.id === account?.categoriaId)?.codigo || "";
  };
  const accountOptions = (categoryCode: string) => accounts.filter(account =>
    account.categoriaId === categories.find(category => category.codigo === categoryCode)?.id);
  const chooseCounterparty = (key: number, option: CounterpartyOption | null) => {
    const linkedAccount = defaultAccount(option);
    const ids = counterpartyIds(option);
    updateRow(key, {
      clienteId: ids.clienteId || "", fornecedorId: ids.fornecedorId || "",
      fantasiaPadrao: option ? counterpartyDisplay(option) : "",
      ...(linkedAccount ? { contaId: linkedAccount.contaId, categoria: linkedAccount.categoria } : {}),
    });
  };
  const addRow = () => {
    setError("");
    setErrorRow(null);
    setRows(current => current.length < 100 ? [...current, newRow(nextKey.current++, defaults)] : current);
  };
  const duplicateRow = (row: Row) => {
    setError("");
    setErrorRow(null);
    setRows(current => {
      if (current.length >= 100) return current;
      const index = current.findIndex(item => item.key === row.key);
      const next = [...current];
      next.splice(index + 1, 0, { key: nextKey.current++, data: { ...row.data } });
      return next;
    });
  };
  const removeRow = (key: number) => {
    setError("");
    setErrorRow(null);
    setRows(current => current.length > 1 ? current.filter(row => row.key !== key) : current);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setErrorRow(null);
    for (const [index, row] of rows.entries()) {
      const data = row.data;
      if (!data.dataLanc || !data.descricao.trim() || !data.valor.trim()) {
        setError(`Lançamento ${index + 1}: data, descrição e Valor Realizado são obrigatórios.`);
        setErrorRow(index + 1);
        return;
      }
      if (!Number.isFinite(Number(data.valor.replace(",", "."))) ||
          (data.valorPrevisto && !Number.isFinite(Number(data.valorPrevisto.replace(",", "."))))) {
        setError(`Lançamento ${index + 1}: confira os valores informados.`);
        setErrorRow(index + 1);
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch("/api/lancamentos/lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lancamentos: rows.map(row => ({
          ...row.data,
          valor: Number(row.data.valor.replace(",", ".")),
          valorPrevisto: row.data.valorPrevisto ? Number(row.data.valorPrevisto.replace(",", ".")) : null,
          fornecedorId: row.data.fornecedorId || null,
          clienteId: row.data.clienteId || null,
          contaId: row.data.contaId || null,
        })) }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Nenhum lançamento foi criado.");
        setErrorRow(typeof result.row === "number" ? result.row : null);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Erro de conexão. Nenhum lançamento foi confirmado.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  const plural = rows.length === 1 ? "lançamento" : "lançamentos";
  return <div className="modal-overlay lanc-new-overlay open" onMouseDown={event => {
    if (event.target === event.currentTarget && !saving) onClose();
  }}>
    <div className="modal-content lanc-new-modal" role="dialog" aria-modal="true" aria-labelledby="lanc-new-title"
      onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === "Escape" && !saving) onClose();
      }}>
      <form className="lanc-new-form" onSubmit={handleSubmit} noValidate>
        <header className="modal-header lanc-new-header">
          <div><h2 id="lanc-new-title" className="modal-title">Novo Lançamento</h2>
            <p>{rows.length} {plural} nesta operação</p></div>
          <button className="modal-close" type="button" onClick={onClose} disabled={saving} aria-label="Fechar">✕</button>
        </header>
        <div className="lanc-new-scroll">
          <section className="lanc-new-section" aria-labelledby="lanc-new-defaults-title">
            <div className="lanc-new-section-heading lanc-new-defaults-heading"><div>
              <h3 id="lanc-new-defaults-title">Padrões para novas linhas</h3>
              <p>Copiados ao adicionar. Linhas já exibidas não mudam; cada campo pode ser ajustado individualmente.</p></div>
              <button className="btn btn-outline" type="button" aria-expanded={showDefaults}
                aria-controls="lanc-new-defaults-fields" onClick={() => setShowDefaults(current => !current)}>
                {showDefaults ? "Ocultar padrões" : "Mostrar padrões"}</button></div>
            <div className="lanc-new-default-grid" id="lanc-new-defaults-fields" hidden={!showDefaults}>
              <label className="lanc-new-field"><span>Direção</span><select value={defaults.tipo}
                onChange={event => updateDefault({ tipo: event.target.value as Defaults["tipo"] })}>
                <option value="SAIDA">SAÍDA</option><option value="ENTRADA">ENTRADA</option></select></label>
              <Field id="lanc-default-date" label="Data Lanç." type="date" value={defaults.dataLanc}
                onChange={value => updateDefault({ dataLanc: value })} />
              <label className="lanc-new-field"><span>Status Base</span><select value={defaults.status}
                onChange={event => updateDefault({ status: event.target.value })}>
                <option value="realizado">Realizado</option><option value="previsto">Previsto</option>
                <option value="cancelado">Cancelado</option></select></label>
              <label className="lanc-new-field"><span>Status Manual</span><select value={defaults.statusManual}
                onChange={event => updateDefault({ statusManual: event.target.value })}>
                <option value="">—</option>{statusTipos.map(item => <option key={item.id} value={item.codigo}>{item.nome}</option>)}
              </select></label>
              <div className="lanc-new-field"><span>Categoria N1</span><SearchableSelect label="Categoria N1 padrão" value={defaults.categoria}
                options={categories.map(item => ({ value: item.codigo, label: `${item.codigo} – ${item.nome}` }))}
                createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova categoria", href: "/estrutura/dimensoes-financeiras" }] : []}
                onChange={value => updateDefault({ categoria: value, contaId: "" })} /></div>
              <div className="lanc-new-field"><span>Conta N2</span><SearchableSelect label="Conta N2 padrão" value={defaults.contaId}
                options={accountOptions(defaults.categoria).map(item => ({ value: item.id, label: `${item.codigo} – ${item.descricao}` }))}
                createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova conta", href: "/estrutura/dimensoes-financeiras" }] : []}
                onChange={value => updateDefault({ contaId: value, categoria: categoryForAccount(value) || defaults.categoria })} /></div>
              <Field id="lanc-default-realization" label="Data de Realização" type="date" value={defaults.dataPagamento}
                onChange={value => updateDefault({ dataPagamento: value })} />
            </div>
          </section>

          <section className="lanc-new-section" aria-labelledby="lanc-new-rows-title">
            <div className="lanc-new-section-heading lanc-new-rows-heading"><div>
              <h3 id="lanc-new-rows-title">Lançamentos</h3>
              <p>Valores copiados dos padrões são editáveis em cada lançamento.</p></div>
              <button className="btn btn-outline" type="button" onClick={addRow} disabled={saving || rows.length >= 100}>+ Adicionar lançamento</button>
            </div>
            <div className="lanc-new-rows">
              {rows.map((row, index) => {
                const data = row.data;
                const set = (changes: Partial<LancamentoForm>) => updateRow(row.key, changes);
                const field = (name: keyof LancamentoForm) => (value: string) => set({ [name]: value });
                return <article className={`lanc-new-row ${errorRow === index + 1 ? "lanc-new-row-error" : ""}`}
                  key={row.key} aria-label={`Lançamento ${index + 1}`}>
                  <div className="lanc-new-row-header"><strong>Lançamento {index + 1}</strong>
                    <div><button className="btn btn-outline" type="button" onClick={() => duplicateRow(row)} disabled={saving || rows.length >= 100}>Duplicar</button>
                      <button className="btn btn-outline" type="button" onClick={() => removeRow(row.key)}
                        disabled={saving || rows.length === 1} aria-label={`Remover lançamento ${index + 1}`}>Remover</button></div></div>
                  <div className="lanc-new-row-fields">
                    <div className="lanc-new-group"><h4>Identificação</h4><div className="lanc-new-group-fields lanc-new-identity">
                    <Field id={`lanc-${row.key}-desc`} label="Descrição Objetiva" value={data.descricao}
                      onChange={field("descricao")} required inputRef={index === 0 ? firstField : undefined}
                      placeholder="Descreva este lançamento" />
                    <div className="lanc-new-field"><span>Fantasia / Contraparte</span>
                      <CounterpartyPicker options={counterparties}
                        selected={counterparties.find(option => option.id === (data.clienteId || data.fornecedorId)) || null}
                        onSelect={option => chooseCounterparty(row.key, option)} /></div>
                    </div></div>
                    <div className="lanc-new-group"><h4>Financeiro</h4><div className="lanc-new-group-fields lanc-new-financial">
                    <label className="lanc-new-field"><span>Direção *</span><select value={data.tipo}
                      onChange={event => set({ tipo: event.target.value as LancamentoForm["tipo"] })}>
                      <option value="SAIDA">SAÍDA</option><option value="ENTRADA">ENTRADA</option></select></label>
                    <div className="lanc-new-field"><span>Categoria N1</span><SearchableSelect label={`Categoria N1 do lançamento ${index + 1}`} value={data.categoria}
                      options={categories.map(item => ({ value: item.codigo, label: `${item.codigo} – ${item.nome}` }))}
                      createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova categoria", href: "/estrutura/dimensoes-financeiras" }] : []}
                      onChange={value => set({ categoria: value, contaId: "" })} /></div>
                    <div className="lanc-new-field"><span>Conta N2</span><SearchableSelect label={`Conta N2 do lançamento ${index + 1}`} value={data.contaId}
                      options={accountOptions(data.categoria).map(item => ({ value: item.id, label: `${item.codigo} – ${item.descricao}` }))}
                      createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova conta", href: "/estrutura/dimensoes-financeiras" }] : []}
                      onChange={value => set({ contaId: value, categoria: categoryForAccount(value) || data.categoria })} /></div>
                    <Field id={`lanc-${row.key}-previsto`} label="Valor Previsto" value={data.valorPrevisto}
                      onChange={field("valorPrevisto")} inputMode="decimal" placeholder="0,00" />
                    <Field id={`lanc-${row.key}-valor`} label="Valor Realizado" value={data.valor}
                      onChange={field("valor")} inputMode="decimal" required placeholder="0,00" />
                    </div></div>
                    <div className="lanc-new-group"><h4>Datas</h4><div className="lanc-new-group-fields lanc-new-dates">
                    <Field id={`lanc-${row.key}-data`} label="Data Lanç." type="date" value={data.dataLanc}
                      onChange={field("dataLanc")} required />
                    <Field id={`lanc-${row.key}-emissao`} label="Data Emissão" type="date"
                      value={data.dataEmissao} onChange={field("dataEmissao")} />
                    <Field id={`lanc-${row.key}-venc-original`} label="Venc. Original" type="date"
                      value={data.dataVencOriginal} onChange={field("dataVencOriginal")} />
                    <Field id={`lanc-${row.key}-venc-plano`} label="Venc. Plano" type="date"
                      value={data.dataVencPlano} onChange={field("dataVencPlano")} />
                    <Field id={`lanc-${row.key}-pagamento`} label="Data de Realização" type="date"
                      value={data.dataPagamento} onChange={field("dataPagamento")} />
                    <Field id={`lanc-${row.key}-evento`} label="Data Evento" type="date"
                      value={data.dataEvento} onChange={field("dataEvento")} />
                    </div></div>
                    <div className="lanc-new-group"><h4>Situação</h4><div className="lanc-new-group-fields lanc-new-status">
                    <label className="lanc-new-field"><span>Status Base</span><select value={data.status}
                      onChange={event => set({ status: event.target.value })}>
                      <option value="realizado">Realizado</option><option value="previsto">Previsto</option>
                      <option value="cancelado">Cancelado</option></select></label>
                    <label className="lanc-new-field"><span>Status Manual</span><select value={data.statusManual}
                      onChange={event => set({ statusManual: event.target.value })}>
                      <option value="">—</option>{statusTipos.map(item =>
                        <option key={item.id} value={item.codigo}>{item.nome}</option>)}
                    </select></label>
                    </div></div>
                    <div className="lanc-new-group"><h4>Dimensões complementares</h4><div className="lanc-new-group-fields lanc-new-dimensions">
                    <Field id={`lanc-${row.key}-empresa`} label="Empresa" value={data.fornecedor}
                      onChange={field("fornecedor")} />
                    <Field id={`lanc-${row.key}-banco`} label="Local Financeiro" value={data.banco}
                      onChange={field("banco")} />
                    <Field id={`lanc-${row.key}-cc`} label="Centro de Custo" value={data.centroCusto}
                      onChange={field("centroCusto")} />
                    <Field id={`lanc-${row.key}-dre`} label="DRE" value={data.dre} onChange={field("dre")} />
                    </div></div>
                    <div className="lanc-new-group"><h4>Conferência e observações</h4><div className="lanc-new-group-fields lanc-new-complements">
                    <Field id={`lanc-${row.key}-extrato`} label="Extrato" value={data.statusExtrato}
                      onChange={field("statusExtrato")} />
                    <Field id={`lanc-${row.key}-ref`} label="Referência" value={data.referencia}
                      onChange={field("referencia")} />
                    <Field id={`lanc-${row.key}-cont`} label="Cont." value={data.cont} onChange={field("cont")} />
                    <Field id={`lanc-${row.key}-anotacao`} label="Anotação" value={data.anotacao}
                      onChange={field("anotacao")} />
                    </div></div>
                  </div>
                </article>;
              })}
            </div>
          </section>
        </div>
        <footer className="lanc-new-footer">
          <span className={error ? "lanc-new-error" : ""} role={error ? "alert" : undefined}>
            {error || (rows.length === 1 ? "O lançamento será validado e gravado." : `${rows.length} lançamentos serão validados e gravados juntos.`)}
          </span>
          <div><button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Criando…" : `Criar ${rows.length} ${plural}`}</button></div>
        </footer>
      </form>
    </div>
  </div>;
}
