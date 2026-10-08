"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ProductImportModal from "@/components/estrutura/ProductImportModal";
import { useCan } from "@/components/access/PermissionContext";
import ExportOnlyButton from "@/components/access/ExportOnlyButton";
import "./dimensao-produtos.css";

type ProductGroup = { id: string; codigo: string; nome: string; ativo: boolean };
type ProductType = { id: string; grupoId: string | null; grupo: string | null; codigo: string; nome: string; ativo: boolean };
type ProductLine = { id: string; tipoId: string; codigo: string; nome: string; ativo: boolean };
type Product = { id: string; codigo: string; nome: string; tipo: string | null; grupoId: string | null; tipoId: string | null; linhaId: string | null; descricao: string | null; observacoes: string | null; unidade: string | null; categoria: string | null; ativo: boolean };
type Draft = { nome: string; grupoId: string; tipoId: string; linhaId: string; descricao: string; observacoes: string; unidade: string; ativo: boolean };
type ConfigDraft = { codigo: string; nome: string; grupoId: string; tipoId: string };

const emptyDraft: Draft = { nome: "", grupoId: "", tipoId: "", linhaId: "", descricao: "", observacoes: "", unidade: "", ativo: true };
const emptyConfig: ConfigDraft = { codigo: "", nome: "", grupoId: "", tipoId: "" };
const compareCode = (a: { codigo: string }, b: { codigo: string }) => {
  const left = a.codigo.split("."), right = b.codigo.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const numeric = /^\d+$/.test(left[index]) && /^\d+$/.test(right[index]);
    const result = numeric ? BigInt(left[index]) < BigInt(right[index]) ? -1 : BigInt(left[index]) > BigInt(right[index]) ? 1 : 0 : left[index].localeCompare(right[index], "pt-BR");
    if (result) return result;
  }
  return a.codigo.localeCompare(b.codigo, "pt-BR");
};

async function request(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: object) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
  return data;
}

