"use client";
import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react";
import FinancialImportModal from "@/components/estrutura/FinancialImportModal";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";
import "./dimensoes-financeiras.css";

interface Categoria { id: string; codigo: string; nome: string; tipo?: string | null }
interface Conta { id: string; codigo: string | null; descricao: string; tipo: string; categoriaId: string | null }

export default function DimensoesFinanceirasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]), [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState(""), [showImport, setShowImport] = useState(false);
  const [catCodigo, setCatCodigo] = useState(""), [catNome, setCatNome] = useState("");
  const [contaCodigo, setContaCodigo] = useState(""), [contaDescricao, setContaDescricao] = useState("");
  const [contaTipo, setContaTipo] = useState(""), [contaCategoria, setContaCategoria] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null), [editSection, setEditSection] = useState<"cat" | "conta" | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const catCodigoRef = useRef<HTMLInputElement>(null), contaCodigoRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [catRes, contaRes] = await Promise.all([fetch("/api/categorias"), fetch("/api/plano-contas")]);
      if (!catRes.ok || !contaRes.ok) throw Error();
      const cats = await catRes.json(), accounts = await contaRes.json();
      if (!Array.isArray(cats) || !Array.isArray(accounts)) throw Error();
      setCategorias(cats); setContas(accounts); setError("");
    } catch { setLoadFailed(true); setError("Não foi possível carregar as dimensões financeiras. Tente atualizar a página."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const cancelEdit = () => { setEditingId(null); setEditSection(null); setEditData({}); };
  const edit = (section: "cat" | "conta", item: Categoria | Conta) => {
    setEditingId(item.id); setEditSection(section);
    if (section === "cat") { const c = item as Categoria; setEditData({ codigo: c.codigo, nome: c.nome, tipo: c.tipo || "" }); }
    else { const c = item as Conta; setEditData({ codigo: c.codigo || "", descricao: c.descricao, tipo: c.tipo, categoriaId: c.categoriaId || "" }); }
  };
  const editKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") { event.preventDefault(); void salvarEdit(); }
    if (event.key === "Escape") { event.preventDefault(); cancelEdit(); }
  };
  async function send(url: string, method: string, body?: object) {
    const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const failure = await response.json().catch(() => ({})); throw Error(failure.error || "Não foi possível concluir a operação."); }
  }
  async function run(action: () => Promise<void>, success: string) {
    setError(""); setNotice(""); setSaving(true);
    try { await action(); await loadData(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Verifique a conexão."); }
    finally { setSaving(false); }
  }
  const criarCategoria = async () => {
    if (!catCodigo.trim() || !catNome.trim()) { setError("Código e nome da Categoria são obrigatórios."); return; }
    await run(async () => { await send("/api/categorias", "POST", { codigo: catCodigo, nome: catNome }); setCatCodigo(""); setCatNome(""); }, "Categoria incluída.");
    catCodigoRef.current?.focus();
  };
  const criarConta = async () => {
    if (!contaCodigo.trim() || !contaDescricao.trim()) { setError("Código e descrição da Conta são obrigatórios."); return; }
    if (!contaCategoria) { setError("Selecione a Categoria da Conta."); return; }
    if (!contaTipo) { setError("Selecione o tipo da Conta."); return; }
    await run(async () => { await send("/api/plano-contas", "POST", { codigo: contaCodigo, descricao: contaDescricao, tipo: contaTipo, categoriaId: contaCategoria }); setContaCodigo(""); setContaDescricao(""); setContaCategoria(""); setContaTipo(""); }, "Conta incluída.");
    contaCodigoRef.current?.focus();
  };
  const salvarEdit = async () => {
    if (!editingId || !editSection) return;
    if (!editData.codigo?.trim() || !(editSection === "cat" ? editData.nome : editData.descricao)?.trim()) { setError("Código e descrição são obrigatórios."); return; }
    if (editSection === "conta" && !editData.categoriaId) { setError("Selecione uma Categoria ativa para salvar a Conta."); return; }
    const url = editSection === "cat" ? "/api/categorias" : "/api/plano-contas";
    const body = editSection === "cat" ? { codigo: editData.codigo, nome: editData.nome, tipo: editData.tipo || null } : { codigo: editData.codigo, descricao: editData.descricao, tipo: editData.tipo, categoriaId: editData.categoriaId };
    await run(async () => { await send(`${url}/${editingId}`, "PUT", body); cancelEdit(); }, "Alteração salva.");
  };
  const excluir = async (id: string, section: "cat" | "conta") => {
    if (!confirm("Desativar?")) return;
    await run(() => send(`${section === "cat" ? "/api/categorias" : "/api/plano-contas"}/${id}`, "DELETE"), "Cadastro desativado.");
  };

  const term = busca.trim().toLocaleLowerCase("pt-BR");
  const matches = (values: (string | null | undefined)[]) => !term || values.some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
  const grouped = categorias.map(cat => { const parentMatch = matches([cat.codigo, cat.nome]); const children = contas.filter(c => c.categoriaId === cat.id && (parentMatch || matches([c.codigo, c.descricao, c.tipo]))); return { cat, children, visible: parentMatch || children.length > 0 }; }).filter(g => g.visible);
  const orphanAccounts = contas.filter(c => !categorias.some(cat => cat.id === c.categoriaId));
  const visibleOrphans = orphanAccounts.filter(c => matches([c.codigo, c.descricao, c.tipo]));
  const visibleCount = grouped.length + grouped.reduce((total, g) => total + g.children.length, 0) + visibleOrphans.length;

  const categoryRow = (cat: Categoria, count: number) => <tr key={`cat-${cat.id}`} className="financial-category-row">
    {editingId === cat.id && editSection === "cat" ? <>
      <td><input className="cell-input" aria-label="Código da Categoria" value={editData.codigo || ""} onChange={e => setEditData(d => ({ ...d, codigo: e.target.value }))} onKeyDown={editKey} /></td>
      <td><input className="cell-input" aria-label="Nome da Categoria" value={editData.nome || ""} onChange={e => setEditData(d => ({ ...d, nome: e.target.value }))} onKeyDown={editKey} autoFocus /></td><td>Categoria N1</td><td>{count} {count === 1 ? "Conta" : "Contas"}</td>
      <td><button className="action-btn" aria-label="Salvar Categoria" onClick={() => void salvarEdit()} disabled={saving}>✓</button><button className="action-btn" aria-label="Cancelar edição" onClick={cancelEdit}>✕</button></td>
    </> : <><td><strong>{cat.codigo}</strong></td><td><strong>{cat.nome}</strong></td><td>Categoria N1</td><td>{count} {count === 1 ? "Conta" : "Contas"}</td><td><button className="action-btn" aria-label={`Editar Categoria ${cat.codigo}`} onClick={() => edit("cat", cat)}>✏️</button><button className="action-btn" aria-label={`Desativar Categoria ${cat.codigo}`} onClick={() => void excluir(cat.id, "cat")}>🗑️</button></td></>}
  </tr>;
  const accountRow = (account: Conta, orphan = false) => <tr key={`account-${account.id}`} className="financial-account-row">
    {editingId === account.id && editSection === "conta" ? <>
      <td><input className="cell-input" aria-label="Código da Conta" value={editData.codigo || ""} onChange={e => setEditData(d => ({ ...d, codigo: e.target.value }))} onKeyDown={editKey} /></td>
      <td><input className="cell-input" aria-label="Descrição da Conta" value={editData.descricao || ""} onChange={e => setEditData(d => ({ ...d, descricao: e.target.value }))} onKeyDown={editKey} autoFocus /></td>
      <td><select className="cell-input" aria-label="Tipo da Conta" value={editData.tipo || ""} onChange={e => setEditData(d => ({ ...d, tipo: e.target.value }))} onKeyDown={editKey}>{FINANCIAL_ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></td>
      <td><select className="cell-input" aria-label="Categoria da Conta" value={editData.categoriaId || ""} onChange={e => setEditData(d => ({ ...d, categoriaId: e.target.value }))} onKeyDown={editKey}><option value="">Selecione</option>{categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.codigo} | {cat.nome}</option>)}</select></td>
      <td><button className="action-btn" aria-label="Salvar Conta" onClick={() => void salvarEdit()} disabled={saving}>✓</button><button className="action-btn" aria-label="Cancelar edição" onClick={cancelEdit}>✕</button></td>
    </> : <><td><span className="financial-account-indent">↳</span>{account.codigo || "Sem código"}</td><td>{account.descricao}</td><td><span className={`chip ${account.tipo === "RECEITA" ? "chip-entrada" : account.tipo === "DESPESA" ? "chip-saida" : "chip-cancelado"}`}>{account.tipo}</span></td><td>{orphan ? "Sem Categoria ativa" : categorias.find(cat => cat.id === account.categoriaId)?.codigo}</td><td><button className="action-btn" aria-label={`Editar Conta ${account.codigo || account.descricao}`} onClick={() => edit("conta", account)}>✏️</button><button className="action-btn" aria-label={`Desativar Conta ${account.codigo || account.descricao}`} onClick={() => void excluir(account.id, "conta")}>🗑️</button></td></>}
  </tr>;

  return <div className="financial-page"><header className="topbar"><div><h1 className="page-title">Dimensões Financeiras</h1><p className="page-sub">Estrutura Empresa — Categoria N1 e Conta N2</p></div></header><div className="financial-content">
    {error && <div className="alert alert-error financial-message" role="alert">{error}</div>}
    {notice && !error && <div className="alert financial-message financial-success" role="status">{notice}</div>}
    {orphanAccounts.length > 0 && <div className="alert alert-error financial-message" role="alert">{orphanAccounts.length} {orphanAccounts.length === 1 ? "Conta ativa precisa" : "Contas ativas precisam"} de Categoria ativa. Edite e classifique antes de exportar.</div>}
    <div className="financial-toolbar"><div className="form-group financial-search"><label htmlFor="financial-search">Busca</label><input id="financial-search" type="search" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código, nome ou descrição..." /></div><span className="financial-count" aria-live="polite">{loadFailed ? "Cadastros indisponíveis" : loading && !categorias.length && !contas.length ? "Carregando cadastros..." : `${visibleCount} cadastros (${grouped.length} categorias, ${visibleCount - grouped.length} contas)`}</span><div className="financial-actions"><button type="button" className="btn btn-secondary" onClick={() => void loadData()} disabled={loading || saving}>Atualizar</button><button type="button" className="btn btn-primary" onClick={() => setShowImport(true)}>Importar Estrutura Financeira</button></div></div>
    {loading && <div className="financial-loading" role="status">Carregando cadastros financeiros...</div>}
    <section className="financial-card financial-tree-card" aria-busy={loading}><h3>ESTRUTURA FINANCEIRA · CATEGORIA N1 → CONTA N2</h3><div className="financial-forms">
      <form className="financial-add financial-add--category" onSubmit={e => { e.preventDefault(); void criarCategoria(); }}><strong className="financial-form-label">Nova Categoria N1</strong><div className="form-group"><label htmlFor="financial-cat-code">Código</label><input id="financial-cat-code" ref={catCodigoRef} type="text" value={catCodigo} onChange={e => setCatCodigo(e.target.value)} placeholder="05" /></div><div className="form-group"><label htmlFor="financial-cat-name">Nome</label><input id="financial-cat-name" type="text" value={catNome} onChange={e => setCatNome(e.target.value)} placeholder="CUSTOS VARIÁVEIS" /></div><button type="submit" className="btn btn-primary financial-add-button" aria-label="Incluir Categoria" disabled={saving || loading}>+</button></form>
      <form className="financial-add financial-add--account" onSubmit={e => { e.preventDefault(); void criarConta(); }}><strong className="financial-form-label">Nova Conta N2</strong><div className="form-group"><label htmlFor="financial-account-code">Código</label><input id="financial-account-code" ref={contaCodigoRef} type="text" value={contaCodigo} onChange={e => setContaCodigo(e.target.value)} placeholder="05.04" /></div><div className="form-group"><label htmlFor="financial-account-description">Descrição</label><input id="financial-account-description" type="text" value={contaDescricao} onChange={e => setContaDescricao(e.target.value)} placeholder="Bebidas" /></div><div className="form-group"><label htmlFor="financial-account-category">Categoria</label><select id="financial-account-category" value={contaCategoria} onChange={e => setContaCategoria(e.target.value)}><option value="">Selecione</option>{categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.codigo} | {cat.nome}</option>)}</select></div><div className="form-group"><label htmlFor="financial-account-type">Tipo</label><select id="financial-account-type" value={contaTipo} onChange={e => setContaTipo(e.target.value)}><option value="">Selecione</option>{FINANCIAL_ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></div><button type="submit" className="btn btn-primary financial-add-button" aria-label="Incluir Conta" disabled={saving || loading}>+</button></form>
    </div><div className="financial-table-scroll"><table className="data-table financial-table financial-tree-table"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo / nível</th><th>Categoria / Contas</th><th>Ações</th></tr></thead><tbody>
      {grouped.map(({ cat, children }) => [categoryRow(cat, children.length), ...children.map(account => accountRow(account))])}
      {visibleOrphans.length > 0 && <tr className="financial-legacy-row"><td colSpan={5}>CONTAS ATIVAS SEM CATEGORIA VÁLIDA — classifique antes de editar/exportar</td></tr>}
      {visibleOrphans.map(account => accountRow(account, true))}
      {!visibleCount && <tr><td colSpan={5} className="financial-empty">{loading ? "Carregando..." : loadFailed ? "Não foi possível carregar a estrutura." : term ? "Nenhum cadastro encontrado para a busca." : "Nenhuma Categoria ou Conta cadastrada."}</td></tr>}
    </tbody></table></div></section>
  </div>{showImport && <FinancialImportModal onClose={() => setShowImport(false)} onImported={() => void loadData()} />}</div>;
}
