"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ProductImportModal from "@/components/estrutura/ProductImportModal";
import "./dimensao-produtos.css";

type ProductGroup = { id: string; codigo: string; nome: string; ativo: boolean };
type ProductType = { id: string; grupoId: string | null; grupo: string | null; codigo: string; nome: string; ativo: boolean };
type ProductLine = { id: string; tipoId: string; codigo: string; nome: string; ativo: boolean };
type Product = { id: string; codigo: string; nome: string; tipo: string | null; grupoId: string | null; tipoId: string | null; linhaId: string | null; descricao: string | null; observacoes: string | null; unidade: string | null; precoVenda: string | null; precoCusto: string | null; categoria: string | null; ativo: boolean };
type Draft = { nome: string; grupoId: string; tipoId: string; linhaId: string; descricao: string; observacoes: string; unidade: string; precoVenda: string; precoCusto: string; ativo: boolean };
type ConfigDraft = { codigo: string; nome: string; grupoId: string; tipoId: string };

const emptyDraft: Draft = { nome: "", grupoId: "", tipoId: "", linhaId: "", descricao: "", observacoes: "", unidade: "", precoVenda: "", precoCusto: "", ativo: true };
const emptyConfig: ConfigDraft = { codigo: "", nome: "", grupoId: "", tipoId: "" };
const price = (value: string | null) => value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function request(url: string, method: "POST" | "PUT" | "DELETE", body?: object) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
  return data;
}

