"use client";
import { useState, useEffect, useCallback } from "react";

interface Pessoa { id: string; codigo: string; nome: string; cargo?: string; departamento?: string; email?: string; telefone?: string; documento?: string; }

export default function DimensaoPessoasPage() {
  const [items, setItems] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ codigo: "", nome: "", cargo: "", departamento: "", email: "", telefone: "", documento: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/pessoas"); const d = await r.json(); if (Array.isArray(d)) setItems(d); } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/pessoas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ codigo: "", nome: "", cargo: "", departamento: "", email: "", telefone: "", documento: "" }); load(); }
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

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão de Pessoas</h1><p className="page-sub">Estrutura Empresa — Colaboradores e Equipe</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="P001" style={{ width: 80 }} /></div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}><label>Nome</label><input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Cargo</label><input type="text" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Analista" style={{ width: 120 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Departamento</label><input type="text" value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} placeholder="Financeiro" style={{ width: 120 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." style={{ width: 150 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Telefone</label><input type="text" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00)..." style={{ width: 120 }} /></div>
          <button className="btn btn-primary" onClick={criar} disabled={saving}>+ Adicionar</button>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</div> : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhuma pessoa cadastrada.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th style={{ width: 70 }}>Código</th><th>Nome</th><th>Cargo</th><th>Depto</th><th>Email</th><th>Telefone</th><th style={{ width: 90, textAlign: "center" }}>Ações</th></tr></thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td><input className="cell-input" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:60}} /></td>
                      <td><input className="cell-input" value={editData.nome||""} onChange={e => setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                      <td><input className="cell-input" value={editData.cargo||""} onChange={e => setEditData((d:any)=>({...d,cargo:e.target.value}))} /></td>
                      <td><input className="cell-input" value={editData.departamento||""} onChange={e => setEditData((d:any)=>({...d,departamento:e.target.value}))} /></td>
                      <td><input className="cell-input" value={editData.email||""} onChange={e => setEditData((d:any)=>({...d,email:e.target.value}))} /></td>
                      <td><input className="cell-input" value={editData.telefone||""} onChange={e => setEditData((d:any)=>({...d,telefone:e.target.value}))} /></td>
                      <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>setEditingId(null)}>✕</button></td>
                    </>
                  ) : (
                    <>
                      <td><span style={{fontWeight:600,fontSize:12,color:"var(--text-secondary)"}}>{p.codigo}</span></td>
                      <td>{p.nome}</td>
                      <td style={{fontSize:12,color:"var(--text-secondary)"}}>{p.cargo||"—"}</td>
                      <td style={{fontSize:12,color:"var(--text-secondary)"}}>{p.departamento||"—"}</td>
                      <td style={{fontSize:12,color:"var(--text-secondary)"}}>{p.email||"—"}</td>
                      <td style={{fontSize:12}}>{p.telefone||"—"}</td>
                      <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(p.id);setEditData({...p});}}>✏️</button><button className="action-btn" onClick={()=>excluir(p.id)}>🗑️</button></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
