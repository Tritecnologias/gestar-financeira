"use client";
import { useState, useEffect, useCallback } from "react";
import PeopleImportModal from "@/components/estrutura/PeopleImportModal";
import { useCan } from "@/components/access/PermissionContext";
import ExportOnlyButton from "@/components/access/ExportOnlyButton";
import "./dimensao-pessoas.css";

interface Pessoa { id: string; codigo: string; nome: string; cargo?: string | null; departamento?: string | null; email?: string | null; telefone?: string | null; documento?: string | null; dataAdmissao?: string | null; salario?: string | number | null; }
interface CentroCusto { id: string; codigo: string; nome: string; }
type PessoaForm = { nome: string; cargo: string; departamento: string; email: string; telefone: string; documento: string; dataAdmissao: string; salario: string };
const toPessoaForm = (pessoa: Pessoa): PessoaForm => ({
  nome: pessoa.nome, cargo: pessoa.cargo || "", departamento: pessoa.departamento || "",
  email: pessoa.email || "", telefone: pessoa.telefone || "", documento: pessoa.documento || "",
  dataAdmissao: pessoa.dataAdmissao?.slice(0, 10) || "", salario: pessoa.salario == null ? "" : String(pessoa.salario),
});

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
  const [modalEditing, setModalEditing] = useState(false);
  const [editData, setEditData] = useState<PessoaForm | null>(null);
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
    if (!editingId || !editData || saving) return;
    if (!editData.nome.trim()) { setError("Nome é obrigatório"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`/api/pessoas/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { const updated = await res.json() as Pessoa; setEditData(toPessoaForm(updated)); await load(); setModalEditing(false); } else { const e = await res.json().catch(() => ({})); setError(e.error || "Não foi possível salvar a edição."); }
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
  const selectedPessoa = items.find(p => p.id === editingId);
  const closePerson = () => { if (saving) return; setEditingId(null); setModalEditing(false); setEditData(null); setError(""); };
  const openPerson = (pessoa: Pessoa) => { setEditingId(pessoa.id); setModalEditing(false); setEditData(toPessoaForm(pessoa)); setError(""); };

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
                <th>#</th><th>Código</th><th>Nome</th><th>Cargo</th><th>Centro de Custo</th><th>Email</th><th>Telefone</th><th>Perfil de Acesso</th><th>Ações</th>
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
                <td className="people-muted">—</td>
                <td><button type="button" className="btn btn-primary btn-sm people-add-button" onClick={() => void criar()} disabled={saving || loading} aria-label="Adicionar pessoa">+</button></td>
              </tr>}
              {loading && <tr><td colSpan={9} className="people-state" role="status">Carregando pessoas...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="people-state">{busca ? "Nenhuma pessoa encontrada." : "Nenhuma pessoa cadastrada."}</td></tr>}
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  <td style={{color:"var(--text-muted)",fontSize:11}}>{i+1}</td>
                  <td><span style={{fontWeight:600}}>{p.codigo}</span></td>
                  <td>{p.nome}</td>
                  <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.cargo||"—"}</td>
                  <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.departamento||"—"}</td>
                  <td style={{fontSize:11,color:"var(--text-secondary)"}}>{p.email||"—"}</td>
                  <td style={{fontSize:11}}>{p.telefone||"—"}</td>
                  <td className="people-muted" title="Pessoa sem vínculo explícito com um perfil de acesso">—</td>
                  <td><div className="people-row-actions"><button type="button" className="action-btn" aria-label={`Abrir cadastro de ${p.nome}`} onClick={() => openPerson(p)}>{can("estrutura.pessoas.edit") ? "✏️" : "👁"}</button>{can("estrutura.pessoas.delete") && <button type="button" className="action-btn" aria-label={`Desativar ${p.nome}`} onClick={()=>void excluir(p.id)} disabled={saving}>🗑️</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedPessoa && editData && <div className="modal-overlay open people-detail-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closePerson(); }}>
        <div className="modal-content people-detail-modal" role="dialog" aria-modal="true" aria-labelledby="people-detail-title" onKeyDown={event => { if (event.key === "Escape" && !saving) { event.stopPropagation(); if (modalEditing) { setModalEditing(false); setError(""); } else closePerson(); } }}>
          <div className="modal-header"><h2 id="people-detail-title">{selectedPessoa.codigo} · {selectedPessoa.nome}</h2><button type="button" className="modal-close" aria-label="Fechar cadastro" onClick={closePerson} disabled={saving}>✕</button></div>
          {error && <div className="alert alert-error people-detail-error" role="alert">{error}</div>}
          {modalEditing ? <form onSubmit={event => { event.preventDefault(); void salvarEdit(); }}>
            <div className="people-detail-body people-detail-grid">
              <label>Código<input value={selectedPessoa.codigo} readOnly /></label>
              <label className="people-detail-wide">Nome<input autoFocus value={editData.nome} onChange={event => setEditData({ ...editData, nome: event.target.value })} required /></label>
              <label>Cargo<input value={editData.cargo} onChange={event => setEditData({ ...editData, cargo: event.target.value })} /></label>
              <label>Centro de Custo<select value={editData.departamento} onChange={event => setEditData({ ...editData, departamento: event.target.value })}><option value="">—</option>{centros.map(c => <option key={c.id} value={c.nome}>{c.codigo} - {c.nome}</option>)}</select></label>
              <label>E-mail<input type="email" value={editData.email} onChange={event => setEditData({ ...editData, email: event.target.value })} /></label>
              <label>Telefone<input value={editData.telefone} onChange={event => setEditData({ ...editData, telefone: event.target.value })} /></label>
              <label>Documento<input value={editData.documento} onChange={event => setEditData({ ...editData, documento: event.target.value })} /></label>
              <label>Data de admissão<input type="date" value={editData.dataAdmissao} onChange={event => setEditData({ ...editData, dataAdmissao: event.target.value })} /></label>
              <label>Salário<input type="number" min="0" step="0.01" value={editData.salario} onChange={event => setEditData({ ...editData, salario: event.target.value })} /></label>
              <div className="people-detail-profile"><span>Perfil de Acesso</span><strong>—</strong></div>
            </div>
            <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => { setModalEditing(false); setError(""); }} disabled={saving}>Cancelar edição</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar dados da pessoa"}</button></div>
          </form> : <>
            <div className="people-detail-body people-detail-grid">
              <div><span>Código</span><strong>{selectedPessoa.codigo}</strong></div>
              <div className="people-detail-wide"><span>Nome</span><strong>{selectedPessoa.nome}</strong></div>
              <div><span>Cargo</span><strong>{selectedPessoa.cargo || "—"}</strong></div>
              <div><span>Centro de Custo</span><strong>{selectedPessoa.departamento || "—"}</strong></div>
              <div><span>E-mail</span><strong>{selectedPessoa.email || "—"}</strong></div>
              <div><span>Telefone</span><strong>{selectedPessoa.telefone || "—"}</strong></div>
              <div><span>Documento</span><strong>{selectedPessoa.documento || "—"}</strong></div>
              <div><span>Data de admissão</span><strong>{selectedPessoa.dataAdmissao ? new Date(selectedPessoa.dataAdmissao).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}</strong></div>
              <div><span>Salário</span><strong>{selectedPessoa.salario == null ? "—" : Number(selectedPessoa.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
              <div className="people-detail-profile"><span>Perfil de Acesso</span><strong>—</strong></div>
            </div>
            <div className="modal-actions">
              {can("acessos.perfis.view") && <a className="btn btn-secondary" href="/acessos/perfis" target="_blank" rel="noopener noreferrer">Ir para Perfis de Acesso</a>}
              {can("estrutura.pessoas.edit") && <button type="button" className="btn btn-primary" autoFocus onClick={() => setModalEditing(true)}>Editar dados da pessoa</button>}
              <button type="button" className="btn btn-secondary" onClick={closePerson}>Fechar</button>
            </div>
          </>}
        </div>
      </div>}
      {can("estrutura.pessoas.import") && showImport && <PeopleImportModal onClose={() => setShowImport(false)} onImported={() => void load()} />}
    </div>
  );
}
