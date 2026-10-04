"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import type { LancamentoDTO, ColConfig, FornecedorDTO, StatusManualTipoDTO } from "@/types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { COLUNAS_DEF, DEFAULT_COLUNAS_CONFIG } from "./colunasConfig";
import LayoutManager from "./LayoutManager";
import StatusTiposModal from "./StatusTiposModal";
import NovoLancamentoModal from "./NovoLancamentoModal";
import ImportModal from "./ImportModal";
import CounterpartyPicker from "./CounterpartyPicker";
import { activeCounterparties, counterpartyDisplay, counterpartyIds, defaultAccount } from "@/lib/counterparty";
import { lerResumoFluxoCaixa } from "@/lib/cash-flow-response";
import type { calcularFluxoCaixa, DataBaseFinanceira } from "@/lib/cash-flow";
import "./lancamentos-filters.css";

type CategoryOption = { id: string; codigo: string; nome: string };
type AccountOption = { id: string; codigo: string | null; descricao: string; categoriaId: string | null; tipo: string };
type ResumoFinanceiro = ReturnType<typeof calcularFluxoCaixa>;
type Filtros = {
  busca: string; status: string; tipo: string; dataBase: DataBaseFinanceira; inicio: string; fim: string;
  statusManual: string; categoria: string; contaId: string; clienteId: string; fornecedorId: string;
  centroCusto: string; banco: string; fornecedor: string;
};
const DATA_BASES: { valor: DataBaseFinanceira; nome: string }[] = [
  { valor: "DATA_LANCAMENTO", nome: "Data Lançamento" },
  { valor: "DATA_EMISSAO", nome: "Data Emissão" },
  { valor: "VENCIMENTO_ORIGINAL", nome: "Vencimento Original" },
  { valor: "VENCIMENTO_PLANO", nome: "Vencimento Plano" },
  { valor: "REALIZACAO", nome: "Realização" },
];
const STATUS_FINANCEIROS = ["REALIZADO", "PREVISTO", "A VENCER", "ATRASADO", "CANCELADO", "INCONSISTENTE"];
const filtrosIniciais = (hoje: string): Filtros => ({ busca: "", status: "", tipo: "",
  dataBase: "DATA_LANCAMENTO", inicio: `${hoje.slice(0, 7)}-01`, fim: hoje,
  statusManual: "", categoria: "", contaId: "", clienteId: "", fornecedorId: "",
  centroCusto: "", banco: "", fornecedor: "" });

