"use client";

import { useState, useEffect, useCallback } from "react";

interface Fornecedor { id: string; codigo: string; nome: string; display?: string; }
interface Cliente { id: string; codigo: string; nome: string; email?: string; telefone?: string; documento?: string; endereco?: string; }

type Tab = "fornecedores" | "clientes";

export default function DimensoesCadastraisPage() {
  const [tab, setTab] = useState<Tab>("fornecedores");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Form fornecedor
  const [fCodigo, setFCodigo] = useState("");
  const [fNome, setFNome] = useState("");

  // Form cliente
  const [cCodigo, setCCodigo] = useState("");
  const [cNome, setCNome] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cTelefone, setCTelefone] = useState("");
  const [cDocumento, setCDocumento] = useState("");
  const [cEndereco, setCEndereco] = useState("");

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "fornecedores") {
        const res = await fetch("/api/fornecedores");
        const data = await res.json();
        if (Array.isArray(data)) setFornecedores(data);
      } else {
        const res = await fetch("/api/clientes");
        const data = await res.json();
        if (Array.isArray(data)) setClientes(data);
      }
    } catch { setError("Erro ao carregar dados"); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  // Criar fornecedor
  const criarFornecedor = async () => {
    if (!fCodigo.trim() || !fNome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/fornecedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: fCodigo, nome: fNome }) });
      if (res.ok) { setFCodigo(""); setFNome(""); loadData(); }
      else { const err = await res.json(); setError(err.error || "Erro ao criar"); }
    } finally { setSaving(false); }
  };

  // Criar cliente
  const criarCliente = async () => {
    if (!cCodigo.trim() || !cNome.trim()) { setError("Código e nome são obrigatórios"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: cCodigo, nome: cNome, email: cEmail, telefone: cTelefone, documento: cDocumento, endereco: cEndereco }) });
      if (res.ok) { setCCodigo(""); setCNome(""); setCEmail(""); setCTelefone(""); setCDocumento(""); setCEndereco(""); loadData(); }
      else { const err = await res.json(); setError(err.error || "Erro ao criar"); }
    } finally { setSaving(false); }
  };

  const handleEdit = (item: any) => { setEditingId(item.id); setEditData({ ...item }); };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const api = tab === "fornecedores" ? "/api/fornecedores" : "/api/clientes";
    try {
      const res = await fetch(`${api}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editData) });
      if (res.ok) { setEditingId(null); loadData(); }
      else { const err = await res.json(); setError(err.error || "Erro ao salvar"); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Desativar este cadastro?")) return;
    const api = tab === "fornecedores" ? "/api/fornecedores" : "/api/clientes";
    await fetch(`${api}/${id}`, { method: "DELETE" });
    loadData();
  };

  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dimensões Cadastrais</h1>
          <p className="page-sub">Estrutura Empresa — Fornecedores e Clientes</p>
        </div>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => { setTab("fornecedores"); setEditingId(null); setError(""); }} style={{ padding: "10px 16px", fontSize: 13, fontWeight: tab === "fornecedores" ? 600 : 400, color: tab === "fornecedores" ? "var(--accent-blue)" : "var(--text-secondary)", background: "none", border: "none", borderBottom: tab === "fornecedores" ? "2px solid var(--accent-blue)" : "2px solid transparent", cursor: "pointer" }}>
            🏭 Fornecedores
          </button>
          <button onClick={() => { setTab("clientes"); setEditingId(null); setError(""); }} style={{ padding: "10px 16px", fontSize: 13, fontWeight: tab === "clientes" ? 600 : 400, color: tab === "clientes" ? "var(--accent-blue)" : "var(--text-secondary)", background: "none", border: "none", borderBottom: tab === "clientes" ? "2px solid var(--accent-blue)" : "2px solid transparent", cursor: "pointer" }}>
            👥 Clientes
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Formulário de adição */}
        {tab === "fornecedores" ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={fCodigo} onChange={e => setFCodigo(e.target.value)} placeholder="Ex: F001" style={{ width: 100 }} /></div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}><label>Nome</label><input type="text" value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Ex: Suprimentos ABC" /></div>
            <button className="btn btn-primary" onClick={criarFornecedor} disabled={saving}>+ Adicionar</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Código</label><input type="text" value={cCodigo} onChange={e => setCCodigo(e.target.value)} placeholder="Ex: C001" style={{ width: 80 }} /></div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}><label>Nome</label><input type="text" value={cNome} onChange={e => setCNome(e.target.value)} placeholder="Nome do cliente" /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Email</label><input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="email@..." style={{ width: 160 }} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>Telefone</label><input type="text" value={cTelefone} onChange={e => setCTelefone(e.target.value)} placeholder="(00) 00000-0000" style={{ width: 130 }} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>CPF/CNPJ</label><input type="text" value={cDocumento} onChange={e => setCDocumento(e.target.value)} placeholder="Documento" style={{ width: 140 }} /></div>
            <button className="btn btn-primary" onClick={criarCliente} disabled={saving}>+ Adicionar</button>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</div>
        ) : tab === "fornecedores" ? (
          fornecedores.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum fornecedor cadastrado.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{ width: 80 }}>Código</th><th>Nome</th><th style={{ width: 100, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {fornecedores.map(f => (
                  <tr key={f.id}>
                    {editingId === f.id ? (
                      <>
                        <td><input className="cell-input" value={editData.codigo || ""} onChange={e => setEditData((d: any) => ({ ...d, codigo: e.target.value }))} style={{ width: 70 }} /></td>
                        <td><input className="cell-input" value={editData.nome || ""} onChange={e => setEditData((d: any) => ({ ...d, nome: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }} autoFocus /></td>
                        <td style={{ textAlign: "center" }}>
                          <button className="action-btn" style={{ color: "var(--accent-green)", opacity: 1 }} onClick={handleSaveEdit}>✓</button>
                          <button className="action-btn" style={{ opacity: 1 }} onClick={() => setEditingId(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{f.codigo}</span></td>
                        <td>{f.nome}</td>
                        <td style={{ textAlign: "center" }}>
                          <button className="action-btn" onClick={() => handleEdit(f)} title="Editar">✏️</button>
                          <button className="action-btn" onClick={() => handleDelete(f.id)} title="Desativar">🗑️</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          clientes.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum cliente cadastrado.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{ width: 70 }}>Código</th><th>Nome</th><th>Email</th><th>Telefone</th><th style={{ width: 130 }}>CPF/CNPJ</th><th style={{ width: 90, textAlign: "center" }}>Ações</th></tr></thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    {editingId === c.id ? (
                      <>
                        <td><input className="cell-input" value={editData.codigo || ""} onChange={e => setEditData((d: any) => ({ ...d, codigo: e.target.value }))} style={{ width: 60 }} /></td>
                        <td><input className="cell-input" value={editData.nome || ""} onChange={e => setEditData((d: any) => ({ ...d, nome: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }} autoFocus /></td>
                        <td><input className="cell-input" value={editData.email || ""} onChange={e => setEditData((d: any) => ({ ...d, email: e.target.value }))} /></td>
                        <td><input className="cell-input" value={editData.telefone || ""} onChange={e => setEditData((d: any) => ({ ...d, telefone: e.target.value }))} /></td>
                        <td><input className="cell-input" value={editData.documento || ""} onChange={e => setEditData((d: any) => ({ ...d, documento: e.target.value }))} /></td>
                        <td style={{ textAlign: "center" }}>
                          <button className="action-btn" style={{ color: "var(--accent-green)", opacity: 1 }} onClick={handleSaveEdit}>✓</button>
                          <button className="action-btn" style={{ opacity: 1 }} onClick={() => setEditingId(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{c.codigo}</span></td>
                        <td>{c.nome}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.email || "—"}</td>
                        <td style={{ fontSize: 12 }}>{c.telefone || "—"}</td>
                        <td style={{ fontSize: 12 }}>{c.documento || "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          <button className="action-btn" onClick={() => handleEdit(c)} title="Editar">✏️</button>
                          <button className="action-btn" onClick={() => handleDelete(c.id)} title="Desativar">🗑️</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
