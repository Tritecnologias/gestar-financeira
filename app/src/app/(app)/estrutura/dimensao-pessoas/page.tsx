"use client";
import { useState, useEffect, useCallback } from "react";
import PeopleImportModal from "@/components/estrutura/PeopleImportModal";
import { useCan } from "@/components/access/PermissionContext";
import ExportOnlyButton from "@/components/access/ExportOnlyButton";
import "./dimensao-pessoas.css";

interface Pessoa { id: string; codigo: string; nome: string; cargo?: string; departamento?: string; email?: string; telefone?: string; }
interface CentroCusto { id: string; codigo: string; nome: string; }

export default function DimensaoPessoasPage() {
  const can = useCan();
  const [items, setItems] = useState<Pessoa[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ nome: "", cargo: "", departamento: "", email: "", telefone: "" });
  const [proximoCodigo, setProximoCodigo] = useState("001");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, codigoRes] = await Promise.all([fetch("/api/pessoas"), fetch("/api/centros-custo"), fetch("/api/pessoas/proximo-codigo")]);
      if (!pRes.ok || !cRes.ok || !codigoRes.ok) throw new Error("Não foi possível carregar Pessoas ou Centros de Custo.");
      const pData = await pRes.json();
      const cData = await cRes.json();
      const codigoData = await codigoRes.json();
      if (!Array.isArray(pData) || !Array.isArray(cData) || typeof codigoData?.codigo !== "string") throw new Error("Resposta inesperada ao carregar Pessoas.");
      setItems(pData);
      setCentros(cData);
      setProximoCodigo(codigoData.codigo);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar Pessoas."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextCode = () => proximoCodigo;

  const criar = async () => {
    if (saving || loading) return;
    if (!form.nome.trim()) { setError("Nome é obrigatório"); return; }
    setError(""); setSaving(true);
    const codigo = nextCode();
    try {
      const res = await fetch("/api/pessoas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, ...form }) });
      if (res.ok) { setForm({ nome: "", cargo: "", departamento: "", email: "", telefone: "" }); await load(); }
      else { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível criar a Pessoa."); }
    } catch { setError("Não foi possível criar a Pessoa. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId || saving) return; setError(""); setSaving(true);
    try {
      const res = await fetch(`/api/pessoas/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); await load(); } else { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível salvar a edição."); }
    } catch { setError("Não foi possível salvar a edição. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const excluir = async (id: string) => {
    if (!confirm("Desativar?")) return;
    setError(""); setSaving(true);
    try {
      const res = await fetch(`/api/pessoas/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      else { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível desativar a Pessoa."); }
    } catch { setError("Não foi possível desativar a Pessoa. Verifique a conexão."); }
    finally { setSaving(false); }
  };

  const filtered = items.filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo.includes(busca) || (p.cargo||"").toLowerCase().includes(busca.toLowerCase())).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="people-page">
      <header className="topbar">
        <div><h1 className="page-title">Dimensão de Pessoas</h1><p className="page-sub">Estrutura Empresa — Cadastro-base de Pessoas</p></div>
      </header>
      <div className="people-content">
        {error && <div className="alert alert-error people-error" role="alert">{error}</div>}

        {/* Filtros */}
        <div className="people-toolbar">
          <div className="form-group people-search"><label htmlFor="people-search">Busca</label><input id="people-search" type="search" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, cargo, código..." /></div>
          <span className="people-count" aria-live="polite">{filtered.length} pessoas</span>
          {can("estrutura.pessoas.create") && <span className="people-add-hint">Inclua uma pessoa na primeira linha da tabela</span>}
          <div className="people-future-actions" aria-label="Acessos futuros">
            <span>Em breve</span>
            <button type="button" className="btn btn-secondary" disabled title="Organograma ainda não disponível">Organograma</button>
            <button type="button" className="btn btn-secondary" disabled title="Módulo Recursos Humanos ainda não disponível">Recursos Humanos</button>
          </div>
          {can("estrutura.pessoas.import") && <div className="people-import-actions" aria-label="Importação de Pessoas">
            <button type="button" className="btn btn-primary" onClick={() => setShowImport(true)}>Importar Pessoas</button>
          </div>}
          <ExportOnlyButton permission="estrutura.pessoas.export" importPermission="estrutura.pessoas.import" url="/api/pessoas/exportar" filename="pessoas_10s.xlsx" label="Baixar Pessoas" />
        </div>

        {/* Tabela com sticky header */}
        <div className="people-table-scroll" aria-busy={loading}>
          <table className="data-table people-table">
            <thead>
              <tr>
                <th>#</th><th>Código</th><th>Nome</th><th>Cargo</th><th>Centro de Custo</th><th>Email</th><th>Telefone</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {can("estrutura.pessoas.create") && <tr className="people-add-row">
                <td className="people-add-mark">+</td>
                <td className="people-muted">{nextCode()}</td>
                <td><input className="cell-input" aria-label="Nome da nova pessoa" value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" onKeyDown={e=>{if(e.key==="Enter")void criar();}} /></td>
                <td><input className="cell-input" aria-label="Cargo da nova pessoa" value={form.cargo} onChange={e=>setForm(f=>({...f,cargo:e.target.value}))} placeholder="Cargo" /></td>
                <td><select className="cell-input" aria-label="Centro de Custo da nova pessoa" value={form.departamento} onChange={e=>setForm(f=>({...f,departamento:e.target.value}))}><option value="">—</option>{centros.map(c=><option key={c.id} value={c.nome}>{c.codigo} - {c.nome}</option>)}</select></td>
                <td><input className="cell-input" aria-label="Email da nova pessoa" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@..." /></td>
                <td><input className="cell-input" aria-label="Telefone da nova pessoa" value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} placeholder="(00)..." /></td>
                <td><button type="button" className="btn btn-primary btn-sm people-add-button" onClick={() => void criar()} disabled={saving || loading} aria-label="Adicionar pessoa">+</button></td>
              </tr>}
              {loading && <tr><td colSpan={8} className="people-state" role="status">Carregando pessoas...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} className="people-state">{busca ? "Nenhuma pessoa encontrada." : "Nenhuma pessoa cadastrada."}</td></tr>}
              {filtered.map((p, i) => (
                <tr key={p.id} className={editingId === p.id ? "editing" : ""} onKeyDown={e => { if (editingId === p.id && e.key === "Escape") setEditingId(null); }}>
                  {can("estrutura.pessoas.edit") && editingId === p.id ? (
                    <>
                      <td>{i+1}</td>
                      <td><span style={{fontWeight:600}}>{p.codigo}</span></td>
                      <td><input className="cell-input" aria-label="Nome" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} autoFocus onKeyDown={e=>{if(e.key==="Enter")void salvarEdit();if(e.key==="Escape")setEditingId(null);}} /></td>
                      <td><input className="cell-input" value={editData.cargo||""} onChange={e=>setEditData((d:any)=>({...d,cargo:e.target.value}))} /></td>
                      <td><select className="cell-input" aria-label="Centro de Custo" value={editData.departamento||""} onChange={e=>setEditData((d:any)=>({...d,departamento:e.target.value}))}>
                        <option value="">—</option>
                        {centros.map(c=><option key={c.id} value={c.nome}>{c.codigo} - {c.nome}</option>)}
                      </select></td>
                      <td><input className="cell-input" value={editData.email||""} onChange={e=>setEditData((d:any)=>({...d,email:e.target.value}))} /></td>
                      <td><input className="cell-input" value={editData.telefone||""} onChange={e=>setEditData((d:any)=>({...d,telefone:e.target.value}))} /></td>
                      <td><div className="people-row-actions"><button type="button" className="action-btn people-save" aria-label={`Salvar ${p.nome}`} onClick={() => void salvarEdit()} disabled={saving}>✓</button><button type="button" className="action-btn" aria-label={`Cancelar edição de ${p.nome}`} onClick={()=>setEditingId(null)}>✕</button></div></td>
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
                      <td><div className="people-row-actions">{can("estrutura.pessoas.edit") && <button type="button" className="action-btn" aria-label={`Editar ${p.nome}`} onClick={()=>{setEditingId(p.id);setEditData({...p});setError("");}}>✏️</button>}{can("estrutura.pessoas.delete") && <button type="button" className="action-btn" aria-label={`Desativar ${p.nome}`} onClick={()=>void excluir(p.id)} disabled={saving}>🗑️</button>}</div></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {can("estrutura.pessoas.import") && showImport && <PeopleImportModal onClose={() => setShowImport(false)} onImported={() => void load()} />}
    </div>
  );
}
