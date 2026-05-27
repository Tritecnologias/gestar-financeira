"use client";
import { useEffect, useRef, useState } from "react";
import type { ColConfig, LayoutColunasDTO } from "@/types";
import { DEFAULT_COLUNAS_CONFIG, COLUNAS_DEF } from "./colunasConfig";

interface Props {
  onLayoutChange: (colunas: ColConfig[]) => void;
}

export default function LayoutManager({ onLayoutChange }: Props) {
  const [layouts, setLayouts] = useState<LayoutColunasDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [colConfig, setColConfig] = useState<ColConfig[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gestar_col_config");
      if (saved) try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_COLUNAS_CONFIG;
  });
  const [selectorOpen, setSelectorOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Drag & drop no painel de seletor
  const OBRIGATORIAS = new Set(["acoes"]);
  const panelDragKey = useRef<string | null>(null);
  const [panelDragOver, setPanelDragOver] = useState<string | null>(null);

  const handlePanelDragStart = (key: string) => {
    if (OBRIGATORIAS.has(key)) return;
    panelDragKey.current = key;
  };
  const handlePanelDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setPanelDragOver(key);
  };
  const handlePanelDrop = (targetKey: string) => {
    const srcKey = panelDragKey.current;
    if (!srcKey || srcKey === targetKey) { setPanelDragOver(null); panelDragKey.current = null; return; }
    setColConfig(prev => {
      const ordered = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const si = ordered.findIndex(c => c.key === srcKey);
      const ti = ordered.findIndex(c => c.key === targetKey);
      if (si < 0 || ti < 0) return prev;
      const r = [...ordered];
      const [m] = r.splice(si, 1);
      r.splice(ti, 0, m);
      return r.map((c, i) => ({ ...c, order: i }));
    });
    setPanelDragOver(null);
    panelDragKey.current = null;
  };
  const handlePanelDragEnd = () => { panelDragKey.current = null; setPanelDragOver(null); };

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Carregar layouts da API
  useEffect(() => {
    fetch("/api/layouts").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setLayouts(data);
        const def = data.find((l: LayoutColunasDTO) => l.isDefault);
        if (def) applyLayout(def.colunas);
      }
    }).catch(() => {});
  }, []);

  // Propagar mudanças
  useEffect(() => {
    onLayoutChange(colConfig);
    localStorage.setItem("gestar_col_config", JSON.stringify(colConfig));
  }, [colConfig]);

  const applyLayout = (colunas: ColConfig[]) => {
    setColConfig(colunas);
  };

  const toggleCol = (key: string) => {
    // Não ocultar coluna de ações
    if (key === "acoes") return;
    setColConfig(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const resetLayout = () => setColConfig(DEFAULT_COLUNAS_CONFIG);

  const saveLayout = async () => {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim(), colunas: colConfig, isDefault: false }),
      });
      if (res.ok) {
        const layout = await res.json();
        setLayouts(prev => [...prev, layout]);
        setNovoNome("");
      }
    } finally { setSaving(false); }
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/layouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "default-update", colunas: colConfig, isDefault: true }),
    });
    setLayouts(prev => prev.map(l => ({ ...l, isDefault: l.id === id })));
  };

  const deleteLayout = async (id: string) => {
    if (!confirm("Excluir este layout?")) return;
    const res = await fetch(`/api/layouts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLayouts(prev => prev.filter(l => l.id !== id));
    }
  };

  const visibleCount = colConfig.filter(c => c.visible).length;

  return (
    <div ref={ref} style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
      {/* Botão seletor de colunas */}
      <button
        className="btn btn-outline"
        onClick={() => { setSelectorOpen(p => !p); setOpen(false); }}
        title="Selecionar colunas visíveis"
        style={{ gap: 5 }}
      >
        <span>⊞</span> Colunas <span style={{ fontSize: 11, background: "var(--accent-blue)", color: "#fff", borderRadius: 10, padding: "1px 6px" }}>{visibleCount}</span>
      </button>

      {/* Botão layouts salvos */}
      <button
        className="btn btn-outline"
        onClick={() => { setOpen(p => !p); setSelectorOpen(false); }}
        title="Layouts salvos"
      >
        <span>📐</span> Layouts
      </button>

      {/* Painel: seletor de colunas */}
      {selectorOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 6,
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.1)", padding: "12px 0",
          width: 240, maxHeight: 420, overflowY: "auto",
        }}>
          <div style={{ padding: "4px 16px 10px", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Colunas Visíveis
          </div>
          {/* ordenadas pelo order atual */}
          {[...COLUNAS_DEF]
            .filter(c => c.key !== "acoes")
            .sort((a, b) => {
              const oa = colConfig.find(c => c.key === a.key)?.order ?? 999;
              const ob = colConfig.find(c => c.key === b.key)?.order ?? 999;
              return oa - ob;
            })
            .map(col => {
              const cfg        = colConfig.find(c => c.key === col.key);
              const obrigatorio = OBRIGATORIAS.has(col.key);
              const isDragOver  = panelDragOver === col.key;
              return (
                <div
                  key={col.key}
                  draggable={!obrigatorio}
                  onDragStart={() => handlePanelDragStart(col.key)}
                  onDragOver={e  => handlePanelDragOver(e, col.key)}
                  onDrop={() => handlePanelDrop(col.key)}
                  onDragEnd={handlePanelDragEnd}
                  onDragLeave={() => setPanelDragOver(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 16px",
                    cursor: obrigatorio ? "not-allowed" : "grab",
                    opacity: obrigatorio ? 0.5 : 1,
                    background: isDragOver ? "rgba(37,99,235,0.07)" : "transparent",
                    borderTop: isDragOver ? "2px solid var(--accent-blue)" : "2px solid transparent",
                    transition: "background 0.1s, border-top 0.1s",
                    userSelect: "none",
                  }}
                >
                  {/* handle de drag */}
                  <span style={{ fontSize: 13, opacity: obrigatorio ? 0.2 : 0.35, cursor: obrigatorio ? "not-allowed" : "grab" }}>⠿</span>
                  <input
                    type="checkbox"
                    checked={cfg?.visible ?? true}
                    onChange={() => toggleCol(col.key)}
                    disabled={obrigatorio}
                    style={{ cursor: obrigatorio ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1 }}>{col.label}</span>
                </div>
              );
            })
          }
          <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0", padding: "8px 16px 0" }}>
            <button className="btn btn-outline" style={{ width: "100%", fontSize: 12 }} onClick={resetLayout}>
              Restaurar padrão
            </button>
          </div>
        </div>
      )}

      {/* Painel: layouts salvos */}
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 120, zIndex: 50, marginTop: 6,
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.1)", padding: 16,
          width: 280,
        }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>
            Layouts Salvos
          </div>

          {layouts.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Nenhum layout salvo ainda.</div>
          )}

          {layouts.map(layout => (
            <div key={layout.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: 12, justifyContent: "flex-start" }}
                onClick={() => applyLayout(layout.colunas as ColConfig[])}
              >
                {layout.isDefault ? "⭐ " : ""}{layout.nome}
              </button>
              {!layout.isDefault && (
                <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }} onClick={() => setDefault(layout.id)} title="Definir como padrão">☆</button>
              )}
              <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-muted)", padding: "2px 4px", borderRadius: 4, transition: "color 0.15s" }} onClick={() => deleteLayout(layout.id)} title="Excluir layout">🗑️</button>
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Salvar configuração atual:</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="filter-input"
                placeholder="Nome do layout..."
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                style={{ flex: 1, fontSize: 12 }}
              />
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveLayout} disabled={saving || !novoNome.trim()}>
                {saving ? "..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
