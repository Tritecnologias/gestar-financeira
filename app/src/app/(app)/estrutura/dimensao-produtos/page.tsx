"use client";
import { useState, useEffect, useCallback } from "react";

interface Produto { id: string; codigo: string; nome: string; tipo?: string; unidade?: string; precoVenda?: number; precoCusto?: number; }

export default function DimensaoProdutosPage() {
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [form, setForm] = useState({ nome: "", tipo: "", unidade: "", precoVenda: "", precoCusto: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/produtos"); const d = await r.json(); if (Array.isArray(d)) setItems(d); } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextCode = () => {
    const nums = items.map(p => parseInt(p.codigo)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return String(next).padStart(2, "0");
  };

  const criar = async () => {
    if (!form.nome.trim()) { setError("Nome é obrigatório"); return; }
    // Verificar nome duplicado
    if (items.some(p => p.nome.toLowerCase() === form.nome.trim().toLowerCase())) { setError("Já existe um produto/serviço com este nome"); return; }
    setError(""); setSaving(true);
    const codigo = nextCode();
    try {
      const res = await fetch("/api/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, ...form }) });
      if (res.ok) { setForm({ nome: "", tipo: "", unidade: "", precoVenda: "", precoCusto: "" }); load(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true);
    // Verificar nome duplicado (excluindo o próprio)
    if (items.some(p => p.id !== editingId && p.nome.toLowerCase() === editData.nome?.trim().toLowerCase())) { setError("Já existe um produto/serviço com este nome"); setSaving(false); return; }
    try {
      const res = await fetch(`/api/produtos/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); load(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string) => { if (!confirm("Desativar?")) return; await fetch(`/api/produtos/${id}`, { method: "DELETE" }); load(); };

  const fmt = (v: any) => v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  // Filtros
  const filtered = items.filter(p => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase()) && !p.codigo.includes(busca)) return false;
    if (filtroTipo && p.tipo !== filtroTipo) return false;
    return true;
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão de Produtos/Serviços</h1><p className="page-sub">Estrutura Empresa — Catálogo de produtos e serviços</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Busca</label><input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou código..." style={{ width: 200 }} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Tipo</label>
            <select className="filter-input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 120 }}>
              <option value="">Todos</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option>
            </select></div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>{filtered.length} itens</span>
        </div>

        {/* Tabela com sticky header */}
        <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 50, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>#</th>
                <th style={{ width: 60, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Código</th>
                <th style={{ position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Nome</th>
                <th style={{ width: 80, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Tipo</th>
                <th style={{ width: 50, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "center" }}>Un.</th>
                <th style={{ width: 95, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "right" }}>Venda</th>
                <th style={{ width: 95, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "right" }}>Custo</th>
                <th style={{ width: 80, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "center" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td>{i + 1}</td>
                      <td><span style={{ fontWeight: 600 }}>{p.codigo}</span></td>
                      <td><input className="cell-input" value={editData.nome||""} onChange={e => setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                      <td><select className="cell-input" value={editData.tipo||""} onChange={e=>setEditData((d:any)=>({...d,tipo:e.target.value}))}><option value="">—</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></td>
                      <td><input className="cell-input" value={editData.unidade||""} onChange={e=>setEditData((d:any)=>({...d,unidade:e.target.value}))} style={{width:35,textAlign:"center"}} /></td>
                      <td><input className="cell-input num" type="number" step="0.01" value={editData.precoVenda||""} onChange={e=>setEditData((d:any)=>({...d,precoVenda:e.target.value}))} /></td>
                      <td><input className="cell-input num" type="number" step="0.01" value={editData.precoCusto||""} onChange={e=>setEditData((d:any)=>({...d,precoCusto:e.target.value}))} /></td>
                      <td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>setEditingId(null)}>✕</button></td>
                    </>
                  ) : (
                    <>
                      <td style={{color:"var(--text-muted)",fontSize:11}}>{i + 1}</td>
                      <td><span style={{fontWeight:600}}>{p.codigo}</span></td>
                      <td>{p.nome}</td>
                      <td><span className={`chip ${p.tipo==="PRODUTO"?"chip-entrada":p.tipo==="SERVICO"?"chip-previsto":"chip-cancelado"}`} style={{fontSize:10}}>{p.tipo||"—"}</span></td>
                      <td style={{textAlign:"center",fontSize:11}}>{p.unidade||"—"}</td>
                      <td style={{textAlign:"right",fontSize:11}}>{fmt(p.precoVenda)}</td>
                      <td style={{textAlign:"right",fontSize:11}}>{fmt(p.precoCusto)}</td>
                      <td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(p.id);setEditData({...p});}}>✏️</button><button className="action-btn" onClick={()=>excluir(p.id)}>🗑️</button></td>
                    </>
                  )}
                </tr>
              ))}
              {/* Linha fantasma de inserção */}
              <tr style={{ background: "rgba(5,150,105,0.04)" }}>
                <td style={{ color: "var(--accent-green)", fontWeight: 700 }}>+</td>
                <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{nextCode()}</td>
                <td><input className="cell-input" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome do produto/serviço" onKeyDown={e=>{if(e.key==="Enter")criar();}} /></td>
                <td><select className="cell-input" value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{fontSize:11}}><option value="">—</option><option value="PRODUTO">Produto</option><option value="SERVICO">Serviço</option></select></td>
                <td><input className="cell-input" value={form.unidade} onChange={e=>setForm(f=>({...f,unidade:e.target.value}))} placeholder="UN" style={{width:35,textAlign:"center"}} /></td>
                <td><input className="cell-input num" type="number" step="0.01" value={form.precoVenda} onChange={e=>setForm(f=>({...f,precoVenda:e.target.value}))} placeholder="0,00" /></td>
                <td><input className="cell-input num" type="number" step="0.01" value={form.precoCusto} onChange={e=>setForm(f=>({...f,precoCusto:e.target.value}))} placeholder="0,00" /></td>
                <td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={criar} disabled={saving}>+</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
