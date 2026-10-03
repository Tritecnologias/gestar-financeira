"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import "./dimensoes-cadastrais.css";

type Section = "fornecedores" | "clientes";
type Item = { id: string; codigo: string; nome: string; email?: string | null; telefone?: string | null; documento?: string | null; endereco?: string | null };
type Draft = { codigo: string; nome: string; email: string; telefone: string; documento?: string | null; endereco?: string | null };
const emptyDraft: Draft = { codigo: "", nome: "", email: "", telefone: "" };

export default function DimensoesCadastraisPage() {
  const [fornecedores, setFornecedores] = useState<Item[]>([]);
  const [clientes, setClientes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busca, setBusca] = useState("");
  const [fornecedorDraft, setFornecedorDraft] = useState<Draft>(emptyDraft);
  const [clienteDraft, setClienteDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ section: Section; id: string } | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const fornecedorCodeRef = useRef<HTMLInputElement>(null);
  const clienteCodeRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [supplierResponse, clientResponse] = await Promise.all([
        fetch("/api/fornecedores?ativo=true", { cache: "no-store" }),
        fetch("/api/clientes", { cache: "no-store" }),
      ]);
      if (!supplierResponse.ok || !clientResponse.ok) throw new Error("Não foi possível carregar os cadastros. Tente acessar a página novamente.");
      const [suppliers, customers] = await Promise.all([supplierResponse.json(), clientResponse.json()]);
      if (!Array.isArray(suppliers) || !Array.isArray(customers)) throw new Error("Resposta inesperada ao carregar os cadastros.");
      setFornecedores(suppliers);
      setClientes(customers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar os cadastros.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const request = async (url: string, method: "POST" | "PUT" | "DELETE", data?: Draft) => {
    const response = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "Não foi possível concluir a operação.");
    }
  };

  const create = async (section: Section, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = section === "fornecedores" ? fornecedorDraft : clienteDraft;
    if (!draft.codigo.trim() || !draft.nome.trim()) { setError("Código e nome são obrigatórios."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await request(`/api/${section}`, "POST", draft);
      if (section === "fornecedores") setFornecedorDraft(emptyDraft); else setClienteDraft(emptyDraft);
      await loadData();
      setNotice(section === "fornecedores" ? "Fornecedor adicionado." : "Cliente adicionado.");
      (section === "fornecedores" ? fornecedorCodeRef : clienteCodeRef).current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o cadastro.");
    } finally { setSaving(false); }
  };

  const startEdit = (section: Section, item: Item) => {
    setError(""); setNotice("");
    setEditing({ section, id: item.id });
    setEditDraft({ codigo: item.codigo, nome: item.nome, email: item.email ?? "", telefone: item.telefone ?? "", documento: item.documento, endereco: item.endereco });
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    if (!editDraft.codigo.trim() || !editDraft.nome.trim()) { setError("Código e nome são obrigatórios."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await request(`/api/${editing.section}/${editing.id}`, "PUT", editDraft);
      setEditing(null);
      await loadData();
      setNotice(editing.section === "fornecedores" ? "Fornecedor atualizado." : "Cliente atualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a edição.");
    } finally { setSaving(false); }
  };

  const deactivate = async (section: Section, item: Item) => {
    if (!window.confirm(`Desativar ${section === "fornecedores" ? "fornecedor" : "cliente"} ${item.nome}?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request(`/api/${section}/${item.id}`, "DELETE");
      if (editing?.id === item.id) setEditing(null);
      await loadData();
      setNotice(section === "fornecedores" ? "Fornecedor desativado." : "Cliente desativado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desativar o cadastro.");
    } finally { setSaving(false); }
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter") { event.preventDefault(); void saveEdit(); }
    if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
  };

  const query = busca.trim().toLocaleLowerCase("pt-BR");
  const filter = (items: Item[]) => items.filter(item => !query || item.codigo.toLocaleLowerCase("pt-BR").includes(query) || item.nome.toLocaleLowerCase("pt-BR").includes(query));
  const filteredSuppliers = filter(fornecedores);
  const filteredCustomers = filter(clientes);
  const count = (visible: number, total: number) => loading ? "Carregando..." : query ? `${visible} de ${total} ${total === 1 ? "ativo" : "ativos"}` : `${total} ${total === 1 ? "ativo" : "ativos"}`;

  const renderRows = (section: Section, items: Item[]) => items.map(item => {
    const isEditing = editing?.section === section && editing.id === item.id;
    return <tr key={item.id} className={isEditing ? "editing" : undefined} onKeyDown={isEditing ? onEditKeyDown : undefined}>
      {isEditing ? <>
        <td><input className="cell-input" aria-label="Editar código" value={editDraft.codigo} onChange={event => setEditDraft(draft => ({ ...draft, codigo: event.target.value }))} /></td>
        <td><input className="cell-input" aria-label="Editar nome" autoFocus value={editDraft.nome} onChange={event => setEditDraft(draft => ({ ...draft, nome: event.target.value }))} /></td>
        {section === "clientes" && <>
          <td><input className="cell-input" aria-label="Editar email" type="email" value={editDraft.email} onChange={event => setEditDraft(draft => ({ ...draft, email: event.target.value }))} /></td>
          <td><input className="cell-input" aria-label="Editar telefone" value={editDraft.telefone} onChange={event => setEditDraft(draft => ({ ...draft, telefone: event.target.value }))} /></td>
        </>}
        <td className="registration-actions"><button type="button" className="action-btn registration-save" aria-label="Salvar edição" title="Salvar" disabled={saving} onClick={() => void saveEdit()}>✓</button><button type="button" className="action-btn" aria-label="Cancelar edição" title="Cancelar" onClick={() => setEditing(null)}>✕</button></td>
      </> : <>
        <td className="registration-code">{item.codigo}</td><td>{item.nome}</td>
        {section === "clientes" && <><td className="registration-secondary">{item.email || "—"}</td><td>{item.telefone || "—"}</td></>}
        <td className="registration-actions"><button type="button" className="action-btn" aria-label={`Editar ${item.nome}`} title="Editar" disabled={saving} onClick={() => startEdit(section, item)}>✎</button><button type="button" className="action-btn registration-danger" aria-label={`Desativar ${item.nome}`} title="Desativar" disabled={saving} onClick={() => void deactivate(section, item)}>✕</button></td>
      </>}
    </tr>;
  });

  return <div className="registration-page">
    <header className="topbar"><div><h1 className="page-title">Dimensões Cadastrais</h1><p className="page-sub">Estrutura Empresa — Fornecedores e Clientes</p></div></header>
    <main className="registration-content">
      <div className="registration-toolbar">
        <label className="registration-search"><span className="registration-visually-hidden">Buscar por código ou nome</span><input className="filter-input" value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar por código ou nome" /></label>
        <div className="registration-totals"><span>Fornecedores: {count(filteredSuppliers.length, fornecedores.length)}</span><span>Clientes: {count(filteredCustomers.length, clientes.length)}</span></div>
      </div>
      {error && <div className="alert alert-error registration-message" role="alert">{error}</div>}
      {notice && <div className="registration-message registration-success" role="status">{notice}</div>}
      <div className="registration-grid">
        <section className="registration-card" aria-labelledby="fornecedores-title">
          <div className="registration-card-heading"><h2 id="fornecedores-title">Fornecedores</h2><span>{count(filteredSuppliers.length, fornecedores.length)}</span></div>
          <form className="registration-form supplier-form" onSubmit={event => void create("fornecedores", event)} onKeyDown={event => { if (event.key === "Escape") { setFornecedorDraft(emptyDraft); setError(""); fornecedorCodeRef.current?.focus(); } }}>
            <label>Código<input ref={fornecedorCodeRef} value={fornecedorDraft.codigo} onChange={event => setFornecedorDraft(draft => ({ ...draft, codigo: event.target.value }))} placeholder="F001" /></label>
            <label>Nome<input value={fornecedorDraft.nome} onChange={event => setFornecedorDraft(draft => ({ ...draft, nome: event.target.value }))} placeholder="Nome do fornecedor" /></label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ Adicionar</button>
          </form>
          <div className="registration-table-scroll"><table className="data-table registration-table supplier-table"><thead><tr><th>Código</th><th>Nome</th><th>Ações</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={3} className="registration-empty" role="status">Carregando fornecedores...</td></tr> : <>{renderRows("fornecedores", filteredSuppliers)}{filteredSuppliers.length === 0 && <tr><td colSpan={3} className="registration-empty">{query ? "Nenhum fornecedor encontrado para a busca." : "Nenhum fornecedor ativo cadastrado."}</td></tr>}</>}
          </tbody></table></div>
        </section>
        <section className="registration-card" aria-labelledby="clientes-title">
          <div className="registration-card-heading"><h2 id="clientes-title">Clientes</h2><span>{count(filteredCustomers.length, clientes.length)}</span></div>
          <form className="registration-form customer-form" onSubmit={event => void create("clientes", event)} onKeyDown={event => { if (event.key === "Escape") { setClienteDraft(emptyDraft); setError(""); clienteCodeRef.current?.focus(); } }}>
            <label>Código<input ref={clienteCodeRef} value={clienteDraft.codigo} onChange={event => setClienteDraft(draft => ({ ...draft, codigo: event.target.value }))} placeholder="C001" /></label>
            <label>Nome<input value={clienteDraft.nome} onChange={event => setClienteDraft(draft => ({ ...draft, nome: event.target.value }))} placeholder="Nome do cliente" /></label>
            <label>Email<input type="email" value={clienteDraft.email} onChange={event => setClienteDraft(draft => ({ ...draft, email: event.target.value }))} placeholder="email@exemplo.com" /></label>
            <label>Telefone<input value={clienteDraft.telefone} onChange={event => setClienteDraft(draft => ({ ...draft, telefone: event.target.value }))} placeholder="(00) 00000-0000" /></label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ Adicionar</button>
          </form>
          <div className="registration-table-scroll"><table className="data-table registration-table customer-table"><thead><tr><th>Código</th><th>Nome</th><th>Email</th><th>Telefone</th><th>Ações</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={5} className="registration-empty" role="status">Carregando clientes...</td></tr> : <>{renderRows("clientes", filteredCustomers)}{filteredCustomers.length === 0 && <tr><td colSpan={5} className="registration-empty">{query ? "Nenhum cliente encontrado para a busca." : "Nenhum cliente ativo cadastrado."}</td></tr>}</>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  </div>;
}
