"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { LancamentoDTO, ColConfig, FornecedorDTO, StatusManualTipoDTO } from "@/types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { COLUNAS_DEF, DEFAULT_COLUNAS_CONFIG } from "./colunasConfig";
import LayoutManager from "./LayoutManager";
import StatusTiposModal from "./StatusTiposModal";
import NovoLancamentoModal from "./NovoLancamentoModal";

// ── Chip helpers ─────────────────────────────────────────────
function ChipTipo({ tipo }: { tipo: string }) {
  return <span className={`chip chip-${tipo.toLowerCase()}`}>{tipo === "ENTRADA" ? "ENTRADA" : "SAÍDA"}</span>;
}
function ChipStatus({ status }: { status: string }) {
  const cls: Record<string, string> = { realizado: "chip-realizado", previsto: "chip-previsto", cancelado: "chip-cancelado" };
  return <span className={`chip ${cls[status] ?? "chip-cancelado"}`}>{status}</span>;
}
function ChipStatusAuto({ s }: { s: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    "PAGO":     { cls: "chip-realizado", label: "PAGO" },
    "ATRASADO": { cls: "chip-saida",     label: "ATRASADO" },
    "A VENCER": { cls: "chip-previsto",  label: "A VENCER" },
    "PREVISTO": { cls: "chip-cancelado", label: "PREVISTO" },
  };
  const info = map[s] ?? { cls: "chip-cancelado", label: s };
  return <span className={`chip ${info.cls}`}>{info.label}</span>;
}

// ── Calcula offset sticky acumulado ──────────────────────────
function calcStickyOffsets(colConfig: ColConfig[]) {
  const visibleDefs = COLUNAS_DEF.filter(d => {
    const cfg = colConfig.find(c => c.key === d.key);
    return cfg?.visible !== false;
  }).sort((a, b) => {
    const oa = colConfig.find(c => c.key === a.key)?.order ?? 999;
    const ob = colConfig.find(c => c.key === b.key)?.order ?? 999;
    return oa - ob;
  });

  const leftOffsets: Record<string, number> = {};
  let leftAcc = 0;
  for (const d of visibleDefs) {
    if (!d.stickyLeft) break;
    leftOffsets[d.key] = leftAcc;
    const cfg = colConfig.find(c => c.key === d.key);
    leftAcc += cfg?.width ?? d.width;
  }

  const rightOffsets: Record<string, number> = {};
  let rightAcc = 0;
  for (const d of [...visibleDefs].reverse()) {
    if (!d.stickyRight) break;
    rightOffsets[d.key] = rightAcc;
    const cfg = colConfig.find(c => c.key === d.key);
    rightAcc += cfg?.width ?? d.width;
  }

  return { leftOffsets, rightOffsets };
}

// ── Renderizar valor de célula (modo leitura) ─────────────────
function renderCell(key: string, row: LancamentoDTO, statusTipos?: StatusManualTipoDTO[]): React.ReactNode {
  const val = (row as any)[key];
  if (val === null || val === undefined || val === "") return <span style={{ color: "var(--text-muted)" }}>—</span>;

  // Colunas de data → formato BR
  const DATE_KEYS = new Set(["dataLanc", "dataEmissao", "dataVencOriginal", "dataVencPlano", "dataEvento", "dataPagamento"]);
  if (DATE_KEYS.has(key)) return <span>{formatDate(val)}</span>;

  // SEQ — discreto
  if (key === "seq") return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{val}</span>;

  switch (key) {
    case "tipo":        return <ChipTipo tipo={val} />;
    case "status":      return <ChipStatus status={val} />;
    case "statusAuto":  return <ChipStatusAuto s={val} />;
    case "valor":
    case "valorPrevisto": return <span className={row.tipo === "ENTRADA" ? "val-entrada" : "val-saida"}>{formatCurrency(val)}</span>;
    case "statusManual": {
      const tipo = statusTipos?.find(st => st.codigo === val);
      const label = tipo ? tipo.nome : val;
      const cor = tipo?.cor;
      return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: cor ? `${cor}22` : "rgba(37,99,235,0.1)", color: cor || "var(--accent-blue)" }}>{label}</span>;
    }
    case "rangeAtraso":
      const rangeColor = val === "Pago" || val === "No prazo" ? "var(--accent-green)" : val === "Sem venc." ? "var(--text-muted)" : "var(--accent-red)";
      return <span style={{ color: rangeColor, fontWeight: 600, fontSize: 11 }}>{val}</span>;
    case "diasAtrasoOriginal":
    case "diasAtrasoPlano":
      return <span style={{ color: Number(val) > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>{val}</span>;
    default: return <span>{String(val)}</span>;
  }
}

