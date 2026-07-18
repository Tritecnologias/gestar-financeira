"use client";
import { useState, useEffect, useCallback } from "react";

interface Usuario { id: string; nome: string; email: string; papel: string; ativo: boolean; criadoEm: string; tenant?: { nome: string }; }

export default function AdminPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [busca, setBusca] = useState("");

  // Form criar
  const [form, setForm] = useState({ nome: "", email: "", senha: "", papel: "membro" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usuarios");
      if (res.status === 403) { setError("Acesso negado — apenas administradores."); return; }
      const data = await res.json();
      if (Array.isArray(data)) setUsuarios(data);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) { setError("Preencha todos os campos"); return; }
    if (form.senha.length < 6) { setError("Senha deve ter pelo menos 6 caracteres"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ nome: "", email: "", senha: "", papel: "membro" }); setShowCreateModal(false); load(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId) return; setSaving(true); setError("");
    try {
      const res = await fetch(`/api/usuarios/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); load(); }
      else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este usuário permanentemente?")) return;
    const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    if (res.ok) load(); else { const e = await res.json(); setError(e.error); }
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await fetch(`/api/usuarios/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !ativo }) });
    load();
  };

  const filtered = usuarios.filter(u => !busca || u.nome.toLowerCase().includes(busca.toLowerCase()) || u.email.toLowerCase().includes(busca.toLowerCase()));

  const papelLabel: Record<string, string> = { admin_global: "🛡️ Admin Global", admin: "👑 Admin", membro: "👤 Membro" };
  const papelColor: Record<string, string> = { admin_global: "#7c3aed", admin: "#2563eb", membro: "#64748b" };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <header className="topbar">
        <div><h1 className="page-title">🛡️ Administração de Usuários</h1><p className="page-sub">Gerenciar acessos, papéis e permissões</p></div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ Novo Usuário</button>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ marginBottom: 16 }}>
          <input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar por nome ou email..." style={{ width: 300 }} />
          <span style={{ marginLeft: 12, fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} usuários</span>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</div> : (
          <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <table className="data-table" style={{ fontSize: 12, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Nome</th>
                  <th style={{ position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Email</th>
                  <th style={{ width: 130, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Papel</th>
                  <th style={{ width: 70, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "center" }}>Status</th>
                  <th style={{ width: 120, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 }}>Tenant</th>
                  <th style={{ width: 150, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2, textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} style={{ opacity: u.ativo ? 1 : 0.5 }}>
                    {editingId === u.id ? (
                      <>
                        <td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                        <td><input className="cell-input" value={editData.email||""} onChange={e=>setEditData((d:any)=>({...d,email:e.target.value}))} /></td>
                        <td><select className="cell-input" value={editData.papel||""} onChange={e=>setEditData((d:any)=>({...d,papel:e.target.value}))}><option value="membro">Membro</option><option value="admin">Admin</option><option value="admin_global">Admin Global</option></select></td>
                        <td style={{textAlign:"center"}}><input type="checkbox" checked={editData.ativo} onChange={e=>setEditData((d:any)=>({...d,ativo:e.target.checked}))} /></td>
                        <td style={{fontSize:10,color:"var(--text-muted)"}}>{u.tenant?.nome||"—"}</td>
                        <td style={{textAlign:"center"}}>
                          <input className="cell-input" value={editData.senha||""} onChange={e=>setEditData((d:any)=>({...d,senha:e.target.value}))} placeholder="Nova senha (vazio=manter)" style={{width:90,fontSize:10,marginRight:4}} />
                          <button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button>
                          <button className="action-btn" style={{opacity:1}} onClick={()=>setEditingId(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{fontWeight:500}}>{u.nome}</td>
                        <td style={{fontSize:11,color:"var(--text-secondary)"}}>{u.email}</td>
                        <td><span style={{fontSize:11,fontWeight:600,color:papelColor[u.papel]||"#64748b"}}>{papelLabel[u.papel]||u.papel}</span></td>
                        <td style={{textAlign:"center"}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:10,background:u.ativo?"rgba(5,150,105,0.1)":"rgba(220,38,38,0.1)",color:u.ativo?"var(--accent-green)":"var(--accent-red)"}}>{u.ativo?"Ativo":"Inativo"}</span></td>
                        <td style={{fontSize:10,color:"var(--text-muted)"}}>{u.tenant?.nome||"—"}</td>
                        <td style={{textAlign:"center"}}>
                          <button className="action-btn" onClick={()=>{setEditingId(u.id);setEditData({nome:u.nome,email:u.email,papel:u.papel,ativo:u.ativo,senha:""});}} title="Editar">✏️</button>
                          <button className="action-btn" onClick={()=>toggleAtivo(u.id,u.ativo)} title={u.ativo?"Desativar":"Ativar"}>{u.ativo?"🔒":"🔓"}</button>
                          <button className="action-btn" onClick={()=>excluir(u.id)} title="Excluir" style={{color:"var(--accent-red)"}}>🗑️</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Criar Usuário */}
        {showCreateModal && (
          <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Novo Usuário</h2>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group"><label>Nome *</label><input type="text" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" /></div>
                <div className="form-group"><label>Email *</label><input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="usuario@email.com" /></div>
                <div className="form-group"><label>Senha * (mín. 6 caracteres)</label><input type="password" value={form.senha} onChange={e => setForm(f=>({...f,senha:e.target.value}))} placeholder="••••••" /></div>
                <div className="form-group"><label>Papel</label>
                  <select value={form.papel} onChange={e => setForm(f=>({...f,papel:e.target.value}))}>
                    <option value="membro">Membro</option>
                    <option value="admin">Admin</option>
                    <option value="admin_global">Admin Global</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={criar} disabled={saving}>{saving ? "Criando..." : "Criar Usuário"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
