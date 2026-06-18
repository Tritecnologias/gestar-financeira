"use client";
import { useState, useEffect, useCallback } from "react";

interface Fornecedor { id: string; codigo: string; nome: string; }
interface Cliente { id: string; codigo: string; nome: string; email?: string; telefone?: string; documento?: string; }

export default function DimensoesCadastraisPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");

  // Forms
  const [fCodigo, setFCodigo] = useState("");
  const [fNome, setFNome] = useState("");
  const [cCodigo, setCCodigo] = useState("");
  const [cNome, setCNome] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cTelefone, setCTelefone] = useState("");

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editSection, setEditSection] = useState<"f" | "c" | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, cRes] = await Promise.all([fetch("/api/fornecedores"), fetch("/api/clientes")]);
      const fData = await fRes.json();
      const cData = await cRes.json();
      if (Array.isArray(fData)) setFornecedores(fData);
      if (Array.isArray(cData)) setClientes(cData);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const criarFornecedor = async () => {
    if (!fCodigo.trim() || !fNome.trim()) { setError("Código e nome obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/fornecedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: fCodigo, nome: fNome }) });
      if (res.ok) { setFCodigo(""); setFNome(""); loadData(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const criarCliente = async () => {
    if (!cCodigo.trim() || !cNome.trim()) { setError("Código e nome obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: cCodigo, nome: cNome, email: cEmail, telefone: cTelefone }) });
      if (res.ok) { setCCodigo(""); setCNome(""); setCEmail(""); setCTelefone(""); loadData(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true);
    const api = editSection === "f" ? "/api/fornecedores" : "/api/clientes";
    try {
      const res = await fetch(`${api}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); setEditSection(null); loadData(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string, section: "f" | "c") => {
    if (!confirm("Desativar?")) return;
    await fetch(`${section === "f" ? "/api/fornecedores" : "/api/clientes"}/${id}`, { method: "DELETE" });
    loadData();
  };

  // Filtro de busca em ambas listas
  const filteredF = fornecedores.filter(f => !busca || f.nome.toLowerCase().includes(busca.toLowerCase()) || f.codigo.toLowerCase().includes(busca.toLowerCase()));
  const filteredC = clientes.filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase()));

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensões Cadastrais</h1><p className="page-sub">Estrutura Empresa — Fornecedores e Clientes</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Busca global */}
        <div style={{ marginBottom: 16 }}>
          <input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar por nome ou código (filtra fornecedores e clientes)" style={{ width: "100%", maxWidth: 400 }} />
        </div>

        {/* BLOCO 1: FORNECEDORES */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏭 Fornecedores</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={fCodigo} onChange={e => setFCodigo(e.target.value)} placeholder="F001" style={{ width: 80 }} /></div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: 300 }}><label>Nome</label><input type="text" value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Suprimentos ABC" /></div>
            <button className="btn btn-primary btn-sm" onClick={criarFornecedor} disabled={saving}>+ Adicionar</button>
          </div>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 70 }}>Código</th><th>Nome</th><th style={{ width: 80, textAlign: "center" }}>Ações</th></tr></thead>
            <tbody>
              {filteredF.map(f => (
                <tr key={f.id}>
                  {editingId === f.id && editSection === "f" ? (
                    <><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:60}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>
                  ) : (
                    <><td><span style={{fontWeight:600,fontSize:12}}>{f.codigo}</span></td><td>{f.nome}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(f.id);setEditSection("f");setEditData({...f});}}>✏️</button><button className="action-btn" onClick={()=>excluir(f.id,"f")}>🗑️</button></td></>
                  )}
                </tr>
              ))}
              {filteredF.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>Nenhum fornecedor</td></tr>}
            </tbody>
          </table>
        </div>

        {/* BLOCO 2: CLIENTES */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>👥 Clientes</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={cCodigo} onChange={e => setCCodigo(e.target.value)} placeholder="C001" style={{ width: 70 }} /></div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: 200 }}><label>Nome</label><input type="text" value={cNome} onChange={e => setCNome(e.target.value)} placeholder="Nome" /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Email</label><input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="email@..." style={{ width: 150 }} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Telefone</label><input type="text" value={cTelefone} onChange={e => setCTelefone(e.target.value)} placeholder="(00)..." style={{ width: 120 }} /></div>
            <button className="btn btn-primary btn-sm" onClick={criarCliente} disabled={saving}>+ Adicionar</button>
          </div>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 60 }}>Código</th><th>Nome</th><th>Email</th><th>Telefone</th><th style={{ width: 80, textAlign: "center" }}>Ações</th></tr></thead>
            <tbody>
              {filteredC.map(c => (
                <tr key={c.id}>
                  {editingId === c.id && editSection === "c" ? (
                    <><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:50}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><input className="cell-input" value={editData.email||""} onChange={e=>setEditData((d:any)=>({...d,email:e.target.value}))} /></td><td><input className="cell-input" value={editData.telefone||""} onChange={e=>setEditData((d:any)=>({...d,telefone:e.target.value}))} /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>
                  ) : (
                    <><td><span style={{fontWeight:600,fontSize:12}}>{c.codigo}</span></td><td>{c.nome}</td><td style={{fontSize:11,color:"var(--text-secondary)"}}>{c.email||"—"}</td><td style={{fontSize:11}}>{c.telefone||"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("c");setEditData({...c});}}>✏️</button><button className="action-btn" onClick={()=>excluir(c.id,"c")}>🗑️</button></td></>
                  )}
                </tr>
              ))}
              {filteredC.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>Nenhum cliente</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