export default function DimensaoProdutosPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
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
  const [importOpen, setImportOpen] = useState(false);
  const [configTab, setConfigTab] = useState<"grupo" | "tipo" | "linha">("tipo");
  const [configId, setConfigId] = useState<string | null>(null);
  const [configSearch, setConfigSearch] = useState("");
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(emptyConfig);
  const [viewMode, setViewMode] = useState<"arvore" | "tabela">("arvore");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const firstInput = useRef<HTMLInputElement>(null);
  const treeInitialized = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([fetch("/api/produtos", { cache: "no-store" }), fetch("/api/produto-grupos", { cache: "no-store" }), fetch("/api/produto-tipos", { cache: "no-store" }), fetch("/api/produto-linhas", { cache: "no-store" })]);
      const failed = responses.find(response => !response.ok);
      if (failed) {
        const payload = await failed.json().catch(() => null);
        throw new Error(payload?.error || `Não foi possível carregar ${failed.url.split("/").pop()} (HTTP ${failed.status}).`);
      }
      const [products, productGroups, productTypes, productLines] = await Promise.all(responses.map(response => response.json()));
      if (![products, productGroups, productTypes, productLines].every(Array.isArray)) throw new Error("Resposta inesperada do catálogo.");
      setItems(products); setGroups(productGroups); setTypes(productTypes); setLines(productLines);
      if (!treeInitialized.current) {
        setExpandedGroups(new Set(productGroups.filter((group: ProductGroup) => group.ativo).map((group: ProductGroup) => group.id)));
        setExpandedTypes(new Set(productTypes.filter((type: ProductType) => type.ativo && type.grupoId).map((type: ProductType) => type.id)));
        setExpandedLines(new Set(productLines.filter((line: ProductLine) => line.ativo).map((line: ProductLine) => line.id)));
        treeInitialized.current = true;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar o catálogo."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (itemModal || configOpen) firstInput.current?.focus(); }, [itemModal, configOpen, configTab]);

  const activeGroups = groups.filter(group => group.ativo);
  const activeTypes = types.filter(type => type.ativo && type.grupoId === draft.grupoId);
  const activeLines = lines.filter(line => line.ativo && line.tipoId === draft.tipoId);
  const filterTypes = types.filter(type => type.ativo && type.grupoId === groupFilter);
  const filterLines = lines.filter(line => line.ativo && line.tipoId === typeFilter);
  const filtered = items.filter(item => {
    const group = groups.find(entry => entry.id === item.grupoId), type = types.find(entry => entry.id === item.tipoId), line = lines.find(entry => entry.id === item.linhaId);
    if (search && !`${item.codigo} ${item.nome} ${group?.codigo || ""} ${group?.nome || ""} ${type?.codigo || ""} ${type?.nome || ""} ${line?.codigo || ""} ${line?.nome || ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))) return false;
    if (groupFilter && item.grupoId !== groupFilter) return false;
    if (typeFilter && item.tipoId !== typeFilter) return false;
    if (lineFilter && item.linhaId !== lineFilter) return false;
    if (statusFilter === "ativo" && !item.ativo) return false;
    if (statusFilter === "inativo" && item.ativo) return false;
    return true;
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const forceOpen = !!term || !!groupFilter || !!typeFilter || !!lineFilter;
  const toggle = (setter: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void, id: string) => setter(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderTreeItem = (item: Product) => <div key={item.id} className="product-tree-item"><span className="product-code">{item.codigo}</span><span className="product-tree-item-name">{item.nome}{!item.linhaId && <small>Sem linha</small>}</span><span>{price(item.precoVenda)}</span><span>{item.ativo ? "Ativo" : "Inativo"}</span><div className="product-actions"><button className="action-btn" aria-label={`Editar ${item.codigo}`} onClick={() => openItem(item)}>✏️</button>{item.ativo && <button className="action-btn" aria-label={`Desativar ${item.codigo}`} disabled={saving} onClick={() => void deactivateItem(item)}>🗑️</button>}</div></div>;

  const openItem = (item?: Product) => {
    setItemModal(item ?? "new"); setModalError("");
    setDraft(item ? { nome: item.nome, grupoId: item.grupoId ?? "", tipoId: item.tipoId ?? "", linhaId: item.linhaId ?? "", descricao: item.descricao ?? "", observacoes: item.observacoes ?? "", unidade: item.unidade ?? "", precoVenda: item.precoVenda ?? "", precoCusto: item.precoCusto ?? "", ativo: item.ativo } : { ...emptyDraft });
  };
  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!itemModal) return;
    if (!draft.grupoId || !draft.tipoId) { setModalError("Selecione Grupo e Tipo."); return; }
    setSaving(true); setModalError("");
    try {
      const body = { ...draft, tipoId: draft.tipoId, linhaId: draft.linhaId || null };
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

  const openConfig = (tab: "grupo" | "tipo" | "linha") => { setConfigOpen(true); setConfigTab(tab); setConfigId(null); setConfigSearch(""); setConfigDraft({ ...emptyConfig }); setModalError(""); };
  const saveConfig = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setModalError("");
    try {
      const root = configTab === "grupo" ? "/api/produto-grupos" : configTab === "tipo" ? "/api/produto-tipos" : "/api/produto-linhas";
      const body = configTab === "grupo" ? { codigo: configDraft.codigo, nome: configDraft.nome } : configTab === "tipo" ? { codigo: configDraft.codigo, nome: configDraft.nome, ...(configId ? {} : { grupoId: configDraft.grupoId }) } : { codigo: configDraft.codigo, nome: configDraft.nome, ...(configId ? {} : { tipoId: configDraft.tipoId }) };
      await request(configId ? `${root}/${configId}` : root, configId ? "PUT" : "POST", body);
      setConfigId(null); setConfigDraft({ ...emptyConfig }); await load();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao salvar classificação."); }
    finally { setSaving(false); }
  };
  const deactivateConfig = async (id: string) => {
    if (!confirm(`Desativar ${configTab === "grupo" ? "Grupo" : configTab === "tipo" ? "Tipo" : "Linha"}?`)) return;
    setSaving(true); setModalError("");
    try { await request(`${configTab === "grupo" ? "/api/produto-grupos" : configTab === "tipo" ? "/api/produto-tipos" : "/api/produto-linhas"}/${id}`, "DELETE"); await load(); }
    catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao desativar classificação."); }
    finally { setSaving(false); }
  };

  return <div className="product-page">
    <header className="topbar"><div><h1 className="page-title">Dimensão de Produtos/Serviços</h1><p className="page-sub">Estrutura Empresa — Catálogo de produtos e serviços</p></div></header>
    <div className="product-content">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="product-toolbar">
        <label className="product-search">Busca<input className="filter-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Código ou nome" /></label>
        <label>Grupo<select className="filter-input" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setTypeFilter(""); setLineFilter(""); }}><option value="">Todos</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label>
        <label>Tipo<select className="filter-input" value={typeFilter} disabled={!groupFilter} onChange={event => { setTypeFilter(event.target.value); setLineFilter(""); }}><option value="">Todos</option>{filterTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label>
        <label>Linha<select className="filter-input" value={lineFilter} disabled={!typeFilter} onChange={event => setLineFilter(event.target.value)}><option value="">Todas</option>{filterLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label>
        <label>Status<select className="filter-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Todos</option></select></label>
        <span className="product-count" role="status">{loading ? "Carregando…" : `${filtered.length} de ${items.length} itens exibidos`}</span>
        <div className="product-view-switch" role="group" aria-label="Visualização"><button className={`btn ${viewMode === "arvore" ? "btn-primary" : "btn-secondary"}`} aria-pressed={viewMode === "arvore"} onClick={() => setViewMode("arvore")}>Árvore</button><button className={`btn ${viewMode === "tabela" ? "btn-primary" : "btn-secondary"}`} aria-pressed={viewMode === "tabela"} onClick={() => setViewMode("tabela")}>Tabela</button></div>
        {viewMode === "arvore" && <div className="product-view-switch" role="group" aria-label="Expansão da árvore"><button className="btn btn-secondary" onClick={() => { setExpandedGroups(new Set(groups.map(group => group.id))); setExpandedTypes(new Set(types.map(type => type.id))); setExpandedLines(new Set(lines.map(line => line.id))); }}>Expandir tudo</button><button className="btn btn-secondary" disabled={forceOpen} title={forceOpen ? "Resultados de busca e filtros permanecem visíveis" : undefined} onClick={() => { setExpandedGroups(new Set()); setExpandedTypes(new Set()); setExpandedLines(new Set()); }}>Recolher tudo</button></div>}
        <div className="product-toolbar-actions"><button className="btn btn-secondary" onClick={() => openConfig("grupo")}>Grupos</button><button className="btn btn-secondary" onClick={() => openConfig("tipo")}>Tipos</button><button className="btn btn-secondary" onClick={() => openConfig("linha")}>Linhas</button><button className="btn btn-secondary" onClick={() => openItem()}>+ Novo Item</button><button className="btn btn-primary" onClick={() => setImportOpen(true)}>Importar Produtos e Serviços</button></div>
      </div>
      {viewMode === "arvore" && <div className="product-tree" aria-label="Hierarquia de Produtos e Serviços">
        {groups.filter(group => group.ativo || statusFilter !== "ativo").filter(group => !groupFilter || group.id === groupFilter).map(group => {
          const groupItems = filtered.filter(item => item.grupoId === group.id);
          const groupTypes = types.filter(type => type.grupoId === group.id && (type.ativo || statusFilter !== "ativo") && (!typeFilter || type.id === typeFilter));
          const groupMatch = !!term && `${group.codigo} ${group.nome}`.toLocaleLowerCase("pt-BR").includes(term);
          if (term && !groupMatch && !groupItems.length && !groupTypes.some(type => `${type.codigo} ${type.nome}`.toLocaleLowerCase("pt-BR").includes(term))) return null;
          const groupOpen = forceOpen || expandedGroups.has(group.id);
          return <section key={group.id} className="product-tree-group"><button className="product-tree-toggle product-tree-group-head" aria-expanded={groupOpen} disabled={forceOpen} onClick={() => toggle(setExpandedGroups, group.id)}><span aria-hidden="true">{groupOpen ? "▾" : "▸"}</span><strong>{group.codigo} — {group.nome}</strong><small>{groupItems.length} item(ns){group.ativo ? "" : " · Inativo"}</small></button>
            {groupOpen && <div className="product-tree-branches">{groupTypes.map(type => {
              const typeItems = groupItems.filter(item => item.tipoId === type.id);
              const typeMatch = `${type.codigo} ${type.nome}`.toLocaleLowerCase("pt-BR").includes(term);
              const typeLines = lines.filter(line => line.tipoId === type.id && (line.ativo || statusFilter !== "ativo") && (!lineFilter || line.id === lineFilter));
              if (term && !groupMatch && !typeMatch && !typeItems.length && !typeLines.some(line => `${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term))) return null;
              const typeOpen = forceOpen || expandedTypes.has(type.id);
              return <div key={type.id} className="product-tree-type"><button className="product-tree-toggle" aria-expanded={typeOpen} disabled={forceOpen} onClick={() => toggle(setExpandedTypes, type.id)}><span aria-hidden="true">{typeOpen ? "▾" : "▸"}</span><strong>{type.codigo} — {type.nome}</strong><small>{typeItems.length} item(ns){type.ativo ? "" : " · Inativo"}</small></button>
                {typeOpen && <div className="product-tree-branches">{!lineFilter && typeItems.filter(item => !item.linhaId).map(renderTreeItem)}{typeLines.map(line => {
                  const lineItems = typeItems.filter(item => item.linhaId === line.id);
                  if (term && !groupMatch && !typeMatch && !lineItems.length && !`${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term)) return null;
                  const lineOpen = forceOpen || expandedLines.has(line.id);
                  return <div key={line.id} className="product-tree-line"><button className="product-tree-toggle" aria-expanded={lineOpen} disabled={forceOpen} onClick={() => toggle(setExpandedLines, line.id)}><span aria-hidden="true">{lineOpen ? "▾" : "▸"}</span><strong>{line.codigo} — {line.nome}</strong><small>{lineItems.length} item(ns){line.ativo ? "" : " · Inativo"}</small></button>{lineOpen && <div className="product-tree-branches">{lineItems.map(renderTreeItem)}</div>}</div>;
                })}</div>}
              </div>;
            })}</div>}
          </section>;
        })}
        {!groupFilter && filtered.some(item => !item.grupoId) && <section className="product-tree-group"><div className="product-tree-group-head product-tree-legacy"><strong>Legado sem Grupo configurável</strong><small>{filtered.filter(item => !item.grupoId).length} item(ns)</small></div><div className="product-tree-branches">{filtered.filter(item => !item.grupoId).map(renderTreeItem)}</div></section>}
        {!loading && !groups.length && !filtered.length && <p className="product-empty">Nenhum Grupo cadastrado. Use Grupos para iniciar a estrutura.</p>}
      </div>}
      {viewMode === "tabela" && <>
      <div className="product-table-scroll"><table className="data-table product-table"><thead><tr><th>Código</th><th>Nome</th><th>Grupo</th><th>Tipo</th><th>Linha</th><th>Venda ref.</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {!loading && filtered.length === 0 && <tr><td colSpan={8} className="product-empty">Nenhum Item encontrado. Cadastre primeiro um Tipo para criar um Item.</td></tr>}
        {filtered.map(item => <tr key={item.id}><td className="product-code">{item.codigo}</td><td>{item.nome}</td><td>{item.grupoId ? groups.find(group => group.id === item.grupoId)?.nome ?? "Grupo indisponível" : <span className="product-muted">{item.tipo ? `Legado: ${item.tipo}` : "Legado sem Grupo"}</span>}</td><td>{item.tipoId ? types.find(type => type.id === item.tipoId)?.nome ?? "Tipo indisponível" : <span className="product-muted">Sem classificação (legado)</span>}</td><td>{item.linhaId ? lines.find(line => line.id === item.linhaId)?.nome ?? "Linha indisponível" : <span className="product-muted">—</span>}</td><td>{price(item.precoVenda)}</td><td>{item.ativo ? "Ativo" : "Inativo"}</td><td className="product-actions"><button className="action-btn" aria-label={`Editar ${item.codigo}`} onClick={() => openItem(item)}>✏️</button>{item.ativo && <button className="action-btn" aria-label={`Desativar ${item.codigo}`} disabled={saving} onClick={() => void deactivateItem(item)}>🗑️</button>}</td></tr>)}
      </tbody></table></div></>}
    </div>

    {itemModal && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setItemModal(null); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-header"><h2 id="product-modal-title">{itemModal === "new" ? "Novo Item" : `Editar ${itemModal.codigo}`}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setItemModal(null)}>×</button></div><form className="product-modal-form" onSubmit={event => void saveItem(event)} onKeyDown={event => { if (event.key === "Escape") setItemModal(null); }}><div className="product-modal-body">
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      <section><h3>Identificação</h3><div className="product-fields"><label>Código<input readOnly value={itemModal === "new" ? "Automático ao salvar" : itemModal.codigo} /></label><label>Nome *<input ref={firstInput} required value={draft.nome} onChange={event => setDraft(value => ({ ...value, nome: event.target.value }))} /></label><label className="product-wide">Descrição<textarea rows={2} value={draft.descricao} onChange={event => setDraft(value => ({ ...value, descricao: event.target.value }))} /></label><label>Status<select value={draft.ativo ? "ativo" : "inativo"} onChange={event => setDraft(value => ({ ...value, ativo: event.target.value === "ativo" }))} disabled={itemModal === "new"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label></div></section>
      <section><h3>Classificação</h3><div className="product-fields"><label>Grupo *<select required value={draft.grupoId} onChange={event => setDraft(value => ({ ...value, grupoId: event.target.value, tipoId: "", linhaId: "" }))}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label><label>Tipo *<select required disabled={!draft.grupoId} value={draft.tipoId} onChange={event => setDraft(value => ({ ...value, tipoId: event.target.value, linhaId: "" }))}><option value="">Selecione</option>{activeTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label><label>Linha<select value={draft.linhaId} disabled={!draft.tipoId} onChange={event => setDraft(value => ({ ...value, linhaId: event.target.value }))}><option value="">Sem Linha</option>{activeLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label></div></section>
      <section><h3>Valores de referência</h3><div className="product-fields"><label>Unidade<input value={draft.unidade} onChange={event => setDraft(value => ({ ...value, unidade: event.target.value }))} placeholder="UN, KG, HR…" /></label><label>Preço de venda<input type="number" min="0" step="0.01" value={draft.precoVenda} onChange={event => setDraft(value => ({ ...value, precoVenda: event.target.value }))} /></label><label>Preço de custo<input type="number" min="0" step="0.01" value={draft.precoCusto} onChange={event => setDraft(value => ({ ...value, precoCusto: event.target.value }))} /></label></div></section>
      <section><h3>Observações</h3><div className="product-fields"><label className="product-wide">Observações<textarea rows={2} value={draft.observacoes} onChange={event => setDraft(value => ({ ...value, observacoes: event.target.value }))} /></label></div></section>
    </div><div className="product-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setItemModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar Item"}</button></div></form></div></div>}

    {configOpen && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfigOpen(false); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-config-title"><div className="modal-header"><h2 id="product-config-title">{configTab === "grupo" ? "Grupos" : configTab === "tipo" ? "Tipos" : "Linhas"}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setConfigOpen(false)}>×</button></div><div className="product-config-body" onKeyDown={event => { if (event.key === "Escape") setConfigOpen(false); }}>
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      {configTab === "grupo" ? <><form className="product-config-form" onSubmit={event => void saveConfig(event)}><label>Código *<input ref={firstInput} required maxLength={30} disabled={!!configId} value={configDraft.codigo} onChange={event => setConfigDraft(value => ({ ...value, codigo: event.target.value }))} /></label><label>Nome *<input required value={configDraft.nome} onChange={event => setConfigDraft(value => ({ ...value, nome: event.target.value }))} /></label><button className="btn btn-primary" disabled={saving}>{configId ? "Salvar" : "+ Novo Grupo"}</button>{configId && <button type="button" className="btn btn-secondary" onClick={() => { setConfigId(null); setConfigDraft({ ...emptyConfig }); }}>Cancelar edição</button>}</form><label className="product-config-search">Pesquisar Grupos<input className="filter-input" value={configSearch} onChange={event => setConfigSearch(event.target.value)} placeholder="Código ou nome" /></label><div className="product-config-list">{groups.filter(group => `${group.codigo} ${group.nome}`.toLocaleLowerCase("pt-BR").includes(configSearch.trim().toLocaleLowerCase("pt-BR"))).map(group => <div key={group.id} className="product-config-row"><span><strong>{group.codigo}</strong> — {group.nome}<small>{group.ativo ? "Ativo" : "Inativo"}</small></span><div>{group.ativo && <><button className="action-btn" aria-label={`Editar ${group.codigo}`} onClick={() => { setConfigId(group.id); setConfigDraft({ codigo: group.codigo, nome: group.nome, grupoId: "", tipoId: "" }); setModalError(""); }}>✏️</button><button className="action-btn" aria-label={`Desativar ${group.codigo}`} disabled={saving} onClick={() => void deactivateConfig(group.id)}>🗑️</button></>}</div></div>)}{groups.length === 0 && <p className="product-muted">Nenhum Grupo cadastrado.</p>}</div></> : <><form className="product-config-form" onSubmit={event => void saveConfig(event)}>
        <label>Grupo *<select required disabled={!!configId} value={configDraft.grupoId} onChange={event => setConfigDraft(value => ({ ...value, grupoId: event.target.value, tipoId: "" }))}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label>
        {configTab === "linha" && <label>Tipo *<select required disabled={!!configId || !configDraft.grupoId} value={configDraft.tipoId} onChange={event => setConfigDraft(value => ({ ...value, tipoId: event.target.value }))}><option value="">Selecione</option>{types.filter(type => type.ativo && type.grupoId === configDraft.grupoId).map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label>}
        <label>Código *<input ref={firstInput} required maxLength={30} value={configDraft.codigo} onChange={event => setConfigDraft(value => ({ ...value, codigo: event.target.value }))} /></label>
        <label>Nome *<input required value={configDraft.nome} onChange={event => setConfigDraft(value => ({ ...value, nome: event.target.value }))} /></label>
        <button className="btn btn-primary" disabled={saving}>{configId ? "Salvar" : "+ Adicionar"}</button>{configId && <button type="button" className="btn btn-secondary" onClick={() => { setConfigId(null); setConfigDraft({ ...emptyConfig }); }}>Cancelar edição</button>}
      </form>
      <div className="product-config-list">{(configTab === "tipo" ? types : lines).map(entry => <div key={entry.id} className="product-config-row"><span><strong>{entry.codigo}</strong> — {entry.nome}<small>{configTab === "tipo" ? groups.find(group => group.id === (entry as ProductType).grupoId)?.nome ?? "Legado sem Grupo" : (() => { const parent = types.find(type => type.id === (entry as ProductLine).tipoId), group = groups.find(entry => entry.id === parent?.grupoId); return parent ? `${group?.nome ?? "Legado"} → ${parent.codigo} — ${parent.nome}` : "Tipo indisponível"; })()}{entry.ativo ? "" : " · Inativo"}</small></span><div><button className="action-btn" aria-label={`Editar ${entry.codigo}`} onClick={() => { setConfigId(entry.id); const parent = configTab === "linha" ? types.find(type => type.id === (entry as ProductLine).tipoId) : null; setConfigDraft({ codigo: entry.codigo, nome: entry.nome, grupoId: configTab === "tipo" ? (entry as ProductType).grupoId ?? "" : parent?.grupoId ?? "", tipoId: configTab === "linha" ? (entry as ProductLine).tipoId : "" }); setModalError(""); }}>✏️</button>{entry.ativo && <button className="action-btn" aria-label={`Desativar ${entry.codigo}`} disabled={saving} onClick={() => void deactivateConfig(entry.id)}>🗑️</button>}</div></div>)}{(configTab === "tipo" ? types : lines).length === 0 && <p className="product-muted">Nenhum cadastro nesta seção.</p>}</div></>}
    </div><div className="product-modal-footer"><button className="btn btn-secondary" onClick={() => setConfigOpen(false)}>Fechar</button></div></div></div>}
    {importOpen && <ProductImportModal onClose={() => setImportOpen(false)} onImported={() => { void load(); }} />}
  </div>;
}
