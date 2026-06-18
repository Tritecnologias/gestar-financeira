"use client";
import { useState, useEffect, useCallback } from "react";

interface Categoria { id: string; codigo: string; nome: string; descricao?: string; tipo?: string; }
interface Conta { id: string; codigo: string; descricao: string; tipo?: string; categoriaId?: string; categoriaCodigo?: string; }

export default function DimensoesFinanceirasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      const [catRes, contaRes] = await Promise.all([
        fetch("/api/categorias"),
        fetch("/api/plano-contas"),
      ]);
      const catData = await catRes.json();
      const contaData = await contaRes.json();
      if (Array.isArray(catData)) setCategorias(catData);
      if (Array.isArray(contaData)) setContas(contaData);
    } catch { setError("Erro ao carregar dados"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Criar Categoria
  const criarCategoria = async () => {
    if (!catCodigo.trim() || !catNome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: catCodigo, nome: catNome, tipo: catDescricao || null }) });
      if (res.ok) { setCatCodigo(""); setCatNome(""); setCatDescricao(""); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  // Criar Conta
  const criarConta = async () => {
    if (!contaCodigo.trim() || !contaDescricao.trim()) { setError("Código e descrição são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/plano-contas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: contaCodigo, descricao: contaDescricao, tipo: contaTipo || "DESPESA", paiId: null }) });
      if (res.ok) { setContaCodigo(""); setContaDescricao(""); setContaTipo(""); setContaCategoria(""); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const api = editSection === "cat" ? "/api/categorias" : "/api/plano-contas";
    const body = editSection === "cat" ? { codigo: editData.codigo, nome: editData.nome, tipo: editData.tipo } : { codigo: editData.codigo, descricao: editData.descricao, tipo: editData.tipo };
    try {
      const res = await fetch(`${api}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setEditingId(null); setEditSection(null); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string, section: "cat" | "conta") => {
    if (!confirm("Desativar?")) return;
    const api = section === "cat" ? "/api/categorias" : "/api/plano-contas";
    await fetch(`${api}/${id}`, { method: "DELETE" });
    loadData();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dimensões Financeiras</h1>
          <p className="page-sub">Estrutura Empresa — Categoria N1 e Conta N2</p>
        </div>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* BLOCO 1: CATEGORIA N1 */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>📋 CATEGORIA N1</h3>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "flex-end" }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={catCodigo} onChange={e => setCatCodigo(e.target.value)} placeholder="01" style={{ width: 60 }} /></div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}><label>Nome</label><input type="text" value={catNome} onChange={e => setCatNome(e.target.value)} placeholder="RECEITA OPERACIONAL" /></div>
              <button className="btn btn-primary btn-sm" onClick={criarCategoria} disabled={saving}>+</button>
            </div>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 50 }}>Cód</th><th>Nome</th><th style={{ width: 140 }}>Código | Nome</th><th style={{ width: 70, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {categorias.map((c, i) => (
                  <tr key={c.id}>
                    {editingId === c.id && editSection === "cat" ? (
                      <>
                        <td>{i + 1}</td>
                        <td><input className="cell-input" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{ width: 40 }} /></td>
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
                {categorias.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>Nenhuma categoria cadastrada</td></tr>}
              </tbody>
            </table>
          </div>

          {/* BLOCO 2: CONTA N2 */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>📑 CONTA N2</h3>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "flex-end" }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={contaCodigo} onChange={e => setContaCodigo(e.target.value)} placeholder="01.06" style={{ width: 70 }} /></div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}><label>Descrição</label><input type="text" value={contaDescricao} onChange={e => setContaDescricao(e.target.value)} placeholder="Operacional" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Categoria</label>
                <select value={contaCategoria} onChange={e => setContaCategoria(e.target.value)} style={{ width: 140 }}>
                  <option value="">—</option>
                  {categorias.map(c => <option key={c.id} value={c.codigo}>{c.codigo} | {c.nome}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={criarConta} disabled={saving}>+</button>
            </div>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 60 }}>Cód</th><th>Descrição</th><th style={{ width: 90 }}>Tipo</th><th style={{ width: 70, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {contas.map((c, i) => (
                  <tr key={c.id}>
                    {editingId === c.id && editSection === "conta" ? (
                      <>
                        <td>{i + 1}</td>
                        <td><input className="cell-input" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{ width: 50 }} /></td>
                        <td><input className="cell-input" value={editData.descricao||""} onChange={e => setEditData((d:any)=>({...d,descricao:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td>
                        <td><select className="cell-input" value={editData.tipo||""} onChange={e=>setEditData((d:any)=>({...d,tipo:e.target.value}))}><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option><option value="TRANSFERENCIA">Transf.</option></select></td>
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
                {contas.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>Nenhuma conta cadastrada</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
