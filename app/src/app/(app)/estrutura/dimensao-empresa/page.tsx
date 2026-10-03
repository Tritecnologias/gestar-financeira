"use client";
import { useState, useEffect, useCallback } from "react";
import "./dimensao-empresa.css";

interface Empresa { id: string; razaoSocial: string; nomeFantasia?: string; cnpj?: string; telefone?: string; email?: string; }
interface DadoBancario { id: string; banco: string; agencia?: string; conta?: string; tipo?: string; titular?: string; }
interface AreaNegocio { id: string; codigo: string; nome: string; }
interface CentroCusto { id: string; codigo: string; nome: string; areaId?: string; area?: { codigo: string; nome: string }; }

export default function DimensaoEmpresaPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [bancos, setBancos] = useState<DadoBancario[]>([]);
  const [areas, setAreas] = useState<AreaNegocio[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [areaError, setAreaError] = useState("");
  const [ccError, setCcError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");

  // Forms
  const [fEmp, setFEmp] = useState({ razaoSocial: "", nomeFantasia: "", cnpj: "", telefone: "", email: "" });
  const [fBanco, setFBanco] = useState({ banco: "", agencia: "", conta: "", tipo: "", titular: "" });
  const [fArea, setFArea] = useState({ codigo: "", nome: "" });
  const [fCC, setFCC] = useState({ codigo: "", nome: "", areaId: "" });

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editSection, setEditSection] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eR, bR, aR, cR] = await Promise.all([fetch("/api/empresa"), fetch("/api/dados-bancarios"), fetch("/api/areas-negocio"), fetch("/api/centros-custo")]);
      const [eD, bD, aD, cD] = await Promise.all([eR.json(), bR.json(), aR.json(), cR.json()]);
      if (Array.isArray(eD)) setEmpresas(eD);
      if (Array.isArray(bD)) setBancos(bD);
      if (Array.isArray(aD)) setAreas(aD);
      if (Array.isArray(cD)) setCentros(cD);
    } catch { setError("Erro ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const criar = async (api: string, body: any, reset: () => void) => {
    setError(""); setSaving(true);
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { reset(); if (api === "/api/centros-custo") setCcError(""); loadData(); }
      else { const e = await res.json(); if (api === "/api/centros-custo") setCcError(e.error); else setError(e.error); }
    } finally { setSaving(false); }
  };

  const validarAreaCentro = (areaId: string) => {
    if (areaId && areas.some(a => a.id === areaId)) { setCcError(""); return true; }
    setCcError("Selecione uma Área de Negócio ativa para o Centro de Custo.");
    return false;
  };

  const criarCentro = () => {
    if (!validarAreaCentro(fCC.areaId) || !fCC.codigo || !fCC.nome) return;
    criar("/api/centros-custo", fCC, () => setFCC({ codigo: "", nome: "", areaId: "" }));
  };

  const salvarEdit = async () => {
    if (!editingId || !editSection) return;
    if (editSection === "cc" && !validarAreaCentro(editData.areaId || "")) return;
    setSaving(true);
    const apiMap: Record<string, string> = { emp: "/api/empresa", banco: "/api/dados-bancarios", area: "/api/areas-negocio", cc: "/api/centros-custo" };
    try {
      const res = await fetch(`${apiMap[editSection]}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); setEditSection(null); if (editSection === "cc") setCcError(""); loadData(); }
      else { const e = await res.json(); if (editSection === "cc") setCcError(e.error); else setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (api: string, id: string) => {
    if (!confirm("Desativar?")) return;
    if (api === "/api/areas-negocio") setAreaError("");
    const res = await fetch(`${api}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json();
      if (api === "/api/areas-negocio") setAreaError(e.error || "Não foi possível desativar a Área de Negócio.");
      else setError(e.error || "Não foi possível desativar o registro.");
      return;
    }
    loadData();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div className="company-dimension-page">
      <header className="topbar"><div><h1 className="page-title">Dimensão da Empresa</h1><p className="page-sub">Estrutura Empresa — Dados cadastrais, bancários, áreas e centros de custo</p></div></header>
      <div className="company-dimension-content">
        {error && <div className="alert alert-error company-dimension-alert">{error}</div>}
        <div className="company-dimension-toolbar"><input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar..." /></div>

        <div className="company-dimension-grid">
          <div className="company-dimension-group-label">ESTRUTURA FINANCEIRA</div>
          <section className="company-dimension-card company-dimension-card--empresa">
            <h3>🏢 DADOS EMPRESARIAIS</h3>
            <div className="company-dimension-table">
              <table className="data-table">
                <thead><tr><th>Razão Social</th><th>Fantasia</th><th>CNPJ</th><th>Ações</th></tr></thead>
                <tbody>
                  {empresas.filter(e => !busca || e.razaoSocial.toLowerCase().includes(busca.toLowerCase())).map(e=>(
                    <tr key={e.id}>
                      {editingId===e.id&&editSection==="emp"?(<><td><input className="cell-input" value={editData.razaoSocial||""} onChange={ev=>setEditData((d:any)=>({...d,razaoSocial:ev.target.value}))} onKeyDown={ev=>{if(ev.key==="Enter")salvarEdit();if(ev.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><input className="cell-input" value={editData.nomeFantasia||""} onChange={ev=>setEditData((d:any)=>({...d,nomeFantasia:ev.target.value}))} /></td><td><input className="cell-input" value={editData.cnpj||""} onChange={ev=>setEditData((d:any)=>({...d,cnpj:ev.target.value}))} /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td style={{fontWeight:500}}>{e.razaoSocial}</td><td style={{fontSize:10,color:"var(--text-secondary)"}}>{e.nomeFantasia||"—"}</td><td style={{fontSize:10}}>{e.cnpj||"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(e.id);setEditSection("emp");setEditData({...e});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/empresa",e.id)}>🗑️</button></td></>)}
                    </tr>))}
                </tbody>
                <tfoot>
                  <tr><td><input className="cell-input" value={fEmp.razaoSocial} onChange={e=>setFEmp(f=>({...f,razaoSocial:e.target.value}))} placeholder="Razão Social *" onKeyDown={e=>{if(e.key==="Enter")criar("/api/empresa",fEmp,()=>setFEmp({razaoSocial:"",nomeFantasia:"",cnpj:"",telefone:"",email:""}));}} /></td><td><input className="cell-input" value={fEmp.nomeFantasia} onChange={e=>setFEmp(f=>({...f,nomeFantasia:e.target.value}))} placeholder="Fantasia" /></td><td><input className="cell-input" value={fEmp.cnpj} onChange={e=>setFEmp(f=>({...f,cnpj:e.target.value}))} placeholder="CNPJ" /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>criar("/api/empresa",fEmp,()=>setFEmp({razaoSocial:"",nomeFantasia:"",cnpj:"",telefone:"",email:""}))} disabled={saving}>+</button></td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="company-dimension-card company-dimension-card--banco">
            <h3>🏦 DADOS BANCÁRIOS</h3>
            <div className="company-dimension-table">
              <table className="data-table">
                <thead><tr><th>Banco</th><th>Agência</th><th>Conta</th><th>Tipo</th><th>Ações</th></tr></thead>
                <tbody>
                  {bancos.filter(b=>!busca||b.banco.toLowerCase().includes(busca.toLowerCase())||(b.agencia||"").includes(busca)||(b.conta||"").includes(busca)).map(b=>(
                    <tr key={b.id}>
                      {editingId===b.id&&editSection==="banco"?(<><td><input className="cell-input" value={editData.banco||""} onChange={e=>setEditData((d:any)=>({...d,banco:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><input className="cell-input" value={editData.agencia||""} onChange={e=>setEditData((d:any)=>({...d,agencia:e.target.value}))} /></td><td><input className="cell-input" value={editData.conta||""} onChange={e=>setEditData((d:any)=>({...d,conta:e.target.value}))} /></td><td><input className="cell-input" value={editData.tipo||""} onChange={e=>setEditData((d:any)=>({...d,tipo:e.target.value}))} /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td>{b.banco}</td><td style={{fontSize:10}}>{b.agencia||"—"}</td><td style={{fontSize:10}}>{b.conta||"—"}</td><td style={{fontSize:10}}>{b.tipo||"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(b.id);setEditSection("banco");setEditData({...b});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/dados-bancarios",b.id)}>🗑️</button></td></>)}
                    </tr>))}
                </tbody>
                <tfoot>
                  <tr><td><input className="cell-input" value={fBanco.banco} onChange={e=>setFBanco(f=>({...f,banco:e.target.value}))} placeholder="Banco *" onKeyDown={e=>{if(e.key==="Enter")criar("/api/dados-bancarios",fBanco,()=>setFBanco({banco:"",agencia:"",conta:"",tipo:"",titular:""}));}} /></td><td><input className="cell-input" value={fBanco.agencia} onChange={e=>setFBanco(f=>({...f,agencia:e.target.value}))} placeholder="Ag." /></td><td><input className="cell-input" value={fBanco.conta} onChange={e=>setFBanco(f=>({...f,conta:e.target.value}))} placeholder="Conta" /></td><td><input className="cell-input" value={fBanco.tipo} onChange={e=>setFBanco(f=>({...f,tipo:e.target.value}))} placeholder="CC/CP" /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>criar("/api/dados-bancarios",fBanco,()=>setFBanco({banco:"",agencia:"",conta:"",tipo:"",titular:""}))} disabled={saving}>+</button></td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="company-dimension-group-label">ESTRUTURA GERENCIAL</div>
          <section className="company-dimension-card company-dimension-card--area">
            <h3>📊 ÁREA DE NEGÓCIO</h3>
            {areaError && <div className="alert alert-error company-dimension-inline-error" role="alert">{areaError}</div>}
            <div className="company-dimension-table">
              <table className="data-table">
                <thead><tr><th>Código</th><th>Descrição</th><th>Ações</th></tr></thead>
                <tbody>
                  {areas.filter(a=>!busca||a.nome.toLowerCase().includes(busca.toLowerCase())||a.codigo.includes(busca)).map(a=>(
                    <tr key={a.id}>
                      {editingId===a.id&&editSection==="area"?(<><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:50}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td><span style={{fontWeight:600}}>{a.codigo}</span></td><td>{a.nome}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(a.id);setEditSection("area");setEditData({...a});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/areas-negocio",a.id)}>🗑️</button></td></>)}
                    </tr>))}
                </tbody>
                <tfoot>
                  <tr><td><input className="cell-input" value={fArea.codigo} onChange={e=>setFArea(f=>({...f,codigo:e.target.value}))} placeholder="10" style={{width:50}} onKeyDown={e=>{if(e.key==="Enter"&&fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} /></td><td><input className="cell-input" value={fArea.nome} onChange={e=>setFArea(f=>({...f,nome:e.target.value}))} placeholder="Área de Negócio" onKeyDown={e=>{if(e.key==="Enter"&&fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>{if(fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} disabled={saving}>+</button></td></tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="company-dimension-card company-dimension-card--centro">
            <h3>🏷️ CENTRO DE CUSTO</h3>
            {ccError && <div className="alert alert-error company-dimension-inline-error" role="alert">{ccError}</div>}
            <div className="company-dimension-table">
              <table className="data-table">
                <thead><tr><th>Código</th><th>Descrição</th><th>Área</th><th>Ações</th></tr></thead>
                <tbody>
                  {centros.filter(c=>!busca||c.nome.toLowerCase().includes(busca.toLowerCase())||c.codigo.includes(busca)).map(c=>(
                    <tr key={c.id}>
                      {editingId===c.id&&editSection==="cc"?(<><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:50}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);setCcError("");}}} autoFocus /></td><td><select className="cell-input" aria-label="Área de Negócio" required value={editData.areaId||""} onChange={e=>{setEditData((d:any)=>({...d,areaId:e.target.value}));setCcError("");}}><option value="" disabled>Área *</option>{areas.map(a=><option key={a.id} value={a.id}>{a.codigo} | {a.nome}</option>)}</select></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);setCcError("");}}>✕</button></td></>)
                      :(<><td><span style={{fontWeight:600}}>{c.codigo}</span></td><td>{c.nome}</td><td style={{fontSize:10,color:"var(--text-secondary)"}}>{c.area?`${c.area.codigo} | ${c.area.nome}`:"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("cc");setEditData({...c,areaId:c.areaId||""});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/centros-custo",c.id)}>🗑️</button></td></>)}
                    </tr>))}
                </tbody>
                <tfoot>
                  <tr><td><input className="cell-input" value={fCC.codigo} onChange={e=>setFCC(f=>({...f,codigo:e.target.value}))} placeholder="11.100" style={{width:50}} onKeyDown={e=>{if(e.key==="Enter")criarCentro();}} /></td><td><input className="cell-input" value={fCC.nome} onChange={e=>setFCC(f=>({...f,nome:e.target.value}))} placeholder="Centro de Custo" onKeyDown={e=>{if(e.key==="Enter")criarCentro();}} /></td><td><select className="cell-input" aria-label="Área de Negócio" required value={fCC.areaId} onChange={e=>{setFCC(f=>({...f,areaId:e.target.value}));setCcError("");}}><option value="" disabled>Área *</option>{areas.map(a=><option key={a.id} value={a.id}>{a.codigo} | {a.nome}</option>)}</select></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={criarCentro} disabled={saving}>+</button></td></tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