// ── Chip helpers ─────────────────────────────────────────────
function ChipTipo({ tipo }: { tipo: string }) {
  return <span className={tipo === "SAIDA" ? "chip" : `chip chip-${tipo.toLowerCase()}`} style={tipo === "SAIDA" ? { background: "color-mix(in srgb, var(--accent-yellow) 10%, transparent)", color: "var(--accent-yellow)" } : undefined}>{tipo === "ENTRADA" ? "ENTRADA" : "SAÍDA"}</span>;
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
    "CANCELADO": { cls: "chip-cancelado", label: "CANCELADO" },
    "INCONSISTENTE": { cls: "chip-cancelado", label: "INCONSISTENTE" },
  };
  const info = map[s] ?? { cls: "chip-cancelado", label: s };
  return <span className={`chip ${info.cls}`}>{info.label}</span>;
}
const PROBLEMAS: Record<string, string> = {
  REALIZADO_SEM_DATA: "Realizado sem Data de Realização",
  RECEITA_COM_SAIDA: "Conta N2 de Receita com direção Saída",
  DESPESA_COM_ENTRADA: "Conta N2 de Despesa com direção Entrada",
  TRANSFERENCIA_SEM_PAREAMENTO: "Transferência sem pareamento",
  CONTA_VINCULADA_INEXISTENTE: "Conta N2 vinculada inexistente",
  CONTA_DE_OUTRO_TENANT: "Conta N2 fora do tenant",
};

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
function renderCell(key: string, row: LancamentoDTO, statusTipos?: StatusManualTipoDTO[], accounts?: AccountOption[]): React.ReactNode {
  const val = (row as any)[key];
  if (val === null || val === undefined || val === "") return <span style={{ color: "var(--text-muted)" }}>—</span>;

  // Colunas de data → formato BR
  const DATE_KEYS = new Set(["dataLanc", "dataEmissao", "dataVencOriginal", "dataVencPlano", "dataEvento", "dataPagamento"]);
  if (DATE_KEYS.has(key)) return <span>{formatDate(val)}</span>;

  // SEQ — discreto
  if (key === "seq") return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{val}</span>;

  switch (key) {
    case "contaId": {
      const account = accounts?.find(item => item.id === val);
      return <span>{account ? `${account.codigo ?? ""} – ${account.descricao}`
        : row.contaN2Descricao ? `${row.contaN2Codigo ?? ""} – ${row.contaN2Descricao}` : "Conta N2 vinculada"}</span>;
    }
    case "tipo":        return <ChipTipo tipo={val} />;
    case "status":      return <ChipStatus status={val} />;
    case "statusAuto":  return <><ChipStatusAuto s={val} />{row.problemasFinanceiros?.length ?
      <span className="lanc-review" title={row.problemasFinanceiros.map(problema => PROBLEMAS[problema] || problema).join("; ")}>Revisar</span> : null}</>;
    case "valor":
    case "valorPrevisto": return <span className={row.tipo === "ENTRADA" ? "val-entrada" : undefined} style={row.tipo === "ENTRADA" ? undefined : { color: "var(--accent-yellow)", fontWeight: 600 }}>{formatCurrency(val)}</span>;
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
export default function LancamentosClient({ hoje }: { hoje: string }) {
  // Estado principal
  const [lancamentos, setLancamentos] = useState<LancamentoDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [colConfig, setColConfig] = useState<ColConfig[]>(DEFAULT_COLUNAS_CONFIG);

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<LancamentoDTO>>({});
  const editValuesRef = useRef<Partial<LancamentoDTO>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  // Filtros
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosIniciais(hoje));
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [resumoErro, setResumoErro] = useState("");
  const [listErro, setListErro] = useState("");
  const requestId = useRef(0);
  const [pagina, setPagina] = useState(1);

  // Ordenação
  const [sortKey, setSortKey] = useState("seq");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Campos calculados no JS (não mapeados no banco)
  const SORT_COMPUTED = new Set(["statusAuto", "diasAtrasoOriginal", "diasAtrasoPlano", "rangeAtraso", "vencA", "vencM", "vencD", "vencAM", "emissaoAM"]);

  // Tabelas de apoio
  const [fornecedores, setFornecedores] = useState<FornecedorDTO[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const counterparties = activeCounterparties(clientes, fornecedores);
  const [statusTipos, setStatusTipos] = useState<StatusManualTipoDTO[]>([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [novoModalOpen, setNovoModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Accordion
  const [avancadosOpen, setAvancadosOpen] = useState(false);
  const [atalhosOpen, setAtalhosOpen] = useState(false);

  // Inserção rápida (linha no final da tabela)
  const [inlineNewOpen, setInlineNewOpen] = useState(true);
  const [inlineNewValues, setInlineNewValues] = useState<Record<string, string>>({ tipo: "SAIDA" });
  const [inlineNewSaving, setInlineNewSaving] = useState(false);
  const inlineNewFirstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Setar data de hoje no cliente (evita hydration mismatch)
  useEffect(() => {
    setInlineNewValues(v => ({ ...v, dataLanc: new Date().toISOString().split("T")[0] }));
  }, []);

  // Toast
  const [toast, setToast] = useState({ msg: "", show: false });
  const showToast = (msg: string) => { setToast({ msg, show: true }); setTimeout(() => setToast(t => ({ ...t, show: false })), 2500); };
  const atualizarFiltro = (key: keyof Filtros, value: string) => {
    setFiltros(current => ({ ...current, [key]: value,
      ...(key === "categoria" ? { contaId: "" } : {}),
      ...(key === "clienteId" && value ? { fornecedorId: "" } : {}),
      ...(key === "fornecedorId" && value ? { clienteId: "" } : {}),
    }));
    setPagina(1);
  };
  const parametrosFiltros = () => new URLSearchParams(
    Object.entries(filtros).filter(([, value]) => value) as [string, string][]);
  const avancadosAtivos = (["statusManual", "categoria", "contaId", "clienteId", "fornecedorId",
    "centroCusto", "banco", "fornecedor"] as const).filter(key => filtros[key]).length;

  // Carregar dados de apoio
  useEffect(() => {
    fetch("/api/fornecedores").then(r => r.json()).then(d => Array.isArray(d) && setFornecedores(d)).catch(() => {});
    fetch("/api/clientes").then(r => r.json()).then(d => Array.isArray(d) && setClientes(d)).catch(() => {});
    fetch("/api/categorias").then(r => r.json()).then(d => Array.isArray(d) && setCategories(d)).catch(() => {});
    fetch("/api/plano-contas").then(r => r.json()).then(d => Array.isArray(d) && setAccounts(d)).catch(() => {});
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
          valor: valor ? parseFloat(String(valor).replace(",", ".")) : (valorPrevisto ? parseFloat(String(valorPrevisto).replace(",", ".")) : 0),
          valorPrevisto: inlineNewValues.valorPrevisto ? parseFloat(String(inlineNewValues.valorPrevisto).replace(",", ".")) : null,
          tipo: tipo || "SAIDA",
          status: "realizado",
          statusManual: inlineNewValues.statusManual || null,
          fornecedorId: inlineNewValues.fornecedorId || null,
          clienteId: inlineNewValues.clienteId || null,
          contaId: inlineNewValues.contaId || null,
          dataLanc: inlineNewValues.dataLanc || new Date().toISOString().split("T")[0],
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
    const currentRequest = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams(Object.entries(filtros).filter(([, value]) => value) as [string, string][]);
    params.set("pagina", String(pagina));
    params.set("porPagina", "50");
    if (sortKey && !SORT_COMPUTED.has(sortKey)) { params.set("sortKey", sortKey); params.set("sortDir", sortDir); }
    const summaryParams = new URLSearchParams(Object.entries(filtros).filter(([, value]) => value) as [string, string][]);
    summaryParams.set("dataReferencia", hoje);
    const [lista, financeiro] = await Promise.allSettled([
      fetch(`/api/lancamentos?${params}`).then(async response => {
        if (!response.ok) throw new Error("Não foi possível carregar os lançamentos.");
        return response.json();
      }),
      filtros.inicio && filtros.fim
        ? fetch(`/api/fluxo-caixa/resumo?${summaryParams}`).then(lerResumoFluxoCaixa)
        : Promise.reject(new Error("Informe De e Até para calcular o resumo.")),
    ]);
    if (currentRequest !== requestId.current) return;
    if (lista.status === "fulfilled") {
      let rows: LancamentoDTO[] = lista.value.data ?? [];
      if (sortKey && SORT_COMPUTED.has(sortKey)) rows = [...rows].sort((a, b) => {
        const av = (a as any)[sortKey] ?? "";
        const bv = (b as any)[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      setLancamentos(rows);
      setTotal(lista.value.total ?? 0);
      setListErro("");
    } else { setLancamentos([]); setTotal(0); setListErro(lista.reason?.message || "Erro ao carregar lançamentos."); }
    if (financeiro.status === "fulfilled") { setResumo(financeiro.value); setResumoErro(""); }
    else { setResumo(null); setResumoErro(financeiro.reason?.message || "Erro ao carregar resumo financeiro."); }
    setLoading(false);
  }, [filtros, pagina, sortKey, sortDir, hoje]);

  useEffect(() => { loadData(); }, [loadData]);

  // O motor compartilha os componentes financeiros com a Visão Geral; a tabela permanece paginada.
  const resumoPeriodo = filtros.dataBase === "REALIZACAO" ? resumo?.realizado : resumo?.consulta.realizado;

  // ── Edição inline ─────────────────────────────────────────
  const startEdit = (row: LancamentoDTO) => {
    if (editingId && editingId !== row.id) {
      saveEdit(editingId);
    }
    setEditingId(row.id);
    const initial = { ...row };
    setEditValues(initial);
    editValuesRef.current = initial;
  };

  const saveEdit = async (id: string, valuesOverride?: Partial<LancamentoDTO>) => {
    if (!id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const dataToSave = valuesOverride || editValuesRef.current;
    if (!dataToSave || Object.keys(dataToSave).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lancamentos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });
      if (res.ok) {
        const updated = await res.json();
        setLancamentos(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l));
        showToast("✅ Salvo");
        void loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ ${err.error || "Erro ao salvar"}`);
      }
    } catch {
      showToast("❌ Erro de conexão ao salvar");
    } finally {
      setSaving(false);
      setEditingId(null);
      setEditValues({});
      editValuesRef.current = {};
    }
  };

  const cancelEdit = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setEditingId(null);
    setEditValues({});
    editValuesRef.current = {};
  };

  const handleBlur = (id: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveEdit(id);
    }, 600);
  };
  const handleFocus = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
  };

  const handleDelete = async (id: string) => {
    // Cancelar qualquer auto-save pendente para evitar restauração do valor excluído
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (editingId === id) {
      setEditingId(null);
      setEditValues({});
      editValuesRef.current = {};
    }
    const res = await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("🗑️ Excluído"); void loadData(); }
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
    if (def.editavel === false) return renderCell(def.key, (editValuesRef.current.id === rowId ? editValuesRef.current : editValues) as LancamentoDTO, statusTipos, accounts);
    const val = (editValues as any)[def.key] ?? "";
    const common = {
      className: "cell-input",
      onFocus: handleFocus,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") saveEdit(rowId);
        if (e.key === "Escape") cancelEdit();
      },
    };

    if (def.tipo === "date") {
      const dateStr = val ? (typeof val === "string" ? val.slice(0, 10) : new Date(val).toISOString().slice(0, 10)) : "";
      return (
        <input
          {...common}
          type="date"
          value={dateStr}
          onChange={e => {
            // Atualiza estado local imediatamente — sem auto-save no onChange para
            // evitar que o timer reverta a data enquanto o usuário ainda está
            // navegando no calendário (Bug #1 identificado na reunião 05/09)
            const newVal = e.target.value;
            const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
            const updated = { ...current, [def.key]: newVal || null };
            if (def.key === "dataVencOriginal" && !updated.dataVencPlano) {
              updated.dataVencPlano = newVal || null;
            }
            editValuesRef.current = updated;
            setEditValues(updated);
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
          }}
          onBlur={() => handleBlur(rowId)}
        />
      );
    }
    if (def.tipo === "number") {
      return (
        <input
          {...common}
          onBlur={() => handleBlur(rowId)}
          type="number"
          step="0.01"
          value={val ?? ""}
          onChange={e => {
            const newVal = e.target.value;
            const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
            const updated = { ...current, [def.key]: newVal };
            editValuesRef.current = updated;
            setEditValues(updated);
          }}
          className="cell-input num"
        />
      );
    }
    if (def.tipo === "select" && def.options) {
      return (
        <select
          {...common}
          value={val ?? ""}
          onChange={e => {
            const newVal = e.target.value;
            const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
            const updated = { ...current, [def.key]: newVal };
            editValuesRef.current = updated;
            setEditValues(updated);
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = setTimeout(() => saveEdit(rowId, updated), 600);
          }}
          className="cell-input"
        >
          {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (def.tipo === "select-api") {
      if (def.source === "categorias" || def.source === "plano-contas") {
        const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
        const selectedCategory = current.categoria || "";
        return (
          <select {...common} value={val ?? ""} onBlur={() => handleBlur(rowId)}
            onChange={e => {
              const updated = def.source === "categorias"
                ? { ...current, categoria: e.target.value || null, contaId: null }
                : (() => {
                    const account = accounts.find(item => item.id === e.target.value);
                    const category = categories.find(item => item.id === account?.categoriaId);
                    return { ...current, contaId: account?.id || null, categoria: category?.codigo || current.categoria || null };
                  })();
              editValuesRef.current = updated;
              setEditValues(updated);
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            }}>
            <option value="">—</option>
            {def.source === "categorias"
              ? categories.map(item => <option key={item.id} value={item.codigo}>{item.codigo} – {item.nome}</option>)
              : accounts.filter(item => item.categoriaId === categories.find(cat => cat.codigo === selectedCategory)?.id)
                .map(item => <option key={item.id} value={item.id}>{item.codigo} – {item.descricao}</option>)}
          </select>
        );
      }
      if (def.source === "fornecedores") {
        const selected = counterparties.find(item => item.id === (editValues.clienteId || editValues.fornecedorId)) || null;
        return (
          <CounterpartyPicker className="cell-input" options={counterparties} selected={selected}
            legacyLabel={selected ? null : val}
            onBlur={() => handleBlur(rowId)}
            onEnter={() => saveEdit(rowId)} onEscape={cancelEdit}
            onSelect={item => {
              const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
              const updated = { ...current, ...counterpartyIds(item), fantasiaPadrao: item ? counterpartyDisplay(item) : null };
              editValuesRef.current = updated;
              setEditValues(updated);
            }} />
        );
      }
      return (
        <select
          {...common}
          value={val ?? ""}
          onChange={e => {
            const newVal = e.target.value;
            const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
            const updated = { ...current, [def.key]: newVal };
            editValuesRef.current = updated;
            setEditValues(updated);
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = setTimeout(() => saveEdit(rowId, updated), 600);
          }}
          className="cell-input"
        >
          <option value="">—</option>
          {statusTipos.map(o => <option key={o.id} value={o.codigo}>{o.nome}</option>)}
        </select>
      );
    }
    return (
      <input
        {...common}
        onBlur={() => handleBlur(rowId)}
        type="text"
        value={val ?? ""}
        onChange={e => {
          const newVal = e.target.value;
          const current = editValuesRef.current.id === rowId ? editValuesRef.current : editValues;
          const updated = { ...current, [def.key]: newVal };
          editValuesRef.current = updated;
          setEditValues(updated);
        }}
        className={`cell-input ${def.key === "descricao" ? "wide" : ""}`}
      />
    );
  };

  return (
    <div className="lanc-page" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Topbar */}
        <div className="topbar">
          <div><h1 className="page-title">Lançamentos</h1><p className="page-sub">Operação e consulta do fluxo de caixa</p></div>
          <div className="topbar-actions">
            <button className="btn btn-outline" onClick={() => setImportModalOpen(true)}>📥 Importar</button>
            <button className="btn btn-outline" onClick={async () => {
              showToast("⏳ Gerando CSV completo...");
              try {
                const params = parametrosFiltros();
                if (sortKey) { params.set("sortKey", sortKey); params.set("sortDir", sortDir); }
                const res = await fetch(`/api/lancamentos/exportar?${params}`);
                if (!res.ok) { showToast("❌ Erro ao exportar"); return; }
                const totalReg = res.headers.get("X-Total-Registros") || "?";
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `lancamentos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                URL.revokeObjectURL(url);
                showToast(`✅ CSV exportado (${totalReg} registros)`);
              } catch {
                showToast("❌ Erro ao exportar CSV");
              }
            }}>📊 Exportar CSV</button>
            <button className="btn btn-primary" onClick={() => setNovoModalOpen(true)}>+ Novo</button>
          </div>
        </div>

        <section className="lanc-filters" aria-label="Filtros de lançamentos">
          <div className="lanc-filter-main">
            <label className="filter-group lanc-search"><span className="filter-label">Busca</span>
              <input className="filter-input" value={filtros.busca} placeholder="Cliente, fornecedor, fantasia, descrição, anotação"
                onChange={event => atualizarFiltro("busca", event.target.value)} /></label>
            <label className="filter-group"><span className="filter-label">Status financeiro</span>
              <select className="filter-input" value={filtros.status} onChange={event => atualizarFiltro("status", event.target.value)}>
                <option value="">Todos</option>{STATUS_FINANCEIROS.map(status =>
                  <option key={status} value={status}>{status === "REALIZADO" ? "REALIZADO / PAGO" : status}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Direção</span>
              <select className="filter-input" value={filtros.tipo} onChange={event => atualizarFiltro("tipo", event.target.value)}>
                <option value="">Todas</option><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></label>
            <label className="filter-group"><span className="filter-label">Data-base</span>
              <select className="filter-input" value={filtros.dataBase} onChange={event => atualizarFiltro("dataBase", event.target.value)}>
                {DATA_BASES.map(item => <option key={item.valor} value={item.valor}>{item.nome}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Mês / Ano</span>
              <input className="filter-input" type="month" value={filtros.inicio && filtros.fim && filtros.inicio.slice(0, 7) === filtros.fim.slice(0, 7) ? filtros.inicio.slice(0, 7) : ""}
                onChange={event => { const month = event.target.value; if (!month) return;
                  const [year, number] = month.split("-").map(Number);
                  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
                  setFiltros(current => ({ ...current, inicio: `${month}-01`, fim: month === hoje.slice(0, 7) ? hoje : end })); setPagina(1); }} /></label>
            <label className="filter-group"><span className="filter-label">De</span>
              <input className="filter-input" type="date" value={filtros.inicio} onChange={event => atualizarFiltro("inicio", event.target.value)} /></label>
            <label className="filter-group"><span className="filter-label">Até</span>
              <input className="filter-input" type="date" value={filtros.fim} onChange={event => atualizarFiltro("fim", event.target.value)} /></label>
            <button className="btn btn-outline lanc-year" type="button" onClick={() => {
              setFiltros(current => ({ ...current, inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje })); setPagina(1);
            }}>Ano atual</button>
            <button className="btn btn-outline" type="button" aria-expanded={avancadosOpen} onClick={() => setAvancadosOpen(open => !open)}>
              + Filtros{avancadosAtivos ? ` (${avancadosAtivos})` : ""}</button>
            <button className="btn btn-outline" type="button" onClick={() => { setFiltros(filtrosIniciais(hoje)); setPagina(1); }}>
              Limpar filtros</button>
          </div>
          {avancadosOpen && <div className="lanc-advanced" aria-label="Filtros avançados">
            <p>Status Manual é uma classificação operacional; não comprova pagamento ou recebimento.</p>
            <label className="filter-group"><span className="filter-label">Status Manual</span><select className="filter-input" value={filtros.statusManual} onChange={event => atualizarFiltro("statusManual", event.target.value)}>
              <option value="">Todos</option>{statusTipos.map(st => <option key={st.id} value={st.codigo}>{st.nome}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Categoria N1</span><select className="filter-input" value={filtros.categoria} onChange={event => atualizarFiltro("categoria", event.target.value)}>
              <option value="">Todas</option>{categories.map(item => <option key={item.id} value={item.codigo}>{item.codigo} – {item.nome}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Conta N2</span><select className="filter-input" value={filtros.contaId} onChange={event => {
              const account = accounts.find(item => item.id === event.target.value);
              const category = categories.find(item => item.id === account?.categoriaId);
              setFiltros(current => ({ ...current, contaId: account?.id || "", categoria: category?.codigo || current.categoria })); setPagina(1);
            }}><option value="">Todas</option>{accounts.filter(item => !filtros.categoria || item.categoriaId === categories.find(cat => cat.codigo === filtros.categoria)?.id)
              .map(item => <option key={item.id} value={item.id}>{item.codigo} – {item.descricao}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Cliente</span><select className="filter-input" value={filtros.clienteId} onChange={event => atualizarFiltro("clienteId", event.target.value)}>
              <option value="">Todos</option>{clientes.map((item: any) => <option key={item.id} value={item.id}>{item.nomeFantasia || item.nome}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Fornecedor</span><select className="filter-input" value={filtros.fornecedorId} onChange={event => atualizarFiltro("fornecedorId", event.target.value)}>
              <option value="">Todos</option>{fornecedores.map(item => <option key={item.id} value={item.id}>{item.display || item.nome}</option>)}</select></label>
            <label className="filter-group"><span className="filter-label">Centro de Custo legado</span><input className="filter-input" value={filtros.centroCusto} onChange={event => atualizarFiltro("centroCusto", event.target.value)} /></label>
            <label className="filter-group"><span className="filter-label">Banco legado</span><input className="filter-input" value={filtros.banco} onChange={event => atualizarFiltro("banco", event.target.value)} /></label>
            <label className="filter-group"><span className="filter-label">Fornecedor legado</span><input className="filter-input" value={filtros.fornecedor} onChange={event => atualizarFiltro("fornecedor", event.target.value)} /></label>
          </div>}
          <div className="lanc-settings"><button className="accordion-trigger" type="button" aria-expanded={atalhosOpen} onClick={() => setAtalhosOpen(open => !open)}>
            <span className={`accordion-chevron ${atalhosOpen ? "open" : ""}`}>›</span><span className="accordion-title">Configurações e Atalhos</span></button>
            {atalhosOpen && <div className="lanc-settings-content"><button className="btn btn-outline" onClick={() => setStatusModalOpen(true)}>Status Manual</button>
              <LayoutManager onLayoutChange={setColConfig} />
              <Link className="btn btn-outline" href="/estrutura/dimensao-empresa">Dimensão da Empresa</Link>
              <Link className="btn btn-outline" href="/estrutura/dimensoes-financeiras">Dimensões Financeiras</Link>
              <Link className="btn btn-outline" href="/estrutura/dimensoes-cadastrais">Dimensões Cadastrais</Link>
              <Link className="btn btn-outline" href="/estrutura/dimensao-produtos">Dimensão de Portfólio</Link></div>}
          </div>
        </section>
        <section className="lanc-summary" aria-label="Resumo financeiro dos filtros">
          {resumoErro ? <div className="lanc-summary-error">{resumoErro}</div> : !resumo || !resumoPeriodo ?
            <div className="lanc-summary-loading">Carregando resumo financeiro…</div> : <>
              <div className="lanc-summary-card entrada"><span>Entradas</span><strong>{formatCurrency(Number(resumoPeriodo.entradas))}</strong></div>
              <div className="lanc-summary-card saida"><span>Saídas</span><strong>{formatCurrency(Number(resumoPeriodo.saidas))}</strong></div>
              <div className="lanc-summary-card saldo"><span>Saldo do período</span><strong>{formatCurrency(Number(resumoPeriodo.saldo))}</strong></div>
              <small>{filtros.dataBase === "REALIZACAO" ? "Caixa realizado por data financeira" :
                `Movimentos realizados por ${DATA_BASES.find(item => item.valor === filtros.dataBase)?.nome}; não representa posição de caixa`}</small>
            </>}
        </section>
        {listErro && <div className="lanc-list-error" role="alert">{listErro}</div>}

        {/* Tabela — header fixo + body scrollável com scroll sincronizado */}
        <div className="lanc-table-shell" style={{ margin: "14px 28px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-card)", overflow: "hidden" }}>
          {/* Header fixo */}
          <div ref={headerScrollRef} style={{ overflowX: "hidden", flexShrink: 0 }}>
            <table className="data-table" style={{ tableLayout: "fixed", minWidth: visibleCols.reduce((s, d) => s + (colConfig.find(c => c.key === d.key)?.width ?? d.width), 0), borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {visibleCols.map(def => {
                    const isSticky   = STICKY_KEYS.has(def.key);
                    const isNoSort   = NO_SORT_KEYS.has(def.key);
                    const isDragOver = dragOverKey === def.key;
                    const isSorted   = sortKey === def.key;
                    const isComputed = SORT_COMPUTED.has(def.key);

                  return (
                    <th
                      key={def.key}
                      style={{
                        ...getThStyle(def),
                        padding: def.key === "seq" ? "8px 4px" : "8px 8px",
                        color: "var(--text-primary)",
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
                        display: "flex", alignItems: "center", gap: def.key === "seq" ? 2 : 5,
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
                        <span style={{ flex: "1 1 auto", minWidth: 0, textAlign: def.align ?? "left" }}>{def.label}</span>
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
            </table>
          </div>
          {/* Body scrollável */}
          <div ref={bodyScrollRef} className="lancamentos-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "auto", userSelect: editingId ? "none" : "auto" }} onScroll={e => { if (headerScrollRef.current) headerScrollRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft; }}>
            <table className="data-table" style={{ tableLayout: "fixed", minWidth: visibleCols.reduce((s, d) => s + (colConfig.find(c => c.key === d.key)?.width ?? d.width), 0), borderCollapse: "separate", borderSpacing: 0 }}>
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
                                <button
                                  className="action-btn"
                                  style={{ color: "#fff", background: "var(--accent-green)", borderRadius: 4, opacity: 1, fontSize: 13, padding: "3px 8px" }}
                                  onClick={e => { e.stopPropagation(); saveEdit(row.id); }}
                                  title="Salvar alterações (Enter)"
                                  disabled={saving}
                                >
                                  ✓
                                </button>
                                <button
                                  className="action-btn"
                                  style={{ color: "#fff", background: "var(--accent-red)", borderRadius: 4, opacity: 1, fontSize: 13, padding: "3px 8px" }}
                                  onClick={e => { e.stopPropagation(); cancelEdit(); }}
                                  title="Cancelar (Esc)"
                                >
                                  ✕
                                </button>
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
                        ) : isEditing ? renderEditCell(def, row.id) : renderCell(def.key, row, statusTipos, accounts)}
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
                          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInlineNewValues(p => ({ ...p, [def.key]: e.target.value, ...(def.key === "categoria" ? { contaId: "" } : {}) })),
                          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") saveInlineNew(); if (e.key === "Escape") cancelInlineNew(); },
                          ...(idx === 1 ? { ref: inlineNewFirstRef as any } : {}),
                        };
                        if (def.tipo === "date") return <input {...commonProps} type="date" value={inlineNewValues[def.key] ?? ""} onChange={e => {
                          const newVal = e.target.value;
                          setInlineNewValues(p => {
                            const updated = { ...p, [def.key]: newVal };
                            if (def.key === "dataVencOriginal" && !p.dataVencPlano) updated.dataVencPlano = newVal;
                            return updated;
                          });
                        }} />;
                        if (def.tipo === "number") return <input {...commonProps} type="number" step="0.01" className="cell-input num" />;
                        if (def.tipo === "select" && def.options) return (
                          <select {...commonProps}>
                            {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        );
                        if (def.tipo === "select-api") {
                          if (def.source === "fornecedores") {
                            const selected = counterparties.find(item => item.id === (inlineNewValues.clienteId || inlineNewValues.fornecedorId)) || null;
                            return (
                              <div style={{ display: "grid", gap: 3 }}>
                                <CounterpartyPicker className="cell-input" options={counterparties} selected={selected}
                                  onEnter={() => void saveInlineNew()} onEscape={cancelInlineNew}
                                  onSelect={item => {
                                    const account = defaultAccount(item);
                                    const ids = counterpartyIds(item);
                                    setInlineNewValues(current => ({ ...current,
                                      clienteId: ids.clienteId || "", fornecedorId: ids.fornecedorId || "",
                                      fantasiaPadrao: item ? counterpartyDisplay(item) : "",
                                      ...(account ? { contaId: account.contaId, categoria: account.categoria } : {}),
                                    }));
                                  }} />
                              </div>
                            );
                          }
                          if (def.source === "categorias") return (
                            <select {...commonProps} value={inlineNewValues.categoria || ""} onChange={event =>
                              setInlineNewValues(current => ({ ...current, categoria: event.target.value, contaId: "" }))}>
                              <option value="">—</option>
                              {categories.map(item => <option key={item.id} value={item.codigo}>{item.codigo} – {item.nome}</option>)}
                            </select>
                          );
                          if (def.source === "plano-contas") return (
                            <select {...commonProps} value={inlineNewValues.contaId || ""} onChange={event => {
                              const account = accounts.find(item => item.id === event.target.value);
                              const category = categories.find(item => item.id === account?.categoriaId);
                              setInlineNewValues(current => ({ ...current, contaId: account?.id || "", categoria: category?.codigo || current.categoria || "" }));
                            }}>
                              <option value="">—</option>
                              {accounts.filter(item => item.categoriaId === categories.find(cat => cat.codigo === inlineNewValues.categoria)?.id)
                                .map(item => <option key={item.id} value={item.id}>{item.codigo} – {item.descricao}</option>)}
                            </select>
                          );
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
        </div>

        {/* Footer */}
        <div className="table-footer" style={{ margin: "0 28px 14px" }}>
          <span>{total} lançamentos</span>
          <span className="lanc-footer-help">💡 Clique para editar · Enter salva · Esc cancela · Linha + inclui</span>
          <span style={{ marginLeft: "auto", marginRight: total > 50 ? 12 : 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 11 }}>↔ Barra horizontal acima · Ações no extremo direito →</span>
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
          counterparties={counterparties}
          statusTipos={statusTipos}
        />

        {/* Modal de importação */}
        <ImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImported={loadData}
        />
    </div>
  );
}
