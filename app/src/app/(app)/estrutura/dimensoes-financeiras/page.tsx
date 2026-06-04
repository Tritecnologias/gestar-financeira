"use client";

import { useState, useEffect, useCallback } from "react";

interface Item {
  id: string;
  codigo: string;
  nome?: string;
  descricao?: string;
  tipo?: string;
  ordem?: number;
}

type Tab = "plano" | "centros" | "categorias" | "dre";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "plano", label: "Plano de Contas", icon: "📋" },
  { key: "centros", label: "Centros de Custo", icon: "🏢" },
  { key: "categorias", label: "Categorias", icon: "🏷️" },
  { key: "dre", label: "DRE", icon: "📊" },
];

const API_MAP: Record<Tab, string> = {
  plano: "/api/plano-contas",
  centros: "/api/centros-custo",
  categorias: "/api/categorias",
  dre: "/api/dre",
};

export default function DimensoesFinanceirasPage() {
  const [tab, setTab] = useState<Tab>("plano");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form
  const [formCodigo, setFormCodigo] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formTipo, setFormTipo] = useState("");
  const [saving, setSaving] = useState(false);

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCodigo, setEditCodigo] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editTipo, setEditTipo] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_MAP[tab]);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch { setError("Erro ao carregar dados"); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = async () => {
    const nome = formNome.trim();
    const codigo = formCodigo.trim();
    if (!codigo || !nome) { setError("Código e nome são obrigatórios"); return; }
    setError("");
    setSaving(true);
    try {
      const body: any = tab === "plano"
        ? { codigo, descricao: nome, tipo: formTipo || "DESPESA" }
        : { codigo, nome, ...(tab === "categorias" && formTipo ? { tipo: formTipo } : {}) };
      const res = await fetch(API_MAP[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setFormCodigo("");
        setFormNome("");
        setFormTipo("");
        loadItems();
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao criar");
      }
    } finally { setSaving(false); }
  };

  const handleEdit = (item: Item) => {
    setEditingId(item.id);
    setEditCodigo(item.codigo || "");
    setEditNome(item.nome || item.descricao || "");
    setEditTipo(item.tipo || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editNome.trim()) return;
    setSaving(true);
    try {
      const body: any = tab === "plano"
        ? { codigo: editCodigo, descricao: editNome, tipo: editTipo || "DESPESA" }
        : { codigo: editCodigo, nome: editNome, ...(tab === "categorias" && editTipo ? { tipo: editTipo } : {}) };
      const res = await fetch(`${API_MAP[tab]}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setEditingId(null); loadItems(); }
      else { const err = await res.json(); setError(err.error || "Erro ao salvar"); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Desativar este item?")) return;
    await fetch(`${API_MAP[tab]}/${id}`, { method: "DELETE" });
    loadItems();
  };

  const getDisplayName = (item: Item) => item.nome || item.descricao || "";
  const showTipoField = tab === "plano" || tab === "categorias";

  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dimensões Financeiras</h1>
          <p className="page-sub">Estrutura Empresa — Plano de Contas, Centros de Custo, Categorias e DRE</p>
        </div>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setEditingId(null); setError(""); }}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? "var(--accent-blue)" : "var(--text-secondary)",
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Formulário de adição */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Código</label>
            <input type="text" value={formCodigo} onChange={e => setFormCodigo(e.target.value)} placeholder="Ex: 1.1" style={{ width: 100 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <label>{tab === "plano" ? "Descrição" : "Nome"}</label>
            <input type="text" value={formNome} onChange={e => setFormNome(e.target.value)} placeholder={tab === "plano" ? "Ex: Receitas Operacionais" : "Ex: Marketing"} />
          </div>
          {showTipoField && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tipo</label>
              <select value={formTipo} onChange={e => setFormTipo(e.target.value)} style={{ width: 140 }}>
                <option value="">—</option>
                <option value="RECEITA">Receita</option>
                <option value="DESPESA">Despesa</option>
                {tab === "plano" && <option value="TRANSFERENCIA">Transferência</option>}
              </select>
            </div>
          )}
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            + Adicionar
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>
            Nenhum item cadastrado. Use o formulário acima para adicionar.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Código</th>
                <th>{tab === "plano" ? "Descrição" : "Nome"}</th>
                {showTipoField && <th style={{ width: 120 }}>Tipo</th>}
                <th style={{ width: 100, textAlign: "center" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td><input className="cell-input" value={editCodigo} onChange={e => setEditCodigo(e.target.value)} style={{ width: 70 }} /></td>
                      <td><input className="cell-input" value={editNome} onChange={e => setEditNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null); }} autoFocus /></td>
                      {showTipoField && (
                        <td>
                          <select className="cell-input" value={editTipo} onChange={e => setEditTipo(e.target.value)}>
                            <option value="">—</option>
                            <option value="RECEITA">Receita</option>
                            <option value="DESPESA">Despesa</option>
                            {tab === "plano" && <option value="TRANSFERENCIA">Transferência</option>}
                          </select>
                        </td>
                      )}
                      <td style={{ textAlign: "center" }}>
                        <button className="action-btn" style={{ color: "var(--accent-green)", opacity: 1 }} onClick={handleSaveEdit}>✓</button>
                        <button className="action-btn" style={{ opacity: 1 }} onClick={() => setEditingId(null)}>✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{item.codigo}</span></td>
                      <td>{getDisplayName(item)}</td>
                      {showTipoField && <td><span className={`chip ${item.tipo === "RECEITA" ? "chip-entrada" : item.tipo === "DESPESA" ? "chip-saida" : "chip-cancelado"}`}>{item.tipo || "—"}</span></td>}
                      <td style={{ textAlign: "center" }}>
                        <button className="action-btn" onClick={() => handleEdit(item)} title="Editar">✏️</button>
                        <button className="action-btn" onClick={() => handleDelete(item.id)} title="Desativar">🗑️</button>
                      </td>
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
