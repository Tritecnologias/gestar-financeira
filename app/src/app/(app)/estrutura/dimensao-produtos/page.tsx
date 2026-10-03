"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./dimensao-produtos.css";

type Group = "PRODUTO" | "SERVICO";
type ProductType = { id: string; grupo: Group; codigo: string; nome: string; ativo: boolean };
type ProductLine = { id: string; tipoId: string; codigo: string; nome: string; ativo: boolean };
type Product = { id: string; codigo: string; nome: string; tipo: Group | null; tipoId: string | null; linhaId: string | null; descricao: string | null; observacoes: string | null; unidade: string | null; precoVenda: string | null; precoCusto: string | null; categoria: string | null; ativo: boolean };
type Draft = { nome: string; grupo: string; tipoId: string; linhaId: string; descricao: string; observacoes: string; unidade: string; precoVenda: string; precoCusto: string; ativo: boolean };
type ConfigDraft = { codigo: string; nome: string; grupo: string; tipoId: string };

const emptyDraft: Draft = { nome: "", grupo: "", tipoId: "", linhaId: "", descricao: "", observacoes: "", unidade: "", precoVenda: "", precoCusto: "", ativo: true };
const emptyConfig: ConfigDraft = { codigo: "", nome: "", grupo: "", tipoId: "" };
const price = (value: string | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function request(url: string, method: "POST" | "PUT" | "DELETE", body?: object) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
  return data;
}

