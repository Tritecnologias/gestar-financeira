"use client";
import { useState, useEffect, useCallback } from "react";

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
      if (res.ok) { reset(); loadData(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const salvarEdit = async () => {
    if (!editingId || !editSection) return; setSaving(true);
    const apiMap: Record<string, string> = { emp: "/api/empresa", banco: "/api/dados-bancarios", area: "/api/areas-negocio", cc: "/api/centros-custo" };
    try {
      const res = await fetch(`${apiMap[editSection]}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); setEditSection(null); loadData(); } else { const e = await res.json(); setError(e.error); }
    } finally { setSaving(false); }
  };

  const excluir = async (api: string, id: string) => { if (!confirm("Desativar?")) return; await fetch(`${api}/${id}`, { method: "DELETE" }); loadData(); };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <header className="topbar"><div><h1 className="page-title">Dimensão da Empresa</h1><p className="page-sub">Estrutura Empresa — Dados cadastrais, bancários, áreas e centros de custo</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div style={{ marginBottom: 12 }}><input type="text" className="filter-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar..." style={{ width: 300 }} /></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* ESQUERDA */}
          <div>
            {/* DADOS EMPRESARIAIS */}
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏢 DADOS EMPRESARIAIS</h3>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 20 }}>
              <table className="data-table" style={{ width: "100%", fontSize: 11 }}>
                <thead><tr><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2}}>Razão Social</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:100}}>Fantasia</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:110}}>CNPJ</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60,textAlign:"center"}}>Ações</th></tr></thead>
                <tbody>
                  {empresas.filter(e => !busca || e.razaoSocial.toLowerCase().includes(busca.toLowerCase())).map(e=>(
                    <tr key={e.id}>
                      {editingId===e.id&&editSection==="emp"?(<><td><input className="cell-input" value={editData.razaoSocial||""} onChange={ev=>setEditData((d:any)=>({...d,razaoSocial:ev.target.value}))} onKeyDown={ev=>{if(ev.key==="Enter")salvarEdit();if(ev.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><input className="cell-input" value={editData.nomeFantasia||""} onChange={ev=>setEditData((d:any)=>({...d,nomeFantasia:ev.target.value}))} /></td><td><input className="cell-input" value={editData.cnpj||""} onChange={ev=>setEditData((d:any)=>({...d,cnpj:ev.target.value}))} /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td style={{fontWeight:500}}>{e.razaoSocial}</td><td style={{fontSize:10,color:"var(--text-secondary)"}}>{e.nomeFantasia||"—"}</td><td style={{fontSize:10}}>{e.cnpj||"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(e.id);setEditSection("emp");setEditData({...e});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/empresa",e.id)}>🗑️</button></td></>)}
                    </tr>))}
                  <tr style={{background:"rgba(5,150,105,0.04)"}}><td><input className="cell-input" value={fEmp.razaoSocial} onChange={e=>setFEmp(f=>({...f,razaoSocial:e.target.value}))} placeholder="Razão Social *" onKeyDown={e=>{if(e.key==="Enter")criar("/api/empresa",fEmp,()=>setFEmp({razaoSocial:"",nomeFantasia:"",cnpj:"",telefone:"",email:""}));}} /></td><td><input className="cell-input" value={fEmp.nomeFantasia} onChange={e=>setFEmp(f=>({...f,nomeFantasia:e.target.value}))} placeholder="Fantasia" /></td><td><input className="cell-input" value={fEmp.cnpj} onChange={e=>setFEmp(f=>({...f,cnpj:e.target.value}))} placeholder="CNPJ" /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>criar("/api/empresa",fEmp,()=>setFEmp({razaoSocial:"",nomeFantasia:"",cnpj:"",telefone:"",email:""}))} disabled={saving}>+</button></td></tr>
                </tbody>
              </table>
            </div>

            {/* DADOS BANCÁRIOS */}
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏦 DADOS BANCÁRIOS</h3>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 11 }}>
                <thead><tr><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2}}>Banco</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:70}}>Agência</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:80}}>Conta</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:80}}>Tipo</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60,textAlign:"center"}}>Ações</th></tr></thead>
                <tbody>
                  {bancos.filter(b=>!busca||b.banco.toLowerCase().includes(busca.toLowerCase())||(b.agencia||"").includes(busca)||(b.conta||"").includes(busca)).map(b=>(
                    <tr key={b.id}>
                      {editingId===b.id&&editSection==="banco"?(<><td><input className="cell-input" value={editData.banco||""} onChange={e=>setEditData((d:any)=>({...d,banco:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><input className="cell-input" value={editData.agencia||""} onChange={e=>setEditData((d:any)=>({...d,agencia:e.target.value}))} /></td><td><input className="cell-input" value={editData.conta||""} onChange={e=>setEditData((d:any)=>({...d,conta:e.target.value}))} /></td><td><input className="cell-input" value={editData.tipo||""} onChange={e=>setEditData((d:any)=>({...d,tipo:e.target.value}))} /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td>{b.banco}</td><td style={{fontSize:10}}>{b.agencia||"—"}</td><td style={{fontSize:10}}>{b.conta||"—"}</td><td style={{fontSize:10}}>{b.tipo||"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(b.id);setEditSection("banco");setEditData({...b});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/dados-bancarios",b.id)}>🗑️</button></td></>)}
                    </tr>))}
                  <tr style={{background:"rgba(5,150,105,0.04)"}}><td><input className="cell-input" value={fBanco.banco} onChange={e=>setFBanco(f=>({...f,banco:e.target.value}))} placeholder="Banco *" onKeyDown={e=>{if(e.key==="Enter")criar("/api/dados-bancarios",fBanco,()=>setFBanco({banco:"",agencia:"",conta:"",tipo:"",titular:""}));}} /></td><td><input className="cell-input" value={fBanco.agencia} onChange={e=>setFBanco(f=>({...f,agencia:e.target.value}))} placeholder="Ag." /></td><td><input className="cell-input" value={fBanco.conta} onChange={e=>setFBanco(f=>({...f,conta:e.target.value}))} placeholder="Conta" /></td><td><input className="cell-input" value={fBanco.tipo} onChange={e=>setFBanco(f=>({...f,tipo:e.target.value}))} placeholder="CC/CP" /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>criar("/api/dados-bancarios",fBanco,()=>setFBanco({banco:"",agencia:"",conta:"",tipo:"",titular:""}))} disabled={saving}>+</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* DIREITA */}
          <div>
            {/* ÁREA DE NEGÓCIO */}
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📊 ÁREA DE NEGÓCIO</h3>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 20 }}>
              <table className="data-table" style={{ width: "100%", fontSize: 11 }}>
                <thead><tr><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60}}>Código</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2}}>Descrição</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60,textAlign:"center"}}>Ações</th></tr></thead>
                <tbody>
                  {areas.filter(a=>!busca||a.nome.toLowerCase().includes(busca.toLowerCase())||a.codigo.includes(busca)).map(a=>(
                    <tr key={a.id}>
                      {editingId===a.id&&editSection==="area"?(<><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:50}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td><span style={{fontWeight:600}}>{a.codigo}</span></td><td>{a.nome}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(a.id);setEditSection("area");setEditData({...a});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/areas-negocio",a.id)}>🗑️</button></td></>)}
                    </tr>))}
                  <tr style={{background:"rgba(5,150,105,0.04)"}}><td><input className="cell-input" value={fArea.codigo} onChange={e=>setFArea(f=>({...f,codigo:e.target.value}))} placeholder="10" style={{width:50}} onKeyDown={e=>{if(e.key==="Enter"&&fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} /></td><td><input className="cell-input" value={fArea.nome} onChange={e=>setFArea(f=>({...f,nome:e.target.value}))} placeholder="Área de Negócio" onKeyDown={e=>{if(e.key==="Enter"&&fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} /></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>{if(fArea.codigo&&fArea.nome)criar("/api/areas-negocio",fArea,()=>setFArea({codigo:"",nome:""}));}} disabled={saving}>+</button></td></tr>
                </tbody>
              </table>
            </div>

            {/* CENTRO DE CUSTO */}
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏷️ CENTRO DE CUSTO</h3>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 11 }}>
                <thead><tr><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60}}>Código</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2}}>Descrição</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:120}}>Área</th><th style={{position:"sticky",top:0,background:"#F8FAFC",zIndex:2,width:60,textAlign:"center"}}>Ações</th></tr></thead>
                <tbody>
                  {centros.filter(c=>!busca||c.nome.toLowerCase().includes(busca.toLowerCase())||c.codigo.includes(busca)).map(c=>(
                    <tr key={c.id}>
                      {editingId===c.id&&editSection==="cc"?(<><td><input className="cell-input" value={editData.codigo||""} onChange={e=>setEditData((d:any)=>({...d,codigo:e.target.value}))} style={{width:50}} /></td><td><input className="cell-input" value={editData.nome||""} onChange={e=>setEditData((d:any)=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")salvarEdit();if(e.key==="Escape"){setEditingId(null);setEditSection(null);}}} autoFocus /></td><td><select className="cell-input" value={editData.areaId||""} onChange={e=>setEditData((d:any)=>({...d,areaId:e.target.value}))}><option value="">—</option>{areas.map(a=><option key={a.id} value={a.id}>{a.codigo} | {a.nome}</option>)}</select></td><td style={{textAlign:"center"}}><button className="action-btn" style={{color:"var(--accent-green)",opacity:1}} onClick={salvarEdit}>✓</button><button className="action-btn" style={{opacity:1}} onClick={()=>{setEditingId(null);setEditSection(null);}}>✕</button></td></>)
                      :(<><td><span style={{fontWeight:600}}>{c.codigo}</span></td><td>{c.nome}</td><td style={{fontSize:10,color:"var(--text-secondary)"}}>{c.area?`${c.area.codigo} | ${c.area.nome}`:"—"}</td><td style={{textAlign:"center"}}><button className="action-btn" onClick={()=>{setEditingId(c.id);setEditSection("cc");setEditData({...c,areaId:c.areaId||""});}}>✏️</button><button className="action-btn" onClick={()=>excluir("/api/centros-custo",c.id)}>🗑️</button></td></>)}
                    </tr>))}
                  <tr style={{background:"rgba(5,150,105,0.04)"}}><td><input className="cell-input" value={fCC.codigo} onChange={e=>setFCC(f=>({...f,codigo:e.target.value}))} placeholder="11.100" style={{width:50}} onKeyDown={e=>{if(e.key==="Enter"&&fCC.codigo&&fCC.nome)criar("/api/centros-custo",fCC,()=>setFCC({codigo:"",nome:"",areaId:""}));}} /></td><td><input className="cell-input" value={fCC.nome} onChange={e=>setFCC(f=>({...f,nome:e.target.value}))} placeholder="Centro de Custo" onKeyDown={e=>{if(e.key==="Enter"&&fCC.codigo&&fCC.nome)criar("/api/centros-custo",fCC,()=>setFCC({codigo:"",nome:"",areaId:""}));}} /></td><td><select className="cell-input" value={fCC.areaId} onChange={e=>setFCC(f=>({...f,areaId:e.target.value}))}><option value="">—</option>{areas.map(a=><option key={a.id} value={a.id}>{a.codigo} | {a.nome}</option>)}</select></td><td style={{textAlign:"center"}}><button className="btn btn-primary btn-sm" onClick={()=>{if(fCC.codigo&&fCC.nome)criar("/api/centros-custo",fCC,()=>setFCC({codigo:"",nome:"",areaId:""}));}} disabled={saving}>+</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
