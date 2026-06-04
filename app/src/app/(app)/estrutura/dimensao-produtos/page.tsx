"use client";
import { useState, useEffect, useCallback } from "react";

interface Produto { id: string; codigo: string; nome: string; tipo?: string; unidade?: string; precoVenda?: number; precoCusto?: number; categoria?: string; }

export default function DimensaoProdutosPage() {
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ codigo: "", nome: "", tipo: "", unidade: "", precoVenda: "", precoCusto: "", categoria: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/produtos"); const d = await r.json(); if (Array.isArray(d)) setItems(d); } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ codigo: "", nome: "", tipo: "", unidade: "", precoVenda: "", precoCusto: "", categoria: "" }); load(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true);
    try {
      const res = await fetch(`/api/produtos/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); load(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string) => { if (!confirm("Desativar?")) return; await fetch(`/api/produtos/${id}`, { method: "DELETE" }); load(); };

  const fmt = (v: any) => v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão de Produtos/Serviços</h1><p className="page-sub">Estrutura Empresa — Catálogo de produtos e serviços</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="PRD001" style={{ width: 80 }} /></div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150, flex: 1 }}><label>Nome</label><input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do produto/serviço" /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: 110 }}>
              <option value="">—</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option>
            </select></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Unidade</label><input type="text" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} placeholder="UN" style={{ width: 60 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Preço Venda</label><input type="number" step="0.01" value={form.precoVenda} onChange={e => setForm(f => ({ ...f, precoVenda: e.target.value }))} style={{ width: 100 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Preço Custo</label><input type="number" step="0.01" value={form.precoCusto} onChange={e => setForm(f => ({ ...f, precoCusto: e.target.value }))} style={{ width: 100 }} /></div>
          <button className="btn btn-primary" onClick={criar} disabled={saving}>+ Adicionar</button>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</div> : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum produto/serviço cadastrado.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th style={{ width: 70 }}>Código</th><th>Nome</th><th style={{ width: 80 }}>Tipo</th><th style={{ width: 50 }}>Un.</th><th style={{ width: 100, textAlign: "right" }}>Venda</th><th style={{ width: 100, textAlign: "right" }}>Custo</th><th style={{ width: 90, textAlign: "center" }}>Ações</th></tr></thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td><input className="cell-input" value={editData.codigo||""} onChange={e => setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:60}} /></td>
                      <td><input className="cell-input" value={editData.nome||""} onChange={e => setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                      <td><select className="cell-input" value={editData.tipo||""} onChange={e => setEditData((d:any)=>({...d,tipo:e.target.value}))}><option value="">—</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></td>
                      <td><input className="cell-input" value={editData.unidade||""} onChange={e => setEditData((d:any)=>({...d,unidade:e.target.value}))} style={{width:40}} /></td>
                      <td><input className="cell-input num" type="number" step="0.01" value={editData.precoVenda||""} onChange={e => setEditData((d:any)=>({...d,precoVenda:e.target.value}))} /></td>
                      <td><input className="cell-input num" type="number" step="0.01" value={editData.precoCusto||""} onChange={e => setEditData((d:any)=>({...d,precoCusto:e.target.value}))} /></td>
                      <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>setEditingId(null)}>✕</button></td>
                    </>
                  ) : (
                    <>
                      <td><span style={{fontWeight:600,fontSize:12,color:"var(--text-secondary)"}}>{p.codigo}</span></td>
                      <td>{p.nome}</td>
                      <td><span className={`chip ${p.tipo === "PRODUTO" ? "chip-entrada" : p.tipo === "SERVICO" ? "chip-previsto" : "chip-cancelado"}`}>{p.tipo || "—"}</span></td>
                      <td style={{fontSize:12,textAlign:"center"}}>{p.unidade || "—"}</td>
                      <td style={{textAlign:"right",fontSize:12}}>{fmt(p.precoVenda)}</td>
                      <td style={{textAlign:"right",fontSize:12}}>{fmt(p.precoCusto)}</td>
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
