"use client";
import { useState, useEffect, useCallback } from "react";

interface Pessoa { id: string; codigo: string; nome: string; cargo?: string; departamento?: string; email?: string; telefone?: string; }
interface CentroCusto { id: string; codigo: string; nome: string; }

export default function DimensaoPessoasPage() {
  const [items, setItems] = useState<Pessoa[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ nome: "", cargo: "", departamento: "", email: "", telefone: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([fetch("/api/pessoas"), fetch("/api/centros-custo")]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      if (Array.isArray(pData)) setItems(pData);
      if (Array.isArray(cData)) setCentros(cData);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextCode = () => {
    const nums = items.map(p => parseInt(p.codigo)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return String(next).padStart(3, "0");
  };

  const criar = async () => {
    if (!form.nome.trim()) { setError("Nome é obrigatório"); return; }
    setError(""); setSaving(true);
    const codigo = nextCode();
    try {
      const res = await fetch("/api/pessoas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, ...form }) });
      if (res.ok) { setForm({ nome: "", cargo: "", departamento: "", email: "", telefone: "" }); load(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true);
    try {
      const res = await fetch(`/api/pessoas/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); load(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string) => { if (!confirm("Desativar?")) return; await fetch(`/api/pessoas/${id}`, { method: "DELETE" }); load(); };

  const filtered = items.filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo.includes(busca) || (p.cargo||"").toLowerCase().includes(busca.toLowerCase())).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão de Pessoas</h1><p className="page-sub">Estrutura Empresa — Colaboradores e Equipe</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Busca</label><input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, cargo, código..." style={{ width: 250 }} /></div>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} pessoas</span>
        </div>

        {/* Tabela com sticky header */}
        <div style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 40, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>#</th>
                <th style={{ width: 55, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Código</th>
                <th style={{ position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Nome</th>
                <th style={{ width: 120, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Cargo</th>
                <th style={{ width: 130, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Departamento</th>
                <th style={{ width: 160, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Email</th>
                <th style={{ width: 110, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Telefone</th>
                <th style={{ width: 80, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "center" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td>{i+1}</td>
                      <td><span style={{fontWeight:600}}>{p.codigo}</span></td>
                      <td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                      <td><input className="cell-input" value={editData.cargo||""} onChange={e=>setEditData((d:any)=>({...d,cargo:e.target.value}))} /></td>
                      <td><select className="cell-input" value={editData.departamento||""} onChange={e=>setEditData((d:any)=>({...d,departamento:e.target.value}))}>
                        <option value="">—</option>
                        {centros.map(c=><option key={c.id} value={c.nome}>{c.codigo} - {c.nome}</option>)}
                      </select></td>
                      <td><input className="cell-input" value={editData.email||""} onChange={e=>setEditData((d:any)=>({...d,email:e.target.value}))} /></td>
                      <td><input className="cell-input" value={editData.telefone||""} onChange={e=>setEditData((d:any)=>({...d,telefone:e.target.value}))} /></td>
                      <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>setEditingId(null)}>✕</button></td>
                    </>
                  ) : (
                    <>
                      <td style={{color:"var(--text-muted)",fontSize:11}}>{i+1}</td>
                      <td><span style={{fontWeight:600}}>{p.codigo}</span></td>
                      <td>{p.nome}</td>
                      <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.cargo||"—"}</td>
                      <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.departamento||"—"}</td>
                      <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.email||"—"}</td>
                      <td style={{fontSize:11}}>{p.telefone||"—"}</td>
                      <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(p.id);setEditData({...p});}}>✏️</button><button className="action-btn" onClick={()=>excluir(p.id)}>🗑️</button></td>
                    </>
                  )}
                </tr>
              ))}
              {/* Linha fantasma */}
              <tr style={{ background: "rgba(5,150,105,0.04)" }}>
                <td style={{ color: "var(--accent-green)", fontWeight: 700 }}>+</td>
                <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{nextCode()}</td>
                <td><input className="cell-input" value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" onKeyDown={e=>{if(e.key==="Enter")criar();}} /></td>
                <td><input className="cell-input" value={form.cargo} onChange={e=>setForm(f=>({...f,cargo:e.target.value}))} placeholder="Cargo" /></td>
                <td><select className="cell-input" value={form.departamento} onChange={e=>setForm(f=>({...f,departamento:e.target.value}))}>
                  <option value="">—</option>
                  {centros.map(c=><option key={c.id} value={c.nome}>{c.codigo} - {c.nome}</option>)}
                </select></td>
                <td><input className="cell-input" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@..." /></td>
                <td><input className="cell-input" value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} placeholder="(00)..." /></td>
                <td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={criar} disabled={saving}>+</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
