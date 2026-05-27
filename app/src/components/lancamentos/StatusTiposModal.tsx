"use client";
import { useState, useEffect, useCallback } from "react";
import type { StatusManualTipoDTO } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void; // callback para recarregar statusTipos no pai
}

const CORES_PRESET = [
  "#22c55e", // verde
  "#86efac", // verde claro
  "#ef4444", // vermelho
  "#6b7280", // cinza escuro
  "#fbbf24", // amarelo
  "#f5f5dc", // bege
  "#ffffff", // branco
  "#000000", // preto
  "#7c3aed", // roxo
  "#3b82f6", // azul
  "#f97316", // laranja
  "#ec4899", // rosa
];

export default function StatusTiposModal({ open, onClose, onUpdate }: Props) {
  const [titulo, setTitulo] = useState("VALOR PREVISTO");
  const [tituloEdit, setTituloEdit] = useState("VALOR PREVISTO");
  const [editingTitulo, setEditingTitulo] = useState(false);

  const [tipos, setTipos] = useState<StatusManualTipoDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Form para novo item
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoCor, setNovoCor] = useState("#94a3b8");

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ codigo: string; nome: string; cor: string }>({ codigo: "", nome: "", cor: "" });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tiposRes = await fetch("/api/status-tipos");
      const tiposData = await tiposRes.json();
      if (Array.isArray(tiposData)) setTipos(tiposData);
    } catch {}
    try {
      const configRes = await fetch("/api/status-tipos/config");
      const configData = await configRes.json();
      if (configData.titulo) {
        setTitulo(configData.titulo);
        setTituloEdit(configData.titulo);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Salvar título
  const salvarTitulo = async () => {
    if (!tituloEdit.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/status-tipos/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tituloEdit }),
      });
      if (res.ok) {
        setTitulo(tituloEdit.trim());
        setEditingTitulo(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // Criar novo status
  const criarStatus = async () => {
    if (!novoCodigo.trim() || !novoNome.trim()) {
      setError("Código e nome são obrigatórios");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/status-tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: novoCodigo,
          nome: novoNome,
          cor: novoCor,
          ordem: tipos.length,
        }),
      });
      if (res.ok) {
        setNovoCodigo("");
        setNovoNome("");
        setNovoCor("#94a3b8");
        await loadData();
        onUpdate();
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao criar");
      }
    } finally {
      setSaving(false);
    }
  };

  // Iniciar edição
  const startEdit = (tipo: StatusManualTipoDTO) => {
    setEditingId(tipo.id);
    setEditData({ codigo: tipo.codigo, nome: tipo.nome, cor: tipo.cor || "#94a3b8" });
  };

  // Salvar edição
  const salvarEdit = async () => {
    if (!editingId || !editData.nome.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/status-tipos/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditingId(null);
        await loadData();
        onUpdate();
      } else {
        const err = await res.json();
        setError(err.error || "Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  };

  // Excluir (soft delete)
  const excluirStatus = async (id: string) => {
    if (!confirm("Deseja desativar este status?")) return;
    setSaving(true);
    try {
      await fetch(`/api/status-tipos/${id}`, { method: "DELETE" });
      await loadData();
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        {/* Header com título editável */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            {editingTitulo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="text"
                  value={tituloEdit}
                  onChange={e => setTituloEdit(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") salvarTitulo(); if (e.key === "Escape") { setTituloEdit(titulo); setEditingTitulo(false); } }}
                  className="modal-title-input"
                  autoFocus
                />
                <button className="btn btn-sm btn-primary" onClick={salvarTitulo} disabled={saving}>✓</button>
                <button className="btn btn-sm btn-outline" onClick={() => { setTituloEdit(titulo); setEditingTitulo(false); }}>✕</button>
              </div>
            ) : (
              <h2
                className="modal-title"
                onClick={() => setEditingTitulo(true)}
                title="Clique para editar o título"
                style={{ cursor: "pointer", borderBottom: "1px dashed var(--border)" }}
              >
                {titulo} <span style={{ fontSize: 12, opacity: 0.5 }}>✏️</span>
              </h2>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Configure os status manuais disponíveis nos lançamentos. Cada status tem um código, nome e cor.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          {/* Lista de status existentes */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>Carregando...</div>
          ) : tipos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 8 }}>
              Nenhum status cadastrado ainda. Use o formulário abaixo para adicionar.
            </div>
          ) : (
            <div className="status-list">
              {tipos.map((tipo, idx) => (
                <div key={tipo.id} className="status-item">
                  {editingId === tipo.id ? (
                    // Modo edição
                    <div className="status-item-edit">
                      <input
                        type="text"
                        value={editData.codigo}
                        onChange={e => setEditData(d => ({ ...d, codigo: e.target.value }))}
                        className="status-input status-input-codigo"
                        placeholder="Código"
                      />
                      <input
                        type="text"
                        value={editData.nome}
                        onChange={e => setEditData(d => ({ ...d, nome: e.target.value }))}
                        className="status-input status-input-nome"
                        placeholder="Nome"
                      />
                      <div className="color-picker-inline">
                        <input
                          type="color"
                          value={editData.cor}
                          onChange={e => setEditData(d => ({ ...d, cor: e.target.value }))}
                          className="color-input"
                        />
                        <div className="color-presets">
                          {CORES_PRESET.map(c => (
                            <button
                              key={c}
                              className={`color-dot ${editData.cor === c ? "active" : ""}`}
                              style={{ background: c }}
                              onClick={() => setEditData(d => ({ ...d, cor: c }))}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="status-item-actions">
                        <button className="btn btn-sm btn-primary" onClick={salvarEdit} disabled={saving}>Salvar</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    // Modo leitura
                    <div className="status-item-view">
                      <div
                        className="status-badge"
                        style={{ background: tipo.cor || "#94a3b8", color: isLightColor(tipo.cor || "#94a3b8") ? "#000" : "#fff" }}
                      >
                        {tipo.codigo} | {tipo.nome}
                      </div>
                      <div className="status-item-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => startEdit(tipo)} title="Editar">✏️</button>
                        <button className="btn btn-sm btn-outline btn-danger" onClick={() => excluirStatus(tipo.id)} title="Desativar">🗑️</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Formulário para novo status */}
          <div className="status-new-form">
            <h4 style={{ margin: "16px 0 8px", fontSize: 13, fontWeight: 600 }}>Adicionar novo status</h4>
            <div className="status-new-row">
              <input
                type="text"
                value={novoCodigo}
                onChange={e => setNovoCodigo(e.target.value)}
                placeholder="Código (ex: 09)"
                className="status-input status-input-codigo"
              />
              <input
                type="text"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome (ex: EM ANÁLISE)"
                className="status-input status-input-nome"
              />
              <div className="color-picker-inline">
                <input
                  type="color"
                  value={novoCor}
                  onChange={e => setNovoCor(e.target.value)}
                  className="color-input"
                />
                <div className="color-presets">
                  {CORES_PRESET.map(c => (
                    <button
                      key={c}
                      className={`color-dot ${novoCor === c ? "active" : ""}`}
                      style={{ background: c }}
                      onClick={() => setNovoCor(c)}
                    />
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={criarStatus} disabled={saving}>
                + Adicionar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper: determina se uma cor é clara (para decidir cor do texto)
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