// ── Componente principal ──────────────────────────────────────
export default function LancamentosClient() {
  // Estado principal
  const [lancamentos, setLancamentos] = useState<LancamentoDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [colConfig, setColConfig] = useState<ColConfig[]>(DEFAULT_COLUNAS_CONFIG);

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<LancamentoDTO>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtros
  const [filtros, setFiltros] = useState({ tipo: "", status: "", statusManual: "", centroCusto: "", fornecedor: "", busca: "", dataInicio: "", dataFim: "" });
  const [pagina, setPagina] = useState(1);

  // Ordenação
  const [sortKey, setSortKey] = useState("seq");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Campos calculados no JS (não mapeados no banco)
  const SORT_COMPUTED = new Set(["statusAuto", "diasAtrasoOriginal", "diasAtrasoPlano", "rangeAtraso", "vencA", "vencM", "vencD", "vencAM", "emissaoAM"]);

  // Tabelas de apoio
  const [fornecedores, setFornecedores] = useState<FornecedorDTO[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [statusTipos, setStatusTipos] = useState<StatusManualTipoDTO[]>([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [novoModalOpen, setNovoModalOpen] = useState(false);

  // Accordion
  const [filtrosOpen, setFiltrosOpen] = useState(true);
  const [atalhosOpen, setAtalhosOpen] = useState(true);

  // Inserção rápida (linha no final da tabela)
  const [inlineNewOpen, setInlineNewOpen] = useState(true);
  const [inlineNewValues, setInlineNewValues] = useState<Record<string, string>>({ dataLanc: new Date().toISOString().split("T")[0], tipo: "SAIDA" });
  const [inlineNewSaving, setInlineNewSaving] = useState(false);
  const inlineNewFirstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Toast
  const [toast, setToast] = useState({ msg: "", show: false });
  const showToast = (msg: string) => { setToast({ msg, show: true }); setTimeout(() => setToast(t => ({ ...t, show: false })), 2500); };

  // Carregar dados de apoio
  useEffect(() => {
    fetch("/api/fornecedores").then(r => r.json()).then(d => Array.isArray(d) && setFornecedores(d)).catch(() => {});
    fetch("/api/clientes").then(r => r.json()).then(d => Array.isArray(d) && setClientes(d)).catch(() => {});
    fetch("/api/status-tipos").then(r => r.json()).then(d => Array.isArray(d) && setStatusTipos(d)).catch(() => {});
  }, []);

  const reloadStatusTipos = () => {
    fetch("/api/status-tipos").then(r => r.json()).then(d => Array.isArray(d) && setStatusTipos(d)).catch(() => {});
  };

  // ── Inserção rápida: atalho Alt+N ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setInlineNewOpen(true);
        setInlineNewValues({ dataLanc: new Date().toISOString().split("T")[0], tipo: "SAIDA" });
        setTimeout(() => inlineNewFirstRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const saveInlineNew = async () => {
    const { dataLanc, descricao, valor, valorPrevisto, tipo } = inlineNewValues;
    if (!dataLanc) { showToast("❌ Preencha a Data Lanç."); return; }
    if (!descricao?.trim()) { showToast("❌ Preencha a Descrição"); return; }
    if (!valor && !valorPrevisto) { showToast("❌ Preencha o Vl. Realizado ou Vl. Previsto"); return; }
    setInlineNewSaving(true);
    try {
      const res = await fetch("/api/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inlineNewValues,
          valor: valor ? parseFloat(valor.replace(",", ".")) : (valorPrevisto ? parseFloat(valorPrevisto.replace(",", ".")) : 0),
          valorPrevisto: inlineNewValues.valorPrevisto ? parseFloat(inlineNewValues.valorPrevisto.replace(",", ".")) : null,
          tipo: tipo || "SAIDA",
          status: "realizado",
          statusManual: inlineNewValues.statusManual || null,
          fornecedorId: inlineNewValues.fornecedorId || null,
          dataEmissao: inlineNewValues.dataEmissao || null,
          dataVencOriginal: inlineNewValues.dataVencOriginal || null,
          dataVencPlano: inlineNewValues.dataVencPlano || null,
          dataEvento: inlineNewValues.dataEvento || null,
          dataPagamento: inlineNewValues.dataPagamento || null,
        }),
      });
      if (res.ok) {
        showToast("✅ Lançamento criado");
        setInlineNewValues({ dataLanc: new Date().toISOString().split("T")[0], tipo: "SAIDA" });
        loadData();
        setTimeout(() => inlineNewFirstRef.current?.focus(), 50);
      } else {
        const err = await res.json();
        showToast(`❌ ${err.error || "Erro ao criar"}`);
      }
    } finally {
      setInlineNewSaving(false);
    }
  };

  const cancelInlineNew = () => {
    setInlineNewOpen(false);
    setInlineNewValues({});
  };

  // Carregar lançamentos
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        porPagina: "50",
        ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)),
        ...(sortKey && !SORT_COMPUTED.has(sortKey) ? { sortKey, sortDir } : {}),
      });
      const res = await fetch(`/api/lancamentos?${params}`);
      const json = await res.json();
      let rows: LancamentoDTO[] = json.data ?? [];
      // Campos calculados: ordenação no cliente (página atual)
      if (sortKey && SORT_COMPUTED.has(sortKey)) {
        rows = [...rows].sort((a, b) => {
          const av = (a as any)[sortKey] ?? "";
          const bv = (b as any)[sortKey] ?? "";
          const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
      setLancamentos(rows);
      setTotal(json.total ?? 0);
    } finally { setLoading(false); }
  }, [filtros, pagina, sortKey, sortDir]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPIs
  const entradas = lancamentos.filter(l => l.tipo === "ENTRADA").reduce((s, l) => s + l.valor, 0);
  const saidas   = lancamentos.filter(l => l.tipo === "SAIDA").reduce((s, l) => s + l.valor, 0);

  // ── Edição inline ─────────────────────────────────────────
  const startEdit = (row: LancamentoDTO) => {
    if (editingId && editingId !== row.id) saveEdit(editingId);
    setEditingId(row.id);
    setEditValues({ ...row });
  };

  const saveEdit = async (id: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lancamentos/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        const updated = await res.json();
        setLancamentos(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l));
        showToast("✅ Salvo");
      } else { showToast("❌ Erro ao salvar"); }
    } finally { setSaving(false); setEditingId(null); setEditValues({}); }
  };

  const cancelEdit = () => { setEditingId(null); setEditValues({}); };

  const handleBlur = (id: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveEdit(id), 200);
  };
  const handleFocus = () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    if (res.ok) { setLancamentos(prev => prev.filter(l => l.id !== id)); setTotal(t => t - 1); showToast("🗑️ Excluído"); }
    setPendingDelete(null);
  };

  // ── Colunas visíveis ordenadas ────────────────────────────
  const visibleCols = COLUNAS_DEF
    .filter(d => colConfig.find(c => c.key === d.key)?.visible !== false)
    .sort((a, b) => {
      const oa = colConfig.find(c => c.key === a.key)?.order ?? 999;
      const ob = colConfig.find(c => c.key === b.key)?.order ?? 999;
      return oa - ob;
    });

  const { leftOffsets, rightOffsets } = calcStickyOffsets(colConfig);

  // ── Drag & drop de colunas ────────────────────────────────
  // STICKY_KEYS: não podem ser arrastadas/receber drop (posição fixa)
  // NO_SORT_KEYS: não podem ser ordenadas (só a coluna de ações)
  const STICKY_KEYS  = new Set(["acoes"]);
  const NO_SORT_KEYS = new Set(["acoes"]);
  const dragKey = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDragStart = (key: string) => {
    if (STICKY_KEYS.has(key)) return;
    dragKey.current = key;
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    if (STICKY_KEYS.has(key) || key === dragKey.current) return;
    e.preventDefault();
    setDragOverKey(key);
  };

  const handleDrop = (targetKey: string) => {
    const srcKey = dragKey.current;
    if (!srcKey || srcKey === targetKey || STICKY_KEYS.has(targetKey)) {
      setDragOverKey(null);
      dragKey.current = null;
      return;
    }
    setColConfig(prev => {
      // Pega a ordem atual de todas as colunas visíveis (não fixas)
      const ordered = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const srcIdx  = ordered.findIndex(c => c.key === srcKey);
      const tgtIdx  = ordered.findIndex(c => c.key === targetKey);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      // Reordena
      const reordered = [...ordered];
      const [moved] = reordered.splice(srcIdx, 1);
      reordered.splice(tgtIdx, 0, moved);
      // Reatribui orders preservando as fixas
      return reordered.map((c, i) => ({ ...c, order: i }));
    });
    setDragOverKey(null);
    dragKey.current = null;
  };

  const handleDragEnd = () => {
    dragKey.current = null;
    setDragOverKey(null);
  };

  // ── Resize de colunas ─────────────────────────────────────
  const resizingKey = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingKey.current = key;
    resizeStartX.current = e.clientX;
    const cfg = colConfig.find(c => c.key === key);
    const def = COLUNAS_DEF.find(d => d.key === key);
    resizeStartW.current = cfg?.width ?? def?.width ?? 100;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingKey.current) return;
      const diff = ev.clientX - resizeStartX.current;
      const newWidth = Math.max(40, resizeStartW.current + diff);
      setColConfig(prev => prev.map(c => c.key === resizingKey.current ? { ...c, width: newWidth } : c));
    };

    const handleMouseUp = () => {
      resizingKey.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persistir no localStorage
      setColConfig(prev => { localStorage.setItem("gestar_col_config", JSON.stringify(prev)); return prev; });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ── Toggle sort ao clicar no header ────────────────────────────────
  const handleSortClick = (key: string) => {
    // Se está sendo arrastado, não aciona sort
    if (dragKey.current) return;
    if (sortKey === key) {
      // 1º clique: asc → desc; 2º: desc → limpa
      if (sortDir === "asc") { setSortDir("desc"); }
      else { setSortKey(""); setSortDir("desc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPagina(1);
  };

  const getThStyle = (def: (typeof COLUNAS_DEF)[0]): React.CSSProperties => {
    const cfg = colConfig.find(c => c.key === def.key);
    const w = cfg?.width ?? def.width;
    const style: React.CSSProperties = { width: w, minWidth: w, maxWidth: w };
    if (def.stickyLeft)  { style.position = "sticky"; style.left  = leftOffsets[def.key] ?? 0; style.zIndex = 2; style.background = "#F8FAFC"; }
    if (def.stickyRight) { style.position = "sticky"; style.right = rightOffsets[def.key] ?? 0; style.zIndex = 2; style.background = "#F8FAFC"; }
    if (def.align) style.textAlign = def.align;
    return style;
  };

  const getTdStyle = (def: (typeof COLUNAS_DEF)[0], isEditing: boolean): React.CSSProperties => {
    const cfg = colConfig.find(c => c.key === def.key);
    const w = cfg?.width ?? def.width;
    const style: React.CSSProperties = { width: w, minWidth: w, maxWidth: w };
    if (def.stickyLeft)  { style.position = "sticky"; style.left  = leftOffsets[def.key] ?? 0; style.zIndex = 1; style.background = isEditing ? "rgba(37,99,235,0.06)" : "var(--bg-card)"; }
    if (def.stickyRight) { style.position = "sticky"; style.right = rightOffsets[def.key] ?? 0; style.zIndex = 1; style.background = isEditing ? "rgba(37,99,235,0.06)" : "var(--bg-card)"; }
    if (def.align) style.textAlign = def.align;
    return style;
  };

  // ── Render de célula no modo edição ───────────────────────
  const renderEditCell = (def: (typeof COLUNAS_DEF)[0], rowId: string) => {
    if (def.editavel === false) return renderCell(def.key, editValues as LancamentoDTO, statusTipos);
    const val = (editValues as any)[def.key] ?? "";
    const common = {
      className: "cell-input",
      onFocus: handleFocus,
      onBlur: () => handleBlur(rowId),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") saveEdit(rowId); if (e.key === "Escape") cancelEdit(); },
    };

    if (def.tipo === "date") return <input {...common} type="date" value={val?.slice(0, 10) ?? ""} onChange={e => {
      const newVal = e.target.value;
      setEditValues(p => {
        const updated = { ...p, [def.key]: newVal };
        // Espelhar Venc. Original → Venc. Plano (se plano está vazio)
        if (def.key === "dataVencOriginal" && !p.dataVencPlano) {
          updated.dataVencPlano = newVal;
        }
        return updated;
      });
    }} />;
    if (def.tipo === "number") return <input {...common} type="number" step="0.01" value={val} onChange={e => setEditValues(p => ({ ...p, [def.key]: e.target.value }))} className="cell-input num" />;
    if (def.tipo === "select" && def.options) return (
      <select {...common} value={val} onChange={e => setEditValues(p => ({ ...p, [def.key]: e.target.value }))} className="cell-input">
        {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    if (def.tipo === "select-api") {
      if (def.source === "fornecedores") {
        // Combinar fornecedores + clientes em uma lista pesquisável
        const allOpts = [...fornecedores.map(f => f.display || `${f.codigo} – ${f.nome}`), ...clientes.map((c: any) => `${c.codigo} – ${c.nome}`)];
        const listId = `datalist-${def.key}-${rowId}`;
        return (
          <>
            <input {...common} list={listId} value={val} onChange={e => setEditValues(p => ({ ...p, [def.key]: e.target.value }))} className="cell-input" placeholder="Digite para buscar..." />
            <datalist id={listId}>
              {allOpts.map((o, i) => <option key={i} value={o} />)}
            </datalist>
          </>
        );
      }
      // Status tipos — manter select
      return (
        <select {...common} value={val} onChange={e => setEditValues(p => ({ ...p, [def.key]: e.target.value }))} className="cell-input">
          <option value="">—</option>
          {statusTipos.map(o => <option key={o.id} value={o.codigo}>{o.nome}</option>)}
        </select>
      );
    }
    return <input {...common} type="text" value={val} onChange={e => setEditValues(p => ({ ...p, [def.key]: e.target.value }))} className={`cell-input ${def.key === "descricao" ? "wide" : ""}`} />;
  };

  return (
    <div className="layout">
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <div><h1 className="page-title">Lançamentos</h1><p className="page-sub">Fluxo de Caixa — clique em qualquer linha para editar</p></div>
          <div className="topbar-actions">
            <button className="btn btn-outline">📊 Exportar CSV</button>
            <button className="btn btn-primary" onClick={() => setNovoModalOpen(true)}>+ Novo</button>
          </div>
        </div>

        {/* KPIs */}

        {/* Filtros e Atalhos */}
        <div className="filters-section">
          {/* Accordion: Filtros */}
          <div className="accordion-item">
            <button className="accordion-trigger" onClick={() => setFiltrosOpen(p => !p)}>
              <span className={`accordion-chevron ${filtrosOpen ? "open" : ""}`}>›</span>
              <span className="accordion-title">Filtros</span>
            </button>
            {filtrosOpen && (
              <div className="accordion-content">
                <div className="kpi-grid" style={{ padding: 0, marginBottom: 12 }}>
                  <div className="kpi kpi-green"><div className="kpi-label">Entradas</div><div className="kpi-value">{formatCurrency(entradas)}</div><div className="kpi-sub">Período filtrado</div></div>
                  <div className="kpi kpi-red"><div className="kpi-label">Saídas</div><div className="kpi-value">{formatCurrency(saidas)}</div><div className="kpi-sub">Período filtrado</div></div>
                  <div className="kpi kpi-blue"><div className="kpi-label">Saldo do Período</div><div className="kpi-value">{formatCurrency(entradas - saidas)}</div><div className="kpi-sub">Saldo acumulado</div></div>
                </div>
                <div className="filters-row">
                  <div className="filter-group"><label className="filter-label">De</label><input type="date" className="filter-input" value={filtros.dataInicio} onChange={e => { setFiltros(f => ({ ...f, dataInicio: e.target.value })); setPagina(1); }} /></div>
                  <div className="filter-group"><label className="filter-label">Até</label><input type="date" className="filter-input" value={filtros.dataFim} onChange={e => { setFiltros(f => ({ ...f, dataFim: e.target.value })); setPagina(1); }} /></div>
                  <div className="filter-group"><label className="filter-label">Tipo</label>
                    <select className="filter-input" value={filtros.tipo} onChange={e => { setFiltros(f => ({ ...f, tipo: e.target.value })); setPagina(1); }}>
                      <option value="">Todos</option><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option>
                    </select></div>
                  <div className="filter-group"><label className="filter-label">St. Manual</label>
                    <select className="filter-input" value={filtros.statusManual} onChange={e => { setFiltros(f => ({ ...f, statusManual: e.target.value })); setPagina(1); }}>
                      <option value="">Todos</option>
                      {statusTipos.map(st => <option key={st.id} value={st.codigo}>{st.nome}</option>)}
                    </select></div>
                  <div className="filter-group filter-search-group"><label className="filter-label">Busca Rápida</label><input type="text" className="filter-input" placeholder="Descrição, fornecedor..." value={filtros.busca} onChange={e => { setFiltros(f => ({ ...f, busca: e.target.value })); setPagina(1); }} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion: Atalhos */}
          <div className="accordion-item">
            <button className="accordion-trigger" onClick={() => setAtalhosOpen(p => !p)}>
              <span className={`accordion-chevron ${atalhosOpen ? "open" : ""}`}>›</span>
              <span className="accordion-title">Atalhos</span>
            </button>
            {atalhosOpen && (
              <div className="accordion-content">
                <div className="filter-actions">
                  <button className="btn btn-outline" onClick={() => setStatusModalOpen(true)} title="Configurar Status Manual" style={{ gap: 5 }}>
                    <span>⚙️</span> Status
                  </button>
                  <LayoutManager onLayoutChange={setColConfig} />
                </div>
              </div>
            )}
          </div>

          <div className="filter-hint">
            💡 Clique em uma linha para editar · <kbd>Enter</kbd> salva · <kbd>Esc</kbd> cancela · Use a linha <strong>+</strong> no final da tabela para inserir
          </div>
        </div>

        {/* Tabela com scroll horizontal e vertical */}
        <div className="table-wrapper" style={{ overflow: "auto", margin: "14px 28px", position: "relative", maxHeight: "calc(100vh - 300px)" }}>
          <table className="data-table" style={{ tableLayout: "fixed", minWidth: visibleCols.reduce((s, d) => s + (colConfig.find(c => c.key === d.key)?.width ?? d.width), 0), borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {visibleCols.map(def => {
                  const isSticky   = STICKY_KEYS.has(def.key);   // bloqueia drag
                  const isNoSort   = NO_SORT_KEYS.has(def.key);  // bloqueia sort (só "acoes")
                  const isDragOver = dragOverKey === def.key;
                  const isSorted   = sortKey === def.key;
                  const isComputed = SORT_COMPUTED.has(def.key);

                  return (
                    <th
                      key={def.key}
                      style={{
                        ...getThStyle(def),
                        cursor: isNoSort ? "default" : "pointer",
                        userSelect: "none",
                        position: getThStyle(def).position ?? "relative",
                        borderLeft: isDragOver ? "3px solid var(--accent-blue)" : undefined,
                        opacity: dragKey.current === def.key ? 0.45 : 1,
                        transition: "opacity 0.15s, border-left 0.1s, background 0.15s",
                        background: isSorted ? "rgba(37,99,235,0.08)" : undefined,
                        ...(!getThStyle(def).position && { position: "relative" }),
                      }}
                      draggable={!isSticky}
                      onDragStart={() => handleDragStart(def.key)}
                      onDragOver={e  => handleDragOver(e, def.key)}
                      onDrop={() => handleDrop(def.key)}
                      onDragEnd={handleDragEnd}
                      onDragLeave={() => setDragOverKey(null)}
                      onClick={() => !isNoSort && handleSortClick(def.key)}
                      title={
                        isNoSort  ? def.label :
                        isComputed? `${def.label} — ordenação na página atual` :
                        isSorted  ? (sortDir === "asc" ? `${def.label}: clique para Decrescente` : `${def.label}: clique para limpar`) :
                        `Ordenar por ${def.label}`
                      }
                    >
                      <span style={{
                        display: "flex", alignItems: "center", gap: 4,
                        justifyContent: def.align === "right" ? "flex-end" : def.align === "center" ? "center" : "flex-start"
                      }}>
                        {/* Handle de drag (não dispara sort) — só para colunas não fixas */}
                        {!isSticky && (
                          <span
                            style={{ opacity: 0.25, fontSize: 10, lineHeight: 1, cursor: "grab", flexShrink: 0 }}
                            onMouseDown={e => e.stopPropagation()}
                          >
                            ⠿
                          </span>
                        )}
                        {def.label}
                        {/* Seta de ordenação — oculta só em Ações */}
                        {!isNoSort && (
                          <span style={{
                            fontSize: 9,
                            opacity: isSorted ? 1 : 0.2,
                            color: isSorted ? "var(--accent-blue)" : "inherit",
                            transition: "opacity 0.15s",
                            marginLeft: 1,
                            flexShrink: 0,
                          }}>
                            {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                          </span>
                        )}
                        {isComputed && isSorted && (
                          <span style={{ fontSize: 9, opacity: 0.5 }} title="Ordenação na página atual">*</span>
                        )}
                      </span>
                      {/* Handle de resize */}
                      <span
                        onMouseDown={e => handleResizeStart(e, def.key)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 5,
                          cursor: "col-resize",
                          background: "transparent",
                          zIndex: 3,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-blue)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</td></tr>
              ) : lancamentos.length === 0 ? (
                <tr><td colSpan={visibleCols.length} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Nenhum lançamento encontrado.</td></tr>
              ) : lancamentos.map(row => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className={isEditing ? "editing" : ""} onClick={() => !isEditing && startEdit(row)} style={{ cursor: isEditing ? "default" : "pointer" }}>
                    {visibleCols.map(def => (
                      <td key={def.key} style={getTdStyle(def, isEditing)}>
                        {def.key === "acoes" ? (
                          <div className="actions-cell">
                            {isEditing ? (
                              <>
                                {saving ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>💾...</span> : null}
                                <button className="action-btn" onClick={e => { e.stopPropagation(); cancelEdit(); }} title="Cancelar">✕</button>
                              </>
                            ) : pendingDelete === row.id ? (
                              <>
                                <button className="action-btn" style={{ color: "var(--accent-red)" }} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} title="Confirmar exclusão">✓</button>
                                <button className="action-btn" onClick={e => { e.stopPropagation(); setPendingDelete(null); }} title="Cancelar">✕</button>
                              </>
                            ) : (
                              <>
                                <button className="action-btn" onClick={e => { e.stopPropagation(); startEdit(row); }} title="Editar">✏️</button>
                                <button className="action-btn" onClick={e => { e.stopPropagation(); setPendingDelete(row.id); }} title="Excluir">🗑️</button>
                              </>
                            )}
                          </div>
                        ) : isEditing ? renderEditCell(def, row.id) : renderCell(def.key, row, statusTipos)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* Linha de inserção rápida (Alt+N) */}
              {inlineNewOpen && (
                <tr className="editing" style={{ background: "rgba(5,150,105,0.06)" }}>
                  {visibleCols.map((def, idx) => (
                    <td key={def.key} style={getTdStyle(def, true)}>
                      {def.key === "seq" ? (
                        <span style={{ color: "var(--accent-green)", fontWeight: 700, fontSize: 11 }}>+</span>
                      ) : def.key === "acoes" ? (
                        <div className="actions-cell">
                          <button className="action-btn" style={{ color: "#fff", background: "var(--accent-green)", borderRadius: 4, opacity: 1, fontSize: 13, padding: "3px 8px" }} onClick={saveInlineNew} title="Salvar (Enter)" disabled={inlineNewSaving}>✓</button>
                          <button className="action-btn" style={{ color: "#fff", background: "var(--accent-red)", borderRadius: 4, opacity: 1, fontSize: 13, padding: "3px 8px" }} onClick={cancelInlineNew} title="Cancelar (Esc)">✕</button>
                        </div>
                      ) : def.editavel === false ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (() => {
                        const val = inlineNewValues[def.key] ?? "";
                        const commonProps = {
                          className: "cell-input",
                          value: val,
                          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInlineNewValues(p => ({ ...p, [def.key]: e.target.value })),
                          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") saveInlineNew(); if (e.key === "Escape") cancelInlineNew(); },
                          ...(idx === 1 ? { ref: inlineNewFirstRef as any } : {}),
                        };
                        if (def.tipo === "date") return <input {...commonProps} type="date" onChange={e => {
                          const newVal = e.target.value;
                          setInlineNewValues(p => {
                            const updated = { ...p, [def.key]: newVal };
                            if (def.key === "dataVencOriginal" && !p.dataVencPlano) updated.dataVencPlano = newVal;
                            return updated;
                          });
                        }} value={inlineNewValues[def.key] ?? ""} />;
                        if (def.tipo === "number") return <input {...commonProps} type="number" step="0.01" className="cell-input num" />;
                        if (def.tipo === "select" && def.options) return (
                          <select {...commonProps}>
                            {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        );
                        if (def.tipo === "select-api") {
                          if (def.source === "fornecedores") {
                            const allOpts = [...fornecedores.map(f => f.display || `${f.codigo} – ${f.nome}`), ...clientes.map((c: any) => `${c.codigo} – ${c.nome}`)];
                            const listId = `datalist-inline-${def.key}`;
                            return (
                              <>
                                <input {...commonProps} list={listId} placeholder="Digite para buscar..." />
                                <datalist id={listId}>{allOpts.map((o, i) => <option key={i} value={o} />)}</datalist>
                              </>
                            );
                          }
                          return (
                            <select {...commonProps}>
                              <option value="">—</option>
                              {statusTipos.map(o => <option key={o.id} value={o.codigo}>{o.nome}</option>)}
                            </select>
                          );
                        }
                        return <input {...commonProps} type="text" />;
                      })()}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="table-footer" style={{ margin: "0 28px 14px" }}>
          <span>{total} lançamentos</span>
          {total > 50 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>← Ant.</button>
              <span style={{ fontSize: 12 }}>Pág. {pagina} de {Math.ceil(total / 50)}</span>
              <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} disabled={pagina >= Math.ceil(total / 50)} onClick={() => setPagina(p => p + 1)}>Próx. →</button>
            </div>
          )}
        </div>

        {/* Toast */}
        <div className={`toast ${toast.show ? "show" : ""}`}>{toast.msg}</div>

        {/* Modal de configuração de Status */}
        <StatusTiposModal
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          onUpdate={reloadStatusTipos}
        />

        {/* Modal de novo lançamento */}
        <NovoLancamentoModal
          open={novoModalOpen}
          onClose={() => setNovoModalOpen(false)}
          onCreated={loadData}
          fornecedores={fornecedores}
          statusTipos={statusTipos}
        />
      </main>
    </div>
  );
}
