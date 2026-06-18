"use client";
import { useState, useEffect, useCallback } from "react";

interface Empresa { id: string; razaoSocial: string; nomeFantasia?: string; cnpj?: string; telefone?: string; email?: string; endereco?: string; cidade?: string; estado?: string; segmento?: string; porte?: string; }
interface CentroCusto { id: string; codigo: string; nome: string; }

export default function DimensaoEmpresaPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Form empresa
  const [form, setForm] = useState({ razaoSocial: "", nomeFantasia: "", cnpj: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", segmento: "", porte: "" });

  // Form centro de custo
  const [ccCodigo, setCcCodigo] = useState("");
  const [ccNome, setCcNome] = useState("");

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editSection, setEditSection] = useState<"emp" | "cc" | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, cRes] = await Promise.all([fetch("/api/empresa"), fetch("/api/centros-custo")]);
      const eData = await eRes.json();
      const cData = await cRes.json();
      if (Array.isArray(eData)) setEmpresas(eData);
      if (Array.isArray(cData)) setCentros(cData);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const criarEmpresa = async () => {
    if (!form.razaoSocial.trim()) { setError("Razão social é obrigatória"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/empresa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ razaoSocial: "", nomeFantasia: "", cnpj: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", segmento: "", porte: "" }); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const criarCentro = async () => {
    if (!ccCodigo.trim() || !ccNome.trim()) { setError("Código e nome obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/centros-custo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: ccCodigo, nome: ccNome }) });
      if (res.ok) { setCcCodigo(""); setCcNome(""); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true);
    const api = editSection === "emp" ? "/api/empresa" : "/api/centros-custo";
    try {
      const res = await fetch(`${api}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); setEditSection(null); loadData(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluirCentro = async (id: string) => { if (!confirm("Desativar?")) return; await fetch(`/api/centros-custo/${id}`, { method: "DELETE" }); loadData(); };
  const excluirEmpresa = async (id: string) => { if (!confirm("Excluir empresa?")) return; await fetch(`/api/empresa/${id}`, { method: "DELETE" }); loadData(); };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão da Empresa</h1><p className="page-sub">Estrutura Empresa — Dados cadastrais da organização</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* BLOCO 1: DADOS EMPRESARIAIS */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🏢 DADOS EMPRESARIAIS</h3>

            {/* Tabela de empresas */}
            <table className="data-table" style={{ fontSize: 12, marginBottom: 12 }}>
              <thead><tr><th>Razão Social</th><th>Fantasia</th><th style={{ width: 120 }}>CNPJ</th><th style={{ width: 100 }}>Telefone</th><th style={{ width: 70, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {empresas.map(e => (
                  <tr key={e.id}>
                    {editingId === e.id && editSection === "emp" ? (
                      <>
                        <td><input className="cell-input" value={editData.razaoSocial||""} onChange={ev=>setEditData((d:any)=>({...d,razaoSocial:ev.target.value}))} onKeyDown={ev=>{if(ev.key==="Enter")salvarEdit();if(ev.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td>
                        <td><input className="cell-input" value={editData.nomeFantasia||""} onChange={ev=>setEditData((d:any)=>({...d,nomeFantasia:ev.target.value}))} /></td>
                        <td><input className="cell-input" value={editData.cnpj||""} onChange={ev=>setEditData((d:any)=>({...d,cnpj:ev.target.value}))} /></td>
                        <td><input className="cell-input" value={editData.telefone||""} onChange={ev=>setEditData((d:any)=>({...d,telefone:ev.target.value}))} /></td>
                        <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td>
                      </>
                    ) : (
                      <>
                        <td style={{fontWeight:500}}>{e.razaoSocial}</td>
                        <td style={{fontSize:11,color:"var(--text-secondary)"}}>{e.nomeFantasia||"—"}</td>
                        <td style={{fontSize:11}}>{e.cnpj||"—"}</td>
                        <td style={{fontSize:11}}>{e.telefone||"—"}</td>
                        <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(e.id);setEditSection("emp");setEditData({...e});}}>✏️</button><button className="action-btn" onClick={()=>excluirEmpresa(e.id)}>🗑️</button></td>
                      </>
                    )}
                  </tr>
                ))}
                {/* Linha fantasma */}
                <tr style={{ background: "rgba(5,150,105,0.04)" }}>
                  <td><input className="cell-input" value={form.razaoSocial} onChange={e=>setForm(f=>({...f,razaoSocial:e.target.value}))} placeholder="Razão Social *" onKeyDown={e=>{if(e.key==="Enter")criarEmpresa();}} /></td>
                  <td><input className="cell-input" value={form.nomeFantasia} onChange={e=>setForm(f=>({...f,nomeFantasia:e.target.value}))} placeholder="Fantasia" /></td>
                  <td><input className="cell-input" value={form.cnpj} onChange={e=>setForm(f=>({...f,cnpj:e.target.value}))} placeholder="CNPJ" /></td>
                  <td><input className="cell-input" value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} placeholder="Tel" /></td>
                  <td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={criarEmpresa} disabled={saving}>+</button></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* BLOCO 2: ÁREAS DE NEGÓCIO E CENTRO DE CUSTO */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📊 ÁREAS DE NEGÓCIO E CENTRO DE CUSTO</h3>

            <table className="data-table" style={{ fontSize: 12, marginBottom: 12 }}>
              <thead><tr><th style={{ width: 70 }}>Código</th><th>Descrição</th><th style={{ width: 70, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {centros.map(c => (
                  <tr key={c.id}>
                    {editingId === c.id && editSection === "cc" ? (
                      <>
                        <td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:60}} /></td>
                        <td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td>
                        <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td>
                      </>
                    ) : (
                      <>
                        <td><span style={{fontWeight:600}}>{c.codigo}</span></td>
                        <td>{c.nome}</td>
                        <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("cc");setEditData({...c});}}>✏️</button><button className="action-btn" onClick={()=>excluirCentro(c.id)}>🗑️</button></td>
                      </>
                    )}
                  </tr>
                ))}
                {/* Linha fantasma */}
                <tr style={{ background: "rgba(5,150,105,0.04)" }}>
                  <td><input className="cell-input" value={ccCodigo} onChange={e=>setCcCodigo(e.target.value)} placeholder="10.000" style={{width:60}} onKeyDown={e=>{if(e.key==="Enter")criarCentro();}} /></td>
                  <td><input className="cell-input" value={ccNome} onChange={e=>setCcNome(e.target.value)} placeholder="Nome da área" /></td>
                  <td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={criarCentro} disabled={saving}>+</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
