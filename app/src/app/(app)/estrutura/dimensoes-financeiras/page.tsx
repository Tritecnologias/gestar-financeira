"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import "./dimensoes-financeiras.css";

interface Categoria { id: string; codigo: string; nome: string; descricao?: string; tipo?: string; }
interface Conta { id: string; codigo: string; descricao: string; tipo?: string; categoriaId?: string; categoriaCodigo?: string; }

export default function DimensoesFinanceirasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const catCodigoRef = useRef<HTMLInputElement>(null);
  const contaCodigoRef = useRef<HTMLInputElement>(null);

  // Form Categoria
  const [catCodigo, setCatCodigo] = useState("");
  const [catNome, setCatNome] = useState("");
  const [catDescricao, setCatDescricao] = useState("");

  // Form Conta
  const [contaCodigo, setContaCodigo] = useState("");
  const [contaDescricao, setContaDescricao] = useState("");
  const [contaTipo, setContaTipo] = useState("");
  const [contaCategoria, setContaCategoria] = useState("");

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editSection, setEditSection] = useState<"cat" | "conta" | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [catRes, contaRes] = await Promise.all([
        fetch("/api/categorias"),
        fetch("/api/plano-contas"),
      ]);
      if (!catRes.ok || !contaRes.ok) throw new Error("Falha ao consultar os cadastros.");
      const catData = await catRes.json();
      const contaData = await contaRes.json();
      if (!Array.isArray(catData) || !Array.isArray(contaData)) throw new Error("Resposta inválida dos cadastros.");
      setCategorias(catData);
      setContas(contaData);
      setError("");
    } catch {
      setLoadFailed(true);
      setError("Não foi possível carregar as dimensões financeiras. Tente atualizar a página.");
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Criar Categoria
  const criarCategoria = async () => {
    if (!catCodigo.trim() || !catNome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch("/api/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: catCodigo, nome: catNome, tipo: catDescricao || null }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível incluir a Categoria."); return; }
      setCatCodigo(""); setCatNome(""); setCatDescricao("");
      await loadData();
      setNotice("Categoria incluída.");
      catCodigoRef.current?.focus();
    } catch { setError("Não foi possível incluir a Categoria. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  // Criar Conta
  const criarConta = async () => {
    if (!contaCodigo.trim() || !contaDescricao.trim()) { setError("Código e descrição são obrigatórios"); return; }
    setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch("/api/plano-contas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: contaCodigo, descricao: contaDescricao, tipo: contaTipo || "DESPESA", paiId: null }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível incluir a Conta."); return; }
      setContaCodigo(""); setContaDescricao(""); setContaTipo(""); setContaCategoria("");
      await loadData();
      setNotice("Conta incluída.");
      contaCodigoRef.current?.focus();
    } catch { setError("Não foi possível incluir a Conta. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return;
    setError(""); setNotice("");
    setSaving(true);
    const api = editSection === "cat" ? "/api/categorias" : "/api/plano-contas";
    const body = editSection === "cat" ? { codigo: editData.codigo, nome: editData.nome, tipo: editData.tipo } : { codigo: editData.codigo, descricao: editData.descricao, tipo: editData.tipo };
    try {
      const res = await fetch(`${api}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível salvar a edição."); return; }
      setEditingId(null); setEditSection(null);
      await loadData();
      setNotice("Alteração salva.");
    } catch { setError("Não foi possível salvar a edição. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const excluir = async (id: string, section: "cat" | "conta") => {
    if (!confirm("Desativar?")) return;
    const api = section === "cat" ? "/api/categorias" : "/api/plano-contas";
    setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch(`${api}/${id}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível desativar o cadastro."); return; }
      await loadData();
      setNotice("Cadastro desativado.");
    } catch { setError("Não foi possível desativar o cadastro. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const termoBusca = busca.trim().toLocaleLowerCase("pt-BR");
  const categoriasVisiveis = categorias.filter(c => !termoBusca || [c.codigo, c.nome, c.tipo].some(v => v?.toLocaleLowerCase("pt-BR").includes(termoBusca)));
  const contasVisiveis = contas.filter(c => !termoBusca || [c.codigo, c.descricao, c.tipo].some(v => v?.toLocaleLowerCase("pt-BR").includes(termoBusca)));
  const totalVisivel = categoriasVisiveis.length + contasVisiveis.length;

  return (
    <div className="financial-page">
      <header className="topbar">
        <div>
          <h1 className="page-title">Dimensões Financeiras</h1>
          <p className="page-sub">Estrutura Empresa — Categoria N1 e Conta N2</p>
        </div>
      </header>

      <div className="financial-content">
        {error && <div className="alert alert-error financial-message" role="alert">{error}</div>}
        {notice && !error && <div className="alert financial-message financial-success" role="status">{notice}</div>}

        <div className="financial-toolbar">
          <div className="form-group financial-search"><label htmlFor="financial-search">Busca</label><input id="financial-search" type="search" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código, nome ou descrição..." /></div>
          <span className="financial-count" aria-live="polite">{loadFailed ? "Cadastros indisponíveis" : loading && categorias.length === 0 && contas.length === 0 ? "Carregando cadastros..." : <>{totalVisivel} {totalVisivel === 1 ? "cadastro" : "cadastros"} ({categoriasVisiveis.length} {categoriasVisiveis.length === 1 ? "categoria" : "categorias"}, {contasVisiveis.length} {contasVisiveis.length === 1 ? "conta" : "contas"})</>}</span>
          <div className="financial-actions"><button type="button" className="btn btn-secondary" onClick={() => void loadData()} disabled={loading || saving}>Atualizar</button></div>
        </div>

        {loading && <div className="financial-loading" role="status">Carregando cadastros financeiros...</div>}

        <div className="financial-grid" aria-busy={loading}>
          {/* BLOCO 1: CATEGORIA N1 */}
          <section className="financial-card">
            <h3>📋 CATEGORIA N1</h3>
            <form className="financial-add financial-add--category" onSubmit={e => { e.preventDefault(); void criarCategoria(); }}>
              <div className="form-group"><label htmlFor="financial-cat-code">Código</label><input id="financial-cat-code" ref={catCodigoRef} type="text" value={catCodigo} onChange={e => setCatCodigo(e.target.value)} placeholder="01" /></div>
              <div className="form-group"><label htmlFor="financial-cat-name">Nome</label><input id="financial-cat-name" type="text" value={catNome} onChange={e => setCatNome(e.target.value)} placeholder="RECEITA OPERACIONAL" /></div>
              <button type="submit" className="btn btn-primary financial-add-button" aria-label="Incluir Categoria" disabled={saving || loading}>+</button>
            </form>
            <div className="financial-table-scroll">
            <table className="data-table financial-table financial-table--category">
              <thead><tr><th>#</th><th>Cód</th><th>Nome</th><th>Código | Nome</th><th>Ações</th></tr></thead>
              <tbody>
                {categoriasVisiveis.map((c, i) => (
                  <tr key={c.id}>
                    {editingId === c.id && editSection === "cat" ? (
                      <>
                        <td>{i + 1}</td>
                        <td><input className="cell-input" aria-label="Código da Categoria" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")void salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} /></td>
                        <td><input className="cell-input" value={editData.nome||""} onChange={e => setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td>
                        <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{editData.codigo} | {editData.nome}</td>
                        <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td>
                      </>
                    ) : (
                      <>
                        <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                        <td><span style={{ fontWeight: 600 }}>{c.codigo}</span></td>
                        <td>{c.nome}</td>
                        <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.codigo} | {c.nome}</td>
                        <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("cat");setEditData({...c});}}>✏️</button><button className="action-btn" onClick={()=>excluir(c.id,"cat")}>🗑️</button></td>
                      </>
                    )}
                  </tr>
                ))}
                {categoriasVisiveis.length === 0 && <tr><td colSpan={5} className="financial-empty">{loading ? "Carregando..." : loadFailed ? "Não foi possível carregar Categorias." : busca.trim() ? "Nenhuma Categoria encontrada para a busca." : "Nenhuma categoria cadastrada"}</td></tr>}
              </tbody>
            </table>
            </div>
          </section>

          {/* BLOCO 2: CONTA N2 */}
          <section className="financial-card">
            <h3>📑 CONTA N2</h3>
            <form className="financial-add financial-add--account" onSubmit={e => { e.preventDefault(); void criarConta(); }}>
              <div className="form-group"><label htmlFor="financial-account-code">Código</label><input id="financial-account-code" ref={contaCodigoRef} type="text" value={contaCodigo} onChange={e => setContaCodigo(e.target.value)} placeholder="01.06" /></div>
              <div className="form-group"><label htmlFor="financial-account-description">Descrição</label><input id="financial-account-description" type="text" value={contaDescricao} onChange={e => setContaDescricao(e.target.value)} placeholder="Operacional" /></div>
              <div className="form-group"><label htmlFor="financial-account-category">Categoria</label>
                <select id="financial-account-category" value={contaCategoria} onChange={e => setContaCategoria(e.target.value)}>
                  <option value="">—</option>
                  {categorias.map(c => <option key={c.id} value={c.codigo}>{c.codigo} | {c.nome}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary financial-add-button" aria-label="Incluir Conta" disabled={saving || loading}>+</button>
            </form>
            <div className="financial-table-scroll">
            <table className="data-table financial-table financial-table--account">
              <thead><tr><th>#</th><th>Cód</th><th>Descrição</th><th>Tipo</th><th>Ações</th></tr></thead>
              <tbody>
                {contasVisiveis.map((c, i) => (
                  <tr key={c.id}>
                    {editingId === c.id && editSection === "conta" ? (
                      <>
                        <td>{i + 1}</td>
                        <td><input className="cell-input" aria-label="Código da Conta" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")void salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} /></td>
                        <td><input className="cell-input" value={editData.descricao||""} onChange={e => setEditData((d:any)=>({...d,descricao:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td>
                        <td><select className="cell-input" aria-label="Tipo da Conta" value={editData.tipo||""} onChange={e=>setEditData((d:any)=>({...d,tipo:e.target.value}))} onKeyDown={e=>{if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}}><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option><option value="TRANSFERENCIA">Transf.</option></select></td>
                        <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td>
                      </>
                    ) : (
                      <>
                        <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                        <td><span style={{ fontWeight: 600 }}>{c.codigo}</span></td>
                        <td>{c.descricao}</td>
                        <td><span className={`chip ${c.tipo === "RECEITA" ? "chip-entrada" : c.tipo === "DESPESA" ? "chip-saida" : "chip-cancelado"}`} style={{ fontSize: 10 }}>{c.tipo || "—"}</span></td>
                        <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("conta");setEditData({...c});}}>✏️</button><button className="action-btn" onClick={()=>excluir(c.id,"conta")}>🗑️</button></td>
                      </>
                    )}
                  </tr>
                ))}
                {contasVisiveis.length === 0 && <tr><td colSpan={5} className="financial-empty">{loading ? "Carregando..." : loadFailed ? "Não foi possível carregar Contas." : busca.trim() ? "Nenhuma Conta encontrada para a busca." : "Nenhuma conta cadastrada"}</td></tr>}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