export default function DimensaoProdutosPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ativo");
  const [itemModal, setItemModal] = useState<Product | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<"tipo" | "linha">("tipo");
  const [configId, setConfigId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(emptyConfig);
  const firstInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([fetch("/api/produtos", { cache: "no-store" }), fetch("/api/produto-tipos", { cache: "no-store" }), fetch("/api/produto-linhas", { cache: "no-store" })]);
      const failed = responses.find(response => !response.ok);
      if (failed) {
        const payload = await failed.json().catch(() => null);
        throw new Error(payload?.error || `Não foi possível carregar ${failed.url.split("/").pop()} (HTTP ${failed.status}).`);
      }
      const [products, productTypes, productLines] = await Promise.all(responses.map(response => response.json()));
      if (!Array.isArray(products) || !Array.isArray(productTypes) || !Array.isArray(productLines)) throw new Error("Resposta inesperada do catálogo.");
      setItems(products); setTypes(productTypes); setLines(productLines);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar o catálogo."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (itemModal || configOpen) firstInput.current?.focus(); }, [itemModal, configOpen, configTab]);

  const activeTypes = types.filter(type => type.ativo && (!draft.grupo || type.grupo === draft.grupo));
  const activeLines = lines.filter(line => line.ativo && line.tipoId === draft.tipoId);
  const filterTypes = types.filter(type => type.ativo && (!groupFilter || type.grupo === groupFilter));
  const filterLines = lines.filter(line => line.ativo && (!typeFilter || line.tipoId === typeFilter) && (!groupFilter || types.find(type => type.id === line.tipoId)?.grupo === groupFilter));
  const filtered = items.filter(item => {
    if (search && !`${item.codigo} ${item.nome}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))) return false;
    if (groupFilter && item.tipo !== groupFilter) return false;
    if (typeFilter && item.tipoId !== typeFilter) return false;
    if (lineFilter && item.linhaId !== lineFilter) return false;
    if (statusFilter === "ativo" && !item.ativo) return false;
    if (statusFilter === "inativo" && item.ativo) return false;
    return true;
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));

  const openItem = (item?: Product) => {
    setItemModal(item ?? "new"); setModalError("");
    setDraft(item ? { nome: item.nome, grupo: item.tipo ?? "", tipoId: item.tipoId ?? "", linhaId: item.linhaId ?? "", descricao: item.descricao ?? "", observacoes: item.observacoes ?? "", unidade: item.unidade ?? "", precoVenda: item.precoVenda ?? "", precoCusto: item.precoCusto ?? "", ativo: item.ativo } : { ...emptyDraft });
  };
  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!itemModal) return;
    if (itemModal === "new" && (!draft.grupo || !draft.tipoId)) { setModalError("Selecione Grupo e Tipo."); return; }
    setSaving(true); setModalError("");
    try {
      const legacy = itemModal !== "new" && !itemModal.tipoId && !draft.tipoId;
      const body = { ...draft, grupo: legacy && !draft.grupo ? undefined : draft.grupo, tipoId: legacy ? undefined : draft.tipoId || null, linhaId: draft.linhaId || null };
      await request(itemModal === "new" ? "/api/produtos" : `/api/produtos/${itemModal.id}`, itemModal === "new" ? "POST" : "PUT", body);
      setItemModal(null); await load();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao salvar Item."); }
    finally { setSaving(false); }
  };
  const deactivateItem = async (item: Product) => {
    if (!confirm(`Desativar ${item.codigo} — ${item.nome}?`)) return;
    setSaving(true); setError("");
    try { await request(`/api/produtos/${item.id}`, "DELETE"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao desativar Item."); }
    finally { setSaving(false); }
  };

  const openConfig = (tab: "tipo" | "linha") => { setConfigOpen(true); setConfigTab(tab); setConfigId(null); setConfigDraft({ ...emptyConfig }); setModalError(""); };
  const saveConfig = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setModalError("");
    try {
      const root = configTab === "tipo" ? "/api/produto-tipos" : "/api/produto-linhas";
      await request(configId ? `${root}/${configId}` : root, configId ? "PUT" : "POST", configTab === "tipo" ? { codigo: configDraft.codigo, nome: configDraft.nome, grupo: configDraft.grupo } : { codigo: configDraft.codigo, nome: configDraft.nome, tipoId: configDraft.tipoId });
      setConfigId(null); setConfigDraft({ ...emptyConfig }); await load();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao salvar classificação."); }
    finally { setSaving(false); }
  };
  const deactivateConfig = async (id: string) => {
    if (!confirm(`Desativar ${configTab === "tipo" ? "Tipo" : "Linha"}?`)) return;
    setSaving(true); setModalError("");
    try { await request(`${configTab === "tipo" ? "/api/produto-tipos" : "/api/produto-linhas"}/${id}`, "DELETE"); await load(); }
    catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao desativar classificação."); }
    finally { setSaving(false); }
  };

  return <div className="product-page">
    <header className="topbar"><div><h1 className="page-title">Dimensão de Produtos/Serviços</h1><p className="page-sub">Estrutura Empresa — Catálogo de produtos e serviços</p></div></header>
    <div className="product-content">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="product-toolbar">
        <label className="product-search">Busca<input className="filter-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Código ou nome" /></label>
        <label>Grupo<select className="filter-input" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setTypeFilter(""); setLineFilter(""); }}><option value="">Todos</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></label>
        <label>Tipo<select className="filter-input" value={typeFilter} disabled={!groupFilter} onChange={event => { setTypeFilter(event.target.value); setLineFilter(""); }}><option value="">Todos</option>{filterTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label>
        <label>Linha<select className="filter-input" value={lineFilter} disabled={!typeFilter} onChange={event => setLineFilter(event.target.value)}><option value="">Todas</option>{filterLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label>
        <label>Status<select className="filter-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Todos</option></select></label>
        <span className="product-count" role="status">{loading ? "Carregando…" : `${filtered.length} de ${items.length} itens exibidos`}</span>
        <div className="product-toolbar-actions"><button className="btn btn-secondary" onClick={() => openConfig("tipo")}>Tipos e Linhas</button><button className="btn btn-primary" onClick={() => openItem()}>+ Novo Item</button></div>
      </div>
      <div className="product-table-scroll"><table className="data-table product-table"><thead><tr><th>Código</th><th>Nome</th><th>Grupo</th><th>Tipo / Linha</th><th>Venda ref.</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {!loading && filtered.length === 0 && <tr><td colSpan={7} className="product-empty">Nenhum Item encontrado. Cadastre primeiro um Tipo para criar um Item.</td></tr>}
        {filtered.map(item => <tr key={item.id}><td className="product-code">{item.codigo}</td><td>{item.nome}</td><td>{item.tipo === "SERVICO" ? "Serviço" : item.tipo === "PRODUTO" ? "Produto" : "Legado"}</td><td>{item.tipoId ? <>{types.find(type => type.id === item.tipoId)?.nome ?? "Tipo indisponível"}{item.linhaId ? ` / ${lines.find(line => line.id === item.linhaId)?.nome ?? "Linha indisponível"}` : ""}</> : <span className="product-muted">Sem classificação (legado)</span>}</td><td>{price(item.precoVenda)}</td><td>{item.ativo ? "Ativo" : "Inativo"}</td><td className="product-actions"><button className="action-btn" aria-label={`Editar ${item.codigo}`} onClick={() => openItem(item)}>✏️</button>{item.ativo && <button className="action-btn" aria-label={`Desativar ${item.codigo}`} disabled={saving} onClick={() => void deactivateItem(item)}>🗑️</button>}</td></tr>)}
      </tbody></table></div>
    </div>

    {itemModal && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setItemModal(null); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-header"><h2 id="product-modal-title">{itemModal === "new" ? "Novo Item" : `Editar ${itemModal.codigo}`}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setItemModal(null)}>×</button></div><form className="product-modal-form" onSubmit={event => void saveItem(event)} onKeyDown={event => { if (event.key === "Escape") setItemModal(null); }}><div className="product-modal-body">
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      <section><h3>Identificação</h3><div className="product-fields"><label>Código<input readOnly value={itemModal === "new" ? "Automático ao salvar" : itemModal.codigo} /></label><label>Nome *<input ref={firstInput} required value={draft.nome} onChange={event => setDraft(value => ({ ...value, nome: event.target.value }))} /></label><label className="product-wide">Descrição<textarea rows={2} value={draft.descricao} onChange={event => setDraft(value => ({ ...value, descricao: event.target.value }))} /></label><label>Status<select value={draft.ativo ? "ativo" : "inativo"} onChange={event => setDraft(value => ({ ...value, ativo: event.target.value === "ativo" }))} disabled={itemModal === "new"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label></div></section>
      <section><h3>Classificação</h3><div className="product-fields"><label>Grupo *<select required={itemModal === "new"} value={draft.grupo} onChange={event => setDraft(value => ({ ...value, grupo: event.target.value, tipoId: "", linhaId: "" }))}><option value="">Selecione</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></label><label>Tipo *<select required={itemModal === "new" || !!draft.tipoId} disabled={!draft.grupo} value={draft.tipoId} onChange={event => setDraft(value => ({ ...value, tipoId: event.target.value, linhaId: "" }))}><option value="">{itemModal !== "new" && !draft.tipoId ? "Sem classificação (legado)" : "Selecione"}</option>{activeTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label><label>Linha<select value={draft.linhaId} disabled={!draft.tipoId} onChange={event => setDraft(value => ({ ...value, linhaId: event.target.value }))}><option value="">Sem Linha</option>{activeLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label></div></section>
      <section><h3>Valores de referência</h3><div className="product-fields"><label>Unidade<input value={draft.unidade} onChange={event => setDraft(value => ({ ...value, unidade: event.target.value }))} placeholder="UN, KG, HR…" /></label><label>Preço de venda<input type="number" min="0" step="0.01" value={draft.precoVenda} onChange={event => setDraft(value => ({ ...value, precoVenda: event.target.value }))} /></label><label>Preço de custo<input type="number" min="0" step="0.01" value={draft.precoCusto} onChange={event => setDraft(value => ({ ...value, precoCusto: event.target.value }))} /></label></div></section>
      <section><h3>Observações</h3><div className="product-fields"><label className="product-wide">Observações<textarea rows={2} value={draft.observacoes} onChange={event => setDraft(value => ({ ...value, observacoes: event.target.value }))} /></label></div></section>
    </div><div className="product-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setItemModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar Item"}</button></div></form></div></div>}

    {configOpen && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfigOpen(false); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-config-title"><div className="modal-header"><h2 id="product-config-title">Tipos e Linhas</h2><button className="modal-close" aria-label="Fechar" onClick={() => setConfigOpen(false)}>×</button></div><div className="product-config-body" onKeyDown={event => { if (event.key === "Escape") setConfigOpen(false); }}>
      <div className="product-config-tabs"><button className={`btn ${configTab === "tipo" ? "btn-primary" : "btn-secondary"}`} onClick={() => openConfig("tipo")}>Tipos</button><button className={`btn ${configTab === "linha" ? "btn-primary" : "btn-secondary"}`} onClick={() => openConfig("linha")}>Linhas</button></div>
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      <form className="product-config-form" onSubmit={event => void saveConfig(event)}>
        {configTab === "tipo" ? <label>Grupo *<select required disabled={!!configId} value={configDraft.grupo} onChange={event => setConfigDraft(value => ({ ...value, grupo: event.target.value }))}><option value="">Selecione</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></label> : <label>Tipo *<select required disabled={!!configId} value={configDraft.tipoId} onChange={event => setConfigDraft(value => ({ ...value, tipoId: event.target.value }))}><option value="">Selecione</option>{types.filter(type => type.ativo).map(type => <option key={type.id} value={type.id}>{type.grupo} · {type.codigo} — {type.nome}</option>)}</select></label>}
        <label>Código *<input ref={firstInput} required maxLength={30} value={configDraft.codigo} onChange={event => setConfigDraft(value => ({ ...value, codigo: event.target.value }))} /></label>
        <label>Nome *<input required value={configDraft.nome} onChange={event => setConfigDraft(value => ({ ...value, nome: event.target.value }))} /></label>
        <button className="btn btn-primary" disabled={saving}>{configId ? "Salvar" : "+ Adicionar"}</button>{configId && <button type="button" className="btn btn-secondary" onClick={() => { setConfigId(null); setConfigDraft({ ...emptyConfig }); }}>Cancelar edição</button>}
      </form>
      <div className="product-config-list">{(configTab === "tipo" ? types : lines).map(entry => <div key={entry.id} className="product-config-row"><span><strong>{entry.codigo}</strong> — {entry.nome}<small>{configTab === "tipo" ? (entry as ProductType).grupo : types.find(type => type.id === (entry as ProductLine).tipoId)?.nome ?? "Tipo indisponível"}{entry.ativo ? "" : " · Inativo"}</small></span><div><button className="action-btn" aria-label={`Editar ${entry.codigo}`} onClick={() => { setConfigId(entry.id); setConfigDraft({ codigo: entry.codigo, nome: entry.nome, grupo: configTab === "tipo" ? (entry as ProductType).grupo : "", tipoId: configTab === "linha" ? (entry as ProductLine).tipoId : "" }); setModalError(""); }}>✏️</button>{entry.ativo && <button className="action-btn" aria-label={`Desativar ${entry.codigo}`} disabled={saving} onClick={() => void deactivateConfig(entry.id)}>🗑️</button>}</div></div>)}{(configTab === "tipo" ? types : lines).length === 0 && <p className="product-muted">Nenhum cadastro nesta seção.</p>}</div>
    </div><div className="product-modal-footer"><button className="btn btn-secondary" onClick={() => setConfigOpen(false)}>Fechar</button></div></div></div>}
  </div>;
}