export default function DimensaoProdutosPage() {
  const can = useCan();
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
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(emptyConfig);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "grupo" | "tipo" | "linha" | "item"; id: string; codigo: string; nome: string } | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
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
      setItems(products); setGroups([...productGroups].sort(compareCode)); setTypes([...productTypes].sort(compareCode)); setLines([...productLines].sort(compareCode));
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
  const filterGroups = groups.filter(group => statusFilter !== "ativo" || group.ativo);
  const filterTypes = types.filter(type => (statusFilter !== "ativo" || type.ativo) && type.grupoId === groupFilter);
  const filterLines = lines.filter(line => (statusFilter !== "ativo" || line.ativo) && line.tipoId === typeFilter);
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
  const matchesStatus = (active: boolean) => !statusFilter || (statusFilter === "ativo" ? active : !active);
  const visibleLine = (line: ProductLine) => matchesStatus(line.ativo) || filtered.some(item => item.linhaId === line.id);
  const visibleType = (type: ProductType) => matchesStatus(type.ativo) || filtered.some(item => item.tipoId === type.id) || lines.some(line => line.tipoId === type.id && visibleLine(line));
  const visibleGroup = (group: ProductGroup) => matchesStatus(group.ativo) || filtered.some(item => item.grupoId === group.id) || types.some(type => type.grupoId === group.id && visibleType(type));
  const legacyTypes = types.filter(type => !type.grupoId && visibleType(type) && (!typeFilter || type.id === typeFilter) && (!term || `${type.codigo} ${type.nome}`.toLocaleLowerCase("pt-BR").includes(term) || filtered.some(item => item.tipoId === type.id) || lines.some(line => line.tipoId === type.id && `${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term))));
  const forceOpen = !!term || !!groupFilter || !!typeFilter || !!lineFilter;
  const toggle = (setter: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void, id: string) => setter(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderTreeItem = (item: Product) => <div key={item.id} className={`product-tree-item${item.ativo ? "" : " product-tree-inactive"}`} tabIndex={0}><span className="product-code">{item.codigo}</span><span className="product-tree-item-name">{item.nome}{!item.linhaId && <small>Sem linha</small>}</span><span className="product-tree-status">{item.ativo ? "Ativo" : "Inativo"}</span><div className="product-actions"><button className="action-btn" aria-label={`Editar Item ${item.codigo}`} title="Editar Item" disabled={!item.ativo} onClick={() => openItem(item)}>✎</button>{item.ativo ? <button className="action-btn" aria-label={`Desativar Item ${item.codigo}`} title="Desativar Item" disabled={saving} onClick={() => void deactivateItem(item)}>⊘</button> : <button className="action-btn" aria-label={`Reativar Item ${item.codigo}`} title="Reativar Item" disabled={saving} onClick={() => void reactivate("item", item)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Item ${item.codigo}`} title="Excluir definitivamente" onClick={() => prepareDelete("item", item)}>×</button></div></div>;

  const openItem = (item?: Product, parent?: { grupoId: string; tipoId: string; linhaId?: string }) => {
    setItemModal(item ?? "new"); setModalError("");
    setDraft(item ? { nome: item.nome, grupoId: item.grupoId ?? "", tipoId: item.tipoId ?? "", linhaId: item.linhaId ?? "", descricao: item.descricao ?? "", observacoes: item.observacoes ?? "", unidade: item.unidade ?? "", ativo: item.ativo } : { ...emptyDraft, ...parent });
  };
  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!itemModal) return;
    if (!draft.grupoId || !draft.tipoId) { setModalError("Selecione Grupo e Tipo."); return; }
    setSaving(true); setModalError("");
    try {
      const body = { ...draft, tipoId: draft.tipoId, linhaId: draft.linhaId || null };
      await request(itemModal === "new" ? "/api/produtos" : `/api/produtos/${itemModal.id}`, itemModal === "new" ? "POST" : "PUT", body);
      setItemModal(null); setExpandedGroups(current => new Set(current).add(draft.grupoId)); setExpandedTypes(current => new Set(current).add(draft.tipoId)); if (draft.linhaId) setExpandedLines(current => new Set(current).add(draft.linhaId)); await load();
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

  const openConfig = (tab: "grupo" | "tipo" | "linha", entry?: ProductGroup | ProductType | ProductLine, parent?: { grupoId?: string; tipoId?: string }) => {
    setConfigOpen(true); setConfigTab(tab); setConfigId(entry?.id ?? null); setModalError("");
    const type = tab === "linha" && entry ? types.find(value => value.id === (entry as ProductLine).tipoId) : null;
    setConfigDraft(entry ? { codigo: entry.codigo, nome: entry.nome, grupoId: tab === "tipo" ? (entry as ProductType).grupoId ?? "" : type?.grupoId ?? "", tipoId: tab === "linha" ? (entry as ProductLine).tipoId : "" } : { ...emptyConfig, ...parent });
  };
  const saveConfig = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setModalError("");
    try {
      const root = configTab === "grupo" ? "/api/produto-grupos" : configTab === "tipo" ? "/api/produto-tipos" : "/api/produto-linhas";
      const body = configTab === "grupo" ? { nome: configDraft.nome } : configTab === "tipo" ? { nome: configDraft.nome, ...(configId ? {} : { grupoId: configDraft.grupoId }) } : { nome: configDraft.nome, ...(configId ? {} : { tipoId: configDraft.tipoId }) };
      const saved = await request(configId ? `${root}/${configId}` : root, configId ? "PUT" : "POST", body);
      if (configTab === "grupo") setExpandedGroups(current => new Set(current).add(saved.id));
      if (configTab === "tipo") { setExpandedGroups(current => new Set(current).add(configDraft.grupoId)); setExpandedTypes(current => new Set(current).add(saved.id)); }
      if (configTab === "linha") { setExpandedGroups(current => new Set(current).add(configDraft.grupoId)); setExpandedTypes(current => new Set(current).add(configDraft.tipoId)); setExpandedLines(current => new Set(current).add(saved.id)); }
      setConfigOpen(false); setConfigId(null); await load();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Erro ao salvar classificação."); }
    finally { setSaving(false); }
  };
  const rootFor = (kind: "grupo" | "tipo" | "linha" | "item") => kind === "grupo" ? "/api/produto-grupos" : kind === "tipo" ? "/api/produto-tipos" : kind === "linha" ? "/api/produto-linhas" : "/api/produtos";
  const deactivateConfig = async (kind: "grupo" | "tipo" | "linha", entry: ProductGroup | ProductType | ProductLine) => {
    if (!confirm(`Desativar ${kind} ${entry.codigo} — ${entry.nome}?`)) return;
    setSaving(true); setError("");
    try { await request(`${rootFor(kind)}/${entry.id}`, "DELETE"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao desativar classificação."); }
    finally { setSaving(false); }
  };
  const reactivate = async (kind: "grupo" | "tipo" | "linha" | "item", entry: ProductGroup | ProductType | ProductLine | Product) => {
    setSaving(true); setError("");
    try { await request(`${rootFor(kind)}/${entry.id}`, "PATCH"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reativar o cadastro."); }
    finally { setSaving(false); }
  };
  const prepareDelete = (kind: "grupo" | "tipo" | "linha" | "item", entry: ProductGroup | ProductType | ProductLine | Product) => { setDeleteTarget({ kind, id: entry.id, codigo: entry.codigo, nome: entry.nome }); setDeleteCode(""); setModalError(""); };
  const deletePermanently = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget || deleteCode !== deleteTarget.codigo) return;
    setSaving(true); setModalError("");
    try { await request(`${rootFor(deleteTarget.kind)}/${deleteTarget.id}?permanent=true`, "DELETE", { confirmCode: deleteCode }); setDeleteTarget(null); await load(); }
    catch (cause) { setModalError(cause instanceof Error ? cause.message : "Não foi possível excluir definitivamente."); }
    finally { setSaving(false); }
  };

  return <div className={`product-page ${can("estrutura.portfolio.create") ? "can-create" : ""} ${can("estrutura.portfolio.edit") ? "can-edit" : ""} ${can("estrutura.portfolio.delete") ? "can-delete" : ""}`}>
    <header className="topbar"><div><h1 className="page-title">Dimensão de Portfólio</h1><p className="page-sub">Catálogo hierárquico — Grupo → Tipo → Linha → Item</p></div></header>
    <div className="product-content">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="product-toolbar">
        <label className="product-search">Busca<input className="filter-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Código ou nome" /></label>
        <label>Grupo<select className="filter-input" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setTypeFilter(""); setLineFilter(""); }}><option value="">Todos</option>{filterGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label>
        <label>Tipo<select className="filter-input" value={typeFilter} disabled={!groupFilter} onChange={event => { setTypeFilter(event.target.value); setLineFilter(""); }}><option value="">Todos</option>{filterTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label>
        <label>Linha<select className="filter-input" value={lineFilter} disabled={!typeFilter} onChange={event => setLineFilter(event.target.value)}><option value="">Todas</option>{filterLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label>
        <label>Status<select className="filter-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Todos</option></select></label>
        <span className="product-count" role="status">{loading ? "Carregando…" : `${filtered.length} de ${items.length} itens exibidos`}</span>
        <div className="product-toolbar-actions">{can("estrutura.portfolio.import") && <button className="btn btn-primary" onClick={() => setImportOpen(true)}>Importar Portfólio</button>}<ExportOnlyButton permission="estrutura.portfolio.export" importPermission="estrutura.portfolio.import" url="/api/produtos/exportar" filename="portfolio_10s.xlsx" label="Baixar Portfólio" /></div>
      </div>
      <div className="product-tree" aria-label="Hierarquia do Portfólio">
        <div className="product-tree-header"><strong>Grupo → Tipo → Linha opcional → Item</strong><div className="product-view-switch" role="group" aria-label="Expansão da árvore"><button className="btn btn-secondary" onClick={() => { setExpandedGroups(new Set(groups.map(group => group.id))); setExpandedTypes(new Set(types.map(type => type.id))); setExpandedLines(new Set(lines.map(line => line.id))); }}>Expandir tudo</button><button className="btn btn-secondary" disabled={forceOpen} title={forceOpen ? "Resultados de busca e filtros permanecem visíveis" : undefined} onClick={() => { setExpandedGroups(new Set()); setExpandedTypes(new Set()); setExpandedLines(new Set()); }}>Recolher tudo</button></div></div>
        <div className="product-tree-root-actions"><button className="btn btn-secondary" onClick={() => openConfig("grupo")}>+ Novo Grupo</button></div>
        {groups.filter(visibleGroup).filter(group => !groupFilter || group.id === groupFilter).map(group => {
          const groupItems = filtered.filter(item => item.grupoId === group.id);
          const groupTypes = types.filter(type => type.grupoId === group.id && visibleType(type) && (!typeFilter || type.id === typeFilter));
          const groupMatch = !!term && `${group.codigo} ${group.nome}`.toLocaleLowerCase("pt-BR").includes(term);
          if (term && !groupMatch && !groupItems.length && !groupTypes.some(type => `${type.codigo} ${type.nome}`.toLocaleLowerCase("pt-BR").includes(term) || lines.some(line => line.tipoId === type.id && `${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term)))) return null;
          const groupOpen = forceOpen || expandedGroups.has(group.id);
          return <section key={group.id} className="product-tree-group"><div className="product-tree-row product-tree-group-head"><button className="product-tree-toggle" aria-label={`${groupOpen ? "Recolher" : "Expandir"} Grupo ${group.codigo}`} aria-expanded={groupOpen} disabled={forceOpen} onClick={() => toggle(setExpandedGroups, group.id)}><span aria-hidden="true">{groupOpen ? "▾" : "▸"}</span><strong>{group.codigo} — {group.nome}</strong><small>{groupItems.length} item(ns){group.ativo ? statusFilter === "inativo" ? " · Contexto ativo" : "" : " · Inativo"}</small></button><div className="product-tree-row-actions">{group.ativo && <><button className="btn btn-secondary" onClick={() => { openConfig("tipo", undefined, { grupoId: group.id }); setExpandedGroups(current => new Set(current).add(group.id)); }}>+ Tipo</button><button className="action-btn" aria-label={`Editar Grupo ${group.codigo}`} title="Editar Grupo" onClick={() => openConfig("grupo", group)}>✎</button><button className="action-btn" aria-label={`Desativar Grupo ${group.codigo}`} title="Desativar Grupo" disabled={saving} onClick={() => void deactivateConfig("grupo", group)}>⊘</button></>}{!group.ativo && <button className="action-btn" aria-label={`Reativar Grupo ${group.codigo}`} title="Reativar Grupo" disabled={saving} onClick={() => void reactivate("grupo", group)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Grupo ${group.codigo}`} title="Excluir definitivamente" onClick={() => prepareDelete("grupo", group)}>×</button></div></div>
            {groupOpen && <div className="product-tree-branches">{groupTypes.map(type => {
              const typeItems = groupItems.filter(item => item.tipoId === type.id);
              const typeMatch = `${type.codigo} ${type.nome}`.toLocaleLowerCase("pt-BR").includes(term);
              const typeLines = lines.filter(line => line.tipoId === type.id && visibleLine(line) && (!lineFilter || line.id === lineFilter));
              if (term && !groupMatch && !typeMatch && !typeItems.length && !typeLines.some(line => `${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term))) return null;
              const typeOpen = forceOpen || expandedTypes.has(type.id);
              return <div key={type.id} className="product-tree-type"><div className="product-tree-row"><button className="product-tree-toggle" aria-label={`${typeOpen ? "Recolher" : "Expandir"} Tipo ${type.codigo}`} aria-expanded={typeOpen} disabled={forceOpen} onClick={() => toggle(setExpandedTypes, type.id)}><span aria-hidden="true">{typeOpen ? "▾" : "▸"}</span><strong>{type.codigo} — {type.nome}</strong><small>{typeItems.length} item(ns){type.ativo ? statusFilter === "inativo" ? " · Contexto ativo" : "" : " · Inativo"}</small></button><div className="product-tree-row-actions">{type.ativo && group.ativo && <><button className="btn btn-secondary" onClick={() => { openConfig("linha", undefined, { grupoId: group.id, tipoId: type.id }); setExpandedTypes(current => new Set(current).add(type.id)); }}>+ Linha</button><button className="btn btn-secondary" onClick={() => openItem(undefined, { grupoId: group.id, tipoId: type.id })}>+ Item</button></>}<button className="action-btn" aria-label={`Editar Tipo ${type.codigo}`} title="Editar Tipo" onClick={() => openConfig("tipo", type)} disabled={!type.ativo}>✎</button>{type.ativo ? <button className="action-btn" aria-label={`Desativar Tipo ${type.codigo}`} title="Desativar Tipo" disabled={saving} onClick={() => void deactivateConfig("tipo", type)}>⊘</button> : <button className="action-btn" aria-label={`Reativar Tipo ${type.codigo}`} title="Reativar Tipo" disabled={saving} onClick={() => void reactivate("tipo", type)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Tipo ${type.codigo}`} title="Excluir definitivamente" onClick={() => prepareDelete("tipo", type)}>×</button></div></div>
                {typeOpen && <div className="product-tree-branches">{!lineFilter && typeItems.filter(item => !item.linhaId).map(renderTreeItem)}{typeLines.map(line => {
                  const lineItems = typeItems.filter(item => item.linhaId === line.id);
                  if (term && !groupMatch && !typeMatch && !lineItems.length && !`${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term)) return null;
                  const lineOpen = forceOpen || expandedLines.has(line.id);
                  return <div key={line.id} className="product-tree-line"><div className="product-tree-row"><button className="product-tree-toggle" aria-label={`${lineOpen ? "Recolher" : "Expandir"} Linha ${line.codigo}`} aria-expanded={lineOpen} disabled={forceOpen} onClick={() => toggle(setExpandedLines, line.id)}><span aria-hidden="true">{lineOpen ? "▾" : "▸"}</span><strong>{line.codigo} — {line.nome}</strong><small>{lineItems.length} item(ns){line.ativo ? statusFilter === "inativo" ? " · Contexto ativo" : "" : " · Inativo"}</small></button><div className="product-tree-row-actions">{line.ativo && type.ativo && group.ativo && <button className="btn btn-secondary" onClick={() => openItem(undefined, { grupoId: group.id, tipoId: type.id, linhaId: line.id })}>+ Item</button>}<button className="action-btn" aria-label={`Editar Linha ${line.codigo}`} title="Editar Linha" onClick={() => openConfig("linha", line)} disabled={!line.ativo}>✎</button>{line.ativo ? <button className="action-btn" aria-label={`Desativar Linha ${line.codigo}`} title="Desativar Linha" disabled={saving} onClick={() => void deactivateConfig("linha", line)}>⊘</button> : <button className="action-btn" aria-label={`Reativar Linha ${line.codigo}`} title="Reativar Linha" disabled={saving} onClick={() => void reactivate("linha", line)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Linha ${line.codigo}`} title="Excluir definitivamente" onClick={() => prepareDelete("linha", line)}>×</button></div></div>{lineOpen && <div className="product-tree-branches">{lineItems.map(renderTreeItem)}</div>}</div>;
                })}</div>}
              </div>;
            })}</div>}
          </section>;
        })}
        {!groupFilter && (filtered.some(item => !item.grupoId) || legacyTypes.length > 0) && <section className="product-tree-group"><div className="product-tree-group-head product-tree-legacy"><strong>Legado sem Grupo configurável</strong><small>{filtered.filter(item => !item.grupoId).length} item(ns)</small></div><div className="product-tree-branches">{legacyTypes.map(type => <div key={type.id} className="product-tree-type"><div className="product-tree-row"><span className="product-tree-legacy-label"><strong>{type.codigo} — {type.nome}</strong><small>{type.ativo ? "Legado" : "Legado · Inativo"}</small></span><div className="product-tree-row-actions"><button className="action-btn" aria-label={`Editar Tipo legado ${type.codigo}`} onClick={() => openConfig("tipo", type)} disabled={!type.ativo}>✎</button>{type.ativo ? <button className="action-btn" aria-label={`Desativar Tipo legado ${type.codigo}`} onClick={() => void deactivateConfig("tipo", type)}>⊘</button> : <button className="action-btn" aria-label={`Reativar Tipo legado ${type.codigo}`} title="Reativar Tipo" disabled={saving} onClick={() => void reactivate("tipo", type)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Tipo legado ${type.codigo}`} onClick={() => prepareDelete("tipo", type)}>×</button></div></div><div className="product-tree-branches">{lines.filter(line => line.tipoId === type.id && visibleLine(line) && (!term || `${line.codigo} ${line.nome}`.toLocaleLowerCase("pt-BR").includes(term) || filtered.some(item => item.linhaId === line.id))).map(line => <div key={line.id} className="product-tree-row"><span className="product-tree-legacy-label"><strong>{line.codigo} — {line.nome}</strong><small>{line.ativo ? "Linha legada" : "Linha legada · Inativa"}</small></span><div className="product-tree-row-actions"><button className="action-btn" aria-label={`Editar Linha legada ${line.codigo}`} onClick={() => openConfig("linha", line)} disabled={!line.ativo}>✎</button>{line.ativo ? <button className="action-btn" aria-label={`Desativar Linha legada ${line.codigo}`} onClick={() => void deactivateConfig("linha", line)}>⊘</button> : <button className="action-btn" aria-label={`Reativar Linha legada ${line.codigo}`} title="Reativar Linha" disabled={saving} onClick={() => void reactivate("linha", line)}>↻</button>}<button className="action-btn product-delete-btn" aria-label={`Excluir definitivamente Linha legada ${line.codigo}`} onClick={() => prepareDelete("linha", line)}>×</button></div></div>)}</div></div>)}{filtered.filter(item => !item.grupoId).map(renderTreeItem)}</div></section>}
        {!loading && !groups.length && !filtered.length && <p className="product-empty">Nenhum Grupo cadastrado. Use + Novo Grupo para iniciar a estrutura.</p>}
      </div>
    </div>

    {itemModal && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setItemModal(null); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-header"><h2 id="product-modal-title">{itemModal === "new" ? "Novo Item" : `Editar ${itemModal.codigo}`}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setItemModal(null)}>×</button></div><form className="product-modal-form" onSubmit={event => void saveItem(event)} onKeyDown={event => { if (event.key === "Escape") setItemModal(null); }}><div className="product-modal-body">
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      <section><h3>Identificação</h3><div className="product-fields"><label>Código<input readOnly value={itemModal === "new" ? "Automático ao salvar" : itemModal.codigo} /></label><label>Nome *<input ref={firstInput} required value={draft.nome} onChange={event => setDraft(value => ({ ...value, nome: event.target.value }))} /></label><label className="product-wide">Descrição<textarea rows={2} value={draft.descricao} onChange={event => setDraft(value => ({ ...value, descricao: event.target.value }))} /></label><label>Status<select value={draft.ativo ? "ativo" : "inativo"} onChange={event => setDraft(value => ({ ...value, ativo: event.target.value === "ativo" }))} disabled={itemModal === "new"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label></div></section>
      <section><h3>Classificação</h3><div className="product-fields"><label>Grupo *<select required value={draft.grupoId} onChange={event => setDraft(value => ({ ...value, grupoId: event.target.value, tipoId: "", linhaId: "" }))}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label><label>Tipo *<select required disabled={!draft.grupoId} value={draft.tipoId} onChange={event => setDraft(value => ({ ...value, tipoId: event.target.value, linhaId: "" }))}><option value="">Selecione</option>{activeTypes.map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label><label>Linha<select value={draft.linhaId} disabled={!draft.tipoId} onChange={event => setDraft(value => ({ ...value, linhaId: event.target.value }))}><option value="">Sem Linha</option>{activeLines.map(line => <option key={line.id} value={line.id}>{line.codigo} — {line.nome}</option>)}</select></label></div></section>
      <section><h3>Dados do Item</h3><div className="product-fields"><label>Unidade<input value={draft.unidade} onChange={event => setDraft(value => ({ ...value, unidade: event.target.value }))} placeholder="UN, KG, HR…" /></label></div></section>
      <section><h3>Observações</h3><div className="product-fields"><label className="product-wide">Observações<textarea rows={2} value={draft.observacoes} onChange={event => setDraft(value => ({ ...value, observacoes: event.target.value }))} /></label></div></section>
    </div><div className="product-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setItemModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar Item"}</button></div></form></div></div>}

    {configOpen && <div className="modal-overlay product-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfigOpen(false); }}><div className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-config-title"><div className="modal-header"><h2 id="product-config-title">{configId ? "Editar" : configTab === "linha" ? "Nova" : "Novo"} {configTab === "grupo" ? "Grupo" : configTab === "tipo" ? "Tipo" : "Linha"}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setConfigOpen(false)}>×</button></div><form className="product-config-body" onSubmit={event => void saveConfig(event)} onKeyDown={event => { if (event.key === "Escape") setConfigOpen(false); }}>
      {modalError && <div className="alert alert-error" role="alert">{modalError}</div>}
      <div className="product-config-form">
        {configTab !== "grupo" && <label>Grupo *<select required disabled={!!configId || !!configDraft.grupoId} value={configDraft.grupoId} onChange={event => setConfigDraft(value => ({ ...value, grupoId: event.target.value, tipoId: "" }))}><option value="">Selecione</option>{activeGroups.map(group => <option key={group.id} value={group.id}>{group.codigo} — {group.nome}</option>)}</select></label>}
        {configTab === "linha" && <label>Tipo *<select required disabled={!!configId || !!configDraft.tipoId || !configDraft.grupoId} value={configDraft.tipoId} onChange={event => setConfigDraft(value => ({ ...value, tipoId: event.target.value }))}><option value="">Selecione</option>{types.filter(type => type.ativo && type.grupoId === configDraft.grupoId).map(type => <option key={type.id} value={type.id}>{type.codigo} — {type.nome}</option>)}</select></label>}
        <label>Código<input readOnly value={configId ? configDraft.codigo : "Automático ao salvar"} /></label>
        <label>Nome *<input ref={firstInput} required value={configDraft.nome} onChange={event => setConfigDraft(value => ({ ...value, nome: event.target.value }))} /></label>
      </div><div className="product-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setConfigOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button></div>
    </form></div></div>}
    {deleteTarget && <div className="modal-overlay product-overlay open" role="presentation"><div className="modal product-modal product-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="product-delete-title"><div className="modal-header"><h2 id="product-delete-title">Excluir definitivamente {deleteTarget.kind}</h2><button className="modal-close" aria-label="Fechar" onClick={() => setDeleteTarget(null)}>×</button></div><form onSubmit={event => void deletePermanently(event)}><div className="product-modal-body"><p>Esta ação remove o cadastro definitivamente: <strong>{deleteTarget.codigo} — {deleteTarget.nome}</strong>. Registros com dependências, mesmo inativas, não serão excluídos.</p><label>Digite o código {deleteTarget.codigo} para confirmar<input autoFocus value={deleteCode} onChange={event => setDeleteCode(event.target.value)} /></label>{modalError && <div className="alert alert-error" role="alert">{modalError}</div>}</div><div className="product-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="btn btn-danger" disabled={saving || deleteCode !== deleteTarget.codigo}>{saving ? "Excluindo…" : "Excluir definitivamente"}</button></div></form></div></div>}
    {can("estrutura.portfolio.import") && importOpen && <ProductImportModal onClose={() => setImportOpen(false)} onImported={() => { void load(); }} />}
  </div>;
}
