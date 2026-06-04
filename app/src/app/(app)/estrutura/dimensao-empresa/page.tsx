"use client";
import { useState, useEffect } from "react";

interface EmpresaData { id?: string; razaoSocial: string; nomeFantasia: string; cnpj: string; inscEstadual: string; telefone: string; email: string; endereco: string; cidade: string; estado: string; cep: string; segmento: string; porte: string; dataFundacao: string; }

const EMPTY: EmpresaData = { razaoSocial: "", nomeFantasia: "", cnpj: "", inscEstadual: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", cep: "", segmento: "", porte: "", dataFundacao: "" };

export default function DimensaoEmpresaPage() {
  const [form, setForm] = useState<EmpresaData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/empresa").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const e = data[0];
        setExistingId(e.id);
        setForm({ razaoSocial: e.razaoSocial || "", nomeFantasia: e.nomeFantasia || "", cnpj: e.cnpj || "", inscEstadual: e.inscEstadual || "", telefone: e.telefone || "", email: e.email || "", endereco: e.endereco || "", cidade: e.cidade || "", estado: e.estado || "", cep: e.cep || "", segmento: e.segmento || "", porte: e.porte || "", dataFundacao: e.dataFundacao?.slice(0, 10) || "" });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const salvar = async () => {
    if (!form.razaoSocial.trim()) { setMsg("❌ Razão social é obrigatória"); return; }
    setSaving(true); setMsg("");
    try {
      const method = existingId ? "PUT" : "POST";
      const url = existingId ? `/api/empresa/${existingId}` : "/api/empresa";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { const d = await res.json(); setExistingId(d.id); setMsg("✅ Salvo com sucesso"); }
      else { const e = await res.json(); setMsg(`❌ ${e.error}`); }
    } finally { setSaving(false); }
  };

  const set = (k: keyof EmpresaData, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  return (
    <div>
      <header className="topbar"><div><h1 className="page-title">Dimensão da Empresa</h1><p className="page-sub">Estrutura Empresa — Dados cadastrais da organização</p></div></header>
      <div style={{ padding: "20px 28px", maxWidth: 800 }}>
        {msg && <div className={`alert ${msg.startsWith("✅") ? "" : "alert-error"}`} style={{ marginBottom: 16, ...(msg.startsWith("✅") ? { background: "var(--kpi-green-bg)", border: "1px solid var(--kpi-green-border)", color: "var(--accent-green)" } : {}) }}>{msg}</div>}

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group"><label>Razão Social *</label><input type="text" value={form.razaoSocial} onChange={e => set("razaoSocial", e.target.value)} /></div>
          <div className="form-group"><label>Nome Fantasia</label><input type="text" value={form.nomeFantasia} onChange={e => set("nomeFantasia", e.target.value)} /></div>
        </div>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group"><label>CNPJ</label><input type="text" value={form.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" /></div>
          <div className="form-group"><label>Inscrição Estadual</label><input type="text" value={form.inscEstadual} onChange={e => set("inscEstadual", e.target.value)} /></div>
        </div>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group"><label>Telefone</label><input type="text" value={form.telefone} onChange={e => set("telefone", e.target.value)} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}><label>Endereço</label><input type="text" value={form.endereco} onChange={e => set("endereco", e.target.value)} /></div>
        <div className="form-row-3" style={{ marginBottom: 14 }}>
          <div className="form-group"><label>Cidade</label><input type="text" value={form.cidade} onChange={e => set("cidade", e.target.value)} /></div>
          <div className="form-group"><label>Estado</label><input type="text" value={form.estado} onChange={e => set("estado", e.target.value)} placeholder="SP" /></div>
          <div className="form-group"><label>CEP</label><input type="text" value={form.cep} onChange={e => set("cep", e.target.value)} placeholder="00000-000" /></div>
        </div>
        <div className="form-row-3" style={{ marginBottom: 14 }}>
          <div className="form-group"><label>Segmento</label><input type="text" value={form.segmento} onChange={e => set("segmento", e.target.value)} placeholder="Tecnologia" /></div>
          <div className="form-group"><label>Porte</label>
            <select value={form.porte} onChange={e => set("porte", e.target.value)}>
              <option value="">—</option><option value="MEI">MEI</option><option value="ME">ME</option><option value="EPP">EPP</option><option value="Médio">Médio</option><option value="Grande">Grande</option>
            </select>
          </div>
          <div className="form-group"><label>Data Fundação</label><input type="date" value={form.dataFundacao} onChange={e => set("dataFundacao", e.target.value)} /></div>
        </div>
        <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>
          {saving ? "Salvando..." : existingId ? "Atualizar Dados" : "Salvar Dados"}
        </button>
      </div>
    </div>
  );
}
