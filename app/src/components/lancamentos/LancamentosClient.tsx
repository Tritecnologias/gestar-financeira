"use client";
import Link from "next/link";
import { useCan } from "@/components/access/PermissionContext";
import ExportOnlyButton from "@/components/access/ExportOnlyButton";
import { useState, useEffect, useRef, useCallback } from "react";
import type { LancamentoDTO, ColConfig, FornecedorDTO, StatusManualTipoDTO } from "@/types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { COLUNAS_DEF, DEFAULT_COLUNAS_CONFIG, alignLegacyDefaultColumns, minColumnWidth } from "./colunasConfig";
import LayoutManager from "./LayoutManager";
import StatusTiposModal from "./StatusTiposModal";
import NovoLancamentoModal from "./NovoLancamentoModal";
import OfficialImportModal from "./OfficialImportModal";
import BulkEditModal from "./BulkEditModal";
import CounterpartyPicker from "./CounterpartyPicker";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { activeCounterparties, counterpartyDisplay, counterpartyIds, defaultAccount } from "@/lib/counterparty";
import { lerResumoFluxoCaixa } from "@/lib/cash-flow-response";
import type { calcularFluxoCaixa, DataBaseFinanceira } from "@/lib/cash-flow";
import { type CardLancamento } from "@/lib/lancamento-card-filter";
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
const LINHAS_POR_PAGINA = [100, 200, 500] as const;
type LinhasPorPagina = (typeof LINHAS_POR_PAGINA)[number] | "all";
const filtrosIniciais = (hoje: string): Filtros => ({ busca: "", status: "", tipo: "",
  dataBase: "DATA_LANCAMENTO", inicio: `${hoje.slice(0, 7)}-01`, fim: hoje,
  statusManual: "", categoria: "", contaId: "", clienteId: "", fornecedorId: "",
  centroCusto: "", banco: "", fornecedor: "" });

// ── Chip helpers ─────────────────────────────────────────────
function ChipTipo({ tipo }: { tipo: string }) {
  return <span className={`chip chip-${tipo.toLowerCase()}`}>{tipo === "ENTRADA" ? "ENTRADA" : "SAÍDA"}</span>;
}
function ChipStatus({ status, tipo }: { status: string; tipo: string }) {
  const cls: Record<string, string> = { realizado: "chip-realizado", previsto: "chip-previsto", cancelado: "chip-cancelado" };
  return <span className={`chip ${status === "realizado" && tipo === "SAIDA" ? "lanc-chip-real-out" : cls[status] ?? "chip-cancelado"}`}>{status}</span>;
}
function ChipStatusAuto({ s, tipo }: { s: string; tipo: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    "PAGO":     { cls: tipo === "SAIDA" ? "lanc-chip-real-out" : "chip-realizado", label: "PAGO" },
    "ATRASADO": { cls: tipo === "ENTRADA" ? "lanc-chip-receivable" : "lanc-chip-payable", label: "ATRASADO" },
    "A VENCER": { cls: tipo === "ENTRADA" ? "lanc-chip-receivable" : "lanc-chip-payable", label: "A VENCER" },
    "PREVISTO": { cls: "chip-previsto", label: "PREVISTO" },
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
      const label = account ? `${account.codigo ?? ""} – ${account.descricao}`
        : row.contaN2Descricao ? `${row.contaN2Codigo ?? ""} – ${row.contaN2Descricao}` : "Conta N2 vinculada";
      return <span title={label}>{label}</span>;
    }
    case "tipo":        return <ChipTipo tipo={val} />;
    case "status":      return <ChipStatus status={val} tipo={row.tipo} />;
    case "statusAuto":  return <><ChipStatusAuto s={val} tipo={row.tipo} />{row.problemasFinanceiros?.length ?
      <span className="lanc-review" title={row.problemasFinanceiros.map(problema => PROBLEMAS[problema] || problema).join("; ")}>Revisar</span> : null}</>;
    case "valorPrevisto": return <span className={Number(val) === 0 ? "lanc-value-neutral" : row.tipo === "ENTRADA" ? "val-entrada" : "val-saida"}>{formatCurrency(val)}</span>;
    case "valor": return <span className={Number(val) === 0 ? "lanc-value-neutral" : row.tipo === "ENTRADA" ? "val-entrada" : "val-saida"}>{formatCurrency(val)}</span>;
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
    default: return <span title={String(val)}>{String(val)}</span>;
  }
}

// ── Componente principal ──────────────────────────────────────
export default function LancamentosClient({ hoje }: { hoje: string }) {
  const can = useCan();
  const canCreate = can("fluxo.lancamentos.create");
  const canEdit = can("fluxo.lancamentos.edit");
  const canDelete = can("fluxo.lancamentos.delete");
  const canBulkEdit = can("fluxo.lancamentos.bulk_edit");
  const canSeeBalances = can("fluxo.visao.saldos");
  // Estado principal
  const [lancamentos, setLancamentos] = useState<LancamentoDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [totais, setTotais] = useState({ valorPrevisto: "0.00", valorRealizado: "0.00", cont: 0 });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const loadedList = useRef(false);
  const [colConfig, setColConfig] = useState<ColConfig[]>(DEFAULT_COLUNAS_CONFIG);
  const [colConfigReady, setColConfigReady] = useState(false);

  useEffect(() => {
    let active = true;
    const saved = localStorage.getItem("gestar_col_config");
    if (saved) {
      try {
        setColConfig(alignLegacyDefaultColumns(JSON.parse(saved)));
        setColConfigReady(true);
        return;
      } catch { /* usa o layout padrão salvo, se houver */ }
    }
    fetch("/api/layouts").then(response => response.json()).then(layouts => {
      const defaultLayout = Array.isArray(layouts) && layouts.find(layout => layout.isDefault);
      if (active && defaultLayout) setColConfig(alignLegacyDefaultColumns(defaultLayout.colunas));
    }).catch(() => {}).finally(() => { if (active) setColConfigReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (colConfigReady) localStorage.setItem("gestar_col_config", JSON.stringify(colConfig));
  }, [colConfig, colConfigReady]);

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<LancamentoDTO>>({});
  const editValuesRef = useRef<Partial<LancamentoDTO>>({});
  const savedEditValuesRef = useRef<Partial<LancamentoDTO>>({});
  const pendingEditKeysRef = useRef<Set<keyof LancamentoDTO>>(new Set());
  const inFlightEditKeysRef = useRef<Set<keyof LancamentoDTO>>(new Set());
  const flushRef = useRef<Promise<boolean> | null>(null);
  const editSessionRef = useRef(0);
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message: string }>({ kind: "idle", message: "" });
  const completingEditRef = useRef(false);
  const [completingEditId, setCompletingEditId] = useState<string | null>(null);
  useEffect(() => {
    if (saveState.kind !== "saved") return;
    const timer = setTimeout(() => setSaveState(current => current.kind === "saved" ? { kind: "idle", message: "" } : current), 1800);
    return () => clearTimeout(timer);
  }, [saveState]);
  const editFocusKey = useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Filtros
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosIniciais(hoje));
  const [cardAtivo, setCardAtivo] = useState<CardLancamento | null>(null);
  const [buscaInput, setBuscaInput] = useState("");
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [resumoAtualizando, setResumoAtualizando] = useState(false);
  const [resumoErro, setResumoErro] = useState("");
  const [listErro, setListErro] = useState("");
  const listRequestId = useRef(0);
  const summaryRequestId = useRef(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<LinhasPorPagina>(500);
  useEffect(() => { setSelectedIds(new Set()); }, [filtros, cardAtivo, pagina, porPagina]);

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
  const novoButtonRef = useRef<HTMLButtonElement>(null);
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
    if (key === "busca") { setBuscaInput(value); setPagina(1); return; }
    setFiltros(current => ({ ...current, busca: buscaInput, [key]: value,
      ...(key === "categoria" ? { contaId: "" } : {}),
      ...(key === "clienteId" && value ? { fornecedorId: "" } : {}),
      ...(key === "fornecedorId" && value ? { clienteId: "" } : {}),
    }));
    setPagina(1);
  };
  const parametrosFiltros = () => {
    const params = new URLSearchParams(Object.entries({ ...filtros, busca: buscaInput })
      .filter(([, value]) => value) as [string, string][]);
    if (cardAtivo) params.set("card", cardAtivo);
    return params;
  };
  const avancadosAtivos = (["statusManual", "categoria", "contaId", "clienteId", "fornecedorId",
    "centroCusto", "banco", "fornecedor"] as const).filter(key => filtros[key]).length;
  const filtrosAtivos = Boolean(buscaInput.trim() || cardAtivo || Object.entries(filtros).some(([key, value]) =>
    key === "busca" ? false : key === "dataBase" ? value !== "DATA_LANCAMENTO" : Boolean(value)));
  const periodoAtivo = Boolean(filtros.inicio || filtros.fim);
  const totalPaginas = porPagina === "all" ? 1 : Math.ceil(total / porPagina);

  useEffect(() => {
    const timer = setTimeout(() => setFiltros(current => current.busca === buscaInput ? current : { ...current, busca: buscaInput }), 250);
    return () => clearTimeout(timer);
  }, [buscaInput]);

  // Atualiza catálogos ao voltar da aba de cadastro, sem selecionar nada implicitamente.
  const loadCatalogs = useCallback(() => {
    const read = async (path: string) => { const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Catálogo indisponível: ${path}`); return response.json(); };
    void Promise.all([read("/api/fornecedores"), read("/api/clientes"), read("/api/categorias"),
      read("/api/plano-contas"), read("/api/status-tipos")]).then(([suppliers, customers, cats, plans, statuses]) => {
      if (Array.isArray(suppliers)) setFornecedores(suppliers);
      if (Array.isArray(customers)) setClientes(customers);
      if (Array.isArray(cats)) setCategories(cats);
      if (Array.isArray(plans)) setAccounts(plans);
      if (Array.isArray(statuses)) setStatusTipos(statuses);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    loadCatalogs();
    const onFocus = () => loadCatalogs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCatalogs]);

  const reloadStatusTipos = () => {
    fetch("/api/status-tipos").then(r => r.json()).then(d => Array.isArray(d) && setStatusTipos(d)).catch(() => {});
  };

  // ── Inserção rápida: atalho Alt+N ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (canCreate && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setInlineNewOpen(true);
        setInlineNewValues({ dataLanc: new Date().toISOString().split("T")[0], tipo: "SAIDA" });
        setTimeout(() => inlineNewFirstRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [canCreate]);

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
        refreshData();
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

  // A lista e o resumo possuem ciclos independentes: paginação/ordenação não recalculam os KPIs.
  const loadList = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++listRequestId.current;
    if (loadedList.current) setUpdating(true);
    else setLoading(true);
    const params = new URLSearchParams(Object.entries(filtros).filter(([, value]) => value) as [string, string][]);
    if (cardAtivo) params.set("card", cardAtivo);
    params.set("pagina", String(pagina));
    params.set("porPagina", String(porPagina));
    if (sortKey && !SORT_COMPUTED.has(sortKey)) { params.set("sortKey", sortKey); params.set("sortDir", sortDir); }
    try {
      const lista = await fetch(`/api/lancamentos?${params}`, { signal }).then(async response => {
        if (!response.ok) throw new Error("Não foi possível carregar os lançamentos.");
        return response.json();
      });
      if (currentRequest !== listRequestId.current || signal?.aborted) return;
      let rows: LancamentoDTO[] = lista.data ?? [];
      if (sortKey && SORT_COMPUTED.has(sortKey)) rows = [...rows].sort((a, b) => {
        const av = (a as any)[sortKey] ?? "";
        const bv = (b as any)[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
      setLancamentos(rows);
      setSelectedIds(current => new Set([...current].filter(id => rows.some(row => row.id === id))));
      setTotal(lista.total ?? 0);
      setTotais(lista.totais ?? { valorPrevisto: "0.00", valorRealizado: "0.00", cont: lista.total ?? 0 });
      setListErro("");
    } catch (error) {
      if (currentRequest !== listRequestId.current || signal?.aborted) return;
      setListErro(error instanceof Error ? error.message : "Erro ao carregar lançamentos.");
    } finally {
      if (currentRequest === listRequestId.current && !signal?.aborted) {
        loadedList.current = true;
        setLoading(false);
        setUpdating(false);
      }
    }
  }, [filtros, cardAtivo, pagina, porPagina, sortKey, sortDir]);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++summaryRequestId.current;
    setResumoAtualizando(true);
    const params = new URLSearchParams(Object.entries(filtros).filter(([, value]) => value) as [string, string][]);
    params.set("dataReferencia", hoje);
    params.set("inicio", filtros.inicio || "1900-01-01");
    params.set("fim", filtros.fim || hoje);
    try {
      const data = await fetch(`/api/fluxo-caixa/resumo?${params}`, { signal }).then(lerResumoFluxoCaixa);
      if (currentRequest !== summaryRequestId.current || signal?.aborted) return;
      setResumo(data);
      setResumoErro("");
    } catch (error) {
      if (currentRequest !== summaryRequestId.current || signal?.aborted) return;
      setResumo(null);
      setResumoErro(error instanceof Error ? error.message : "Erro ao carregar resumo financeiro.");
    } finally {
      if (currentRequest === summaryRequestId.current && !signal?.aborted) setResumoAtualizando(false);
    }
  }, [filtros, hoje]);

  const refreshData = () => { void loadList(); if (canSeeBalances) void loadSummary(); };
  useEffect(() => { const controller = new AbortController(); void loadList(controller.signal); return () => controller.abort(); }, [loadList]);
  useEffect(() => { if (!canSeeBalances) return; const controller = new AbortController(); void loadSummary(controller.signal); return () => controller.abort(); }, [loadSummary, canSeeBalances]);

  // Cards seguem a posição financeira do motor, independentemente da data-base da grade.
  const cardValor = (card: CardLancamento) => {
    if (!resumo) return "0.00";
    if (card === "aReceber" || card === "aPagar") {
      return resumo.previsaoAberta[card === "aReceber" ? "entradas" : "saidas"];
    }
    return resumo[card].total;
  };
  const cards: { id: CardLancamento; titulo: string; cor: string }[] = [
    { id: "saldoAnterior", titulo: "Saldo anterior", cor: "base" },
    { id: "entradas", titulo: "Entradas", cor: "entrada" },
    { id: "aReceber", titulo: "A receber", cor: "receber" },
    { id: "saidas", titulo: "Saídas", cor: "saida" },
    { id: "aPagar", titulo: "A pagar", cor: "pagar" },
    { id: "saldoPeriodo", titulo: "Resultado do período", cor: "saldo" },
    { id: "saldoFinal", titulo: !filtros.fim || filtros.fim === hoje ? "Saldo atual" : "Saldo final", cor: "saldo" },
  ];

  // ── Edição inline ─────────────────────────────────────────
  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => {
      const row = Array.from(bodyScrollRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]") ?? [])
        .find(element => element.dataset.rowId === editingId);
      const cell = Array.from(row?.cells ?? []).find(element => element.dataset.colKey === editFocusKey.current);
      const target = (cell?.querySelector("input, select, textarea, button")
        ?? row?.querySelector<HTMLInputElement>('td[data-col-key="descricao"] textarea')) as HTMLElement | null;
      target?.focus({ preventScroll: true });
      editFocusKey.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId]);

  const editValueChanged = (key: keyof LancamentoDTO) =>
    String(editValuesRef.current[key] ?? "") !== String(savedEditValuesRef.current[key] ?? "");

  // Um único escritor por linha: respostas antigas jamais substituem o rascunho mais recente.
  const flushEdits = (id: string): Promise<boolean> => {
    if (flushRef.current) return flushRef.current;
    const session = editSessionRef.current;
    const run = async (): Promise<boolean> => {
      while (pendingEditKeysRef.current.size) {
        const keys = [...pendingEditKeysRef.current];
        pendingEditKeysRef.current.clear();
        const patch: Partial<LancamentoDTO> = {};
        for (const key of keys) {
          if (editValueChanged(key)) (patch as Record<string, unknown>)[key] = editValuesRef.current[key];
        }
        if (!Object.keys(patch).length) continue;
        inFlightEditKeysRef.current = new Set(keys);
        setSaveState({ kind: "saving", message: "Salvando…" });
        try {
          const response = await fetch(`/api/lancamentos/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Não foi possível salvar esta alteração (HTTP ${response.status}).`);
          }
          const updated: LancamentoDTO = await response.json();
          if (session !== editSessionRef.current) return false;
          savedEditValuesRef.current = { ...savedEditValuesRef.current, ...updated };
          setLancamentos(previous => previous.map(item => item.id === id ? updated : item));
          setSaveState({ kind: "saved", message: "Salvo" });
          void loadSummary();
        } catch (error) {
          if (session !== editSessionRef.current) return false;
          keys.forEach(key => pendingEditKeysRef.current.add(key));
          setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Erro ao salvar." });
          return false;
        } finally {
          inFlightEditKeysRef.current.clear();
        }
      }
      return true;
    };
    const promise = run();
    flushRef.current = promise;
    void promise.then(success => {
      if (flushRef.current === promise) flushRef.current = null;
      if (success && session === editSessionRef.current && pendingEditKeysRef.current.size) void flushEdits(id);
    });
    return promise;
  };

  const queueEdit = (id: string, ...keys: (keyof LancamentoDTO)[]) => {
    keys.forEach(key => pendingEditKeysRef.current.add(key));
    if (!flushRef.current) void flushEdits(id);
  };

  const changeEdit = (id: string, patch: Partial<LancamentoDTO>, saveNow = false) => {
    const updated = { ...editValuesRef.current, ...patch };
    editValuesRef.current = updated;
    setEditValues(updated);
    setSaveState({ kind: "idle", message: "" });
    if (saveNow) queueEdit(id, ...Object.keys(patch) as (keyof LancamentoDTO)[]);
  };

  const commitCell = (id: string, key: keyof LancamentoDTO) => {
    if (key === "categoria" || key === "contaId") {
      if (editValueChanged("categoria") || editValueChanged("contaId")) queueEdit(id, "categoria", "contaId");
    } else if (key === "dataVencOriginal" && editValueChanged("dataVencPlano")) {
      queueEdit(id, "dataVencOriginal", "dataVencPlano");
    } else if (editValueChanged(key)) queueEdit(id, key);
  };

  const resetCell = (key: keyof LancamentoDTO) => {
    const keys: (keyof LancamentoDTO)[] = key === "categoria" || key === "contaId" ? ["categoria", "contaId"]
      : key === "fantasiaPadrao" ? ["fantasiaPadrao", "clienteId", "fornecedorId"] : [key];
    // Uma requisição já enviada não pode ser desfeita pelo Esc; evite mostrar um valor falso.
    if (keys.some(field => inFlightEditKeysRef.current.has(field))) return;
    const restored = { ...editValuesRef.current };
    for (const field of keys) {
      (restored as Record<string, unknown>)[field] = savedEditValuesRef.current[field];
      pendingEditKeysRef.current.delete(field);
    }
    editValuesRef.current = restored;
    setEditValues(restored);
    setSaveState({ kind: "idle", message: "" });
  };

  const finishEdit = () => {
    editSessionRef.current++;
    pendingEditKeysRef.current.clear();
    setEditingId(null);
    setEditValues({});
    editValuesRef.current = {};
    savedEditValuesRef.current = {};
    setSaveState({ kind: "idle", message: "" });
  };

  const completeEdit = async (id: string) => {
    if (completingEditRef.current || editingId !== id || saveState.kind === "error") return;
    completingEditRef.current = true;
    setCompletingEditId(id);
    try {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("tr[data-row-id]")?.getAttribute("data-row-id") === id) active.blur();
      // O blur e os selects já enfileiram somente as células alteradas.
      // Aguarde também uma gravação que já estava em andamento.
      do {
        if (!await flushEdits(id)) return;
      } while (flushRef.current || pendingEditKeysRef.current.size);
      finishEdit();
    } catch (error) {
      setSaveState({ kind: "error", message: error instanceof Error ? error.message : "Erro ao concluir a edição." });
    } finally {
      completingEditRef.current = false;
      setCompletingEditId(null);
    }
  };

  const startEdit = async (row: LancamentoDTO, focusKey = "descricao") => {
    if (editingId && editingId !== row.id) {
      for (const key of Object.keys(editValuesRef.current) as (keyof LancamentoDTO)[]) {
        if (editValueChanged(key)) pendingEditKeysRef.current.add(key);
      }
      if (pendingEditKeysRef.current.size && !await flushEdits(editingId)) return;
      if (flushRef.current && !await flushRef.current) return;
      finishEdit();
    }
    if (editingId === row.id) return;
    const linked = accounts.find(account => account.id === row.contaId);
    const officialCategory = categories.find(category => category.id === linked?.categoriaId)
      ?? categories.find(category => category.codigo === row.categoria);
    const initial = { ...row, categoria: officialCategory?.codigo ?? (row.contaId ? row.categoria : null) };
    editValuesRef.current = initial;
    savedEditValuesRef.current = initial;
    pendingEditKeysRef.current.clear();
    setEditValues(initial);
    setSaveState({ kind: "idle", message: "" });
    editFocusKey.current = focusKey;
    setEditingId(row.id);
  };

  const handleDelete = async (id: string) => {
    if (flushRef.current) await flushRef.current;
    if (editingId === id) {
      finishEdit();
    }
    const res = await fetch(`/api/lancamentos/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("🗑️ Excluído"); setSelectedIds(current => { const next = new Set(current); next.delete(id); return next; }); refreshData(); }
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
  const selectedLoaded = lancamentos.filter(row => selectedIds.has(row.id));
  const allLoadedSelected = lancamentos.length > 0 && selectedLoaded.length === lancamentos.length;
  const effectiveWidth = (def: (typeof COLUNAS_DEF)[0]) => Math.max(minColumnWidth(def), colConfig.find(config => config.key === def.key)?.width ?? def.width);
  const tableWidth = `calc(var(--lanc-controls-width) + ${visibleCols.reduce((sum, def) => sum + effectiveWidth(def), 0)}px)`;
  const controlsWidth: React.CSSProperties = { width: "var(--lanc-controls-width)", minWidth: "var(--lanc-controls-width)", maxWidth: "var(--lanc-controls-width)" };

  const toggleSelection = (id: string) => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const { leftOffsets, rightOffsets } = calcStickyOffsets(colConfig);

  // ── Drag & drop de colunas ────────────────────────────────
  const STICKY_KEYS = new Set<string>();
  const NO_SORT_KEYS = new Set<string>();
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
    resizeStartW.current = def ? Math.max(minColumnWidth(def), cfg?.width ?? def.width) : 100;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingKey.current) return;
      const diff = ev.clientX - resizeStartX.current;
      const newWidth = Math.max(def ? minColumnWidth(def) : 40, resizeStartW.current + diff);
      setColConfig(prev => prev.map(c => c.key === resizingKey.current ? { ...c, width: newWidth } : c));
    };

    const handleMouseUp = () => {
      resizingKey.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
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
    const w = effectiveWidth(def);
    const style: React.CSSProperties = { width: w, minWidth: w, maxWidth: w };
    if (def.stickyLeft)  { style.position = "sticky"; style.left  = leftOffsets[def.key] ?? 0; style.zIndex = 2; style.background = "#F8FAFC"; }
    if (def.stickyRight) { style.position = "sticky"; style.right = rightOffsets[def.key] ?? 0; style.zIndex = 2; style.background = "#F8FAFC"; }
    if (def.align) style.textAlign = def.align;
    return style;
  };

  const getTdStyle = (def: (typeof COLUNAS_DEF)[0], isEditing: boolean): React.CSSProperties => {
    const w = effectiveWidth(def);
    const style: React.CSSProperties = { width: w, minWidth: w, maxWidth: w };
    if (def.stickyLeft)  { style.position = "sticky"; style.left  = leftOffsets[def.key] ?? 0; style.zIndex = 1; style.background = isEditing ? "var(--selection)" : "var(--bg-card)"; }
    if (def.stickyRight) { style.position = "sticky"; style.right = rightOffsets[def.key] ?? 0; style.zIndex = 1; style.background = isEditing ? "var(--selection)" : "var(--bg-card)"; }
    if (def.align) style.textAlign = def.align;
    return style;
  };

  // ── Render de célula no modo edição ───────────────────────
  const renderEditCell = (def: (typeof COLUNAS_DEF)[0], rowId: string) => {
    if (def.editavel === false) return renderCell(def.key, (editValuesRef.current.id === rowId ? editValuesRef.current : editValues) as LancamentoDTO, statusTipos, accounts);
    const val = (editValues as any)[def.key] ?? "";
    const common = {
      className: "cell-input",
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
        if (e.key === "Escape") { e.preventDefault(); resetCell(def.key as keyof LancamentoDTO); (e.currentTarget as HTMLElement).blur(); }
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
            const next = e.target.value || null;
            changeEdit(rowId, def.key === "dataVencOriginal" && !editValuesRef.current.dataVencPlano
              ? { dataVencOriginal: next, dataVencPlano: next }
              : { [def.key]: next });
          }}
          onBlur={() => commitCell(rowId, def.key as keyof LancamentoDTO)}
        />
      );
    }
    if (def.tipo === "number") {
      return (
        <input
          {...common}
          onBlur={() => commitCell(rowId, def.key as keyof LancamentoDTO)}
          type="number"
          step="0.01"
          value={val ?? ""}
          onChange={e => changeEdit(rowId, { [def.key]: e.target.value })}
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
            const next = e.target.value;
            if (def.key === "tipo") {
              const account = accounts.find(item => item.id === editValuesRef.current.contaId);
              const incompatible = account && ((account.tipo === "RECEITA" && next === "SAIDA") || (account.tipo === "DESPESA" && next === "ENTRADA") || account.tipo === "TRANSFERENCIA");
              changeEdit(rowId, incompatible ? { tipo: next as LancamentoDTO["tipo"], contaId: null, categoria: editValuesRef.current.categoria || null } : { tipo: next as LancamentoDTO["tipo"] }, true);
            } else changeEdit(rowId, { [def.key]: next }, true);
          }}
          className="cell-input"
        >
          {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (def.tipo === "select-api") {
      if (def.source === "categorias" || def.source === "plano-contas") {
        const selectedCategory = editValues.categoria || "";
        const linked = accounts.find(item => item.id === editValues.contaId);
        const categoryOptions = categories.some(item => item.codigo === selectedCategory) ? categories :
          editValues.contaId && selectedCategory ? [...categories, { id: linked?.categoriaId || "linked", codigo: selectedCategory, nome: "Vínculo atual" }] : categories;
        const accountOptions = accounts.filter(item => item.categoriaId === categoryOptions.find(cat => cat.codigo === selectedCategory)?.id);
        return (
          <SearchableSelect className="cell-input" label={def.source === "categorias" ? "Categoria N1" : "Conta N2"}
            value={String(val ?? "")} createActions={can("estrutura.financeiras.create") ? [{ label: def.source === "categorias" ? "+ Cadastrar nova categoria" : "+ Cadastrar nova conta",
              href: "/estrutura/dimensoes-financeiras" }] : []}
            options={def.source === "categorias" ? categoryOptions.map(item => ({ value: item.codigo, label: `${item.codigo} – ${item.nome}` }))
              : accountOptions.map(item => ({ value: item.id, label: `${item.codigo} – ${item.descricao}` }))}
            displayValue={def.source === "plano-contas" && editValues.contaId && !accountOptions.some(item => item.id === editValues.contaId)
              ? `${editValues.contaN2Codigo} – ${editValues.contaN2Descricao || "Vínculo atual"}` : undefined}
            onEscape={() => resetCell(def.key as keyof LancamentoDTO)}
            onChange={next => {
              if (def.source === "categorias") {
                const account = accounts.find(item => item.id === editValuesRef.current.contaId);
                const target = categories.find(item => item.codigo === next);
                changeEdit(rowId, { categoria: next || null,
                  ...(account && account.categoriaId === target?.id ? {} : { contaId: null }) }, true);
              } else {
                const account = accounts.find(item => item.id === next);
                const category = categories.find(item => item.id === account?.categoriaId);
                if (account && !category) { setSaveState({ kind: "error", message: "A Categoria desta Conta não está disponível." }); return; }
                changeEdit(rowId, { contaId: account?.id || null, categoria: category?.codigo || editValuesRef.current.categoria || null }, true);
              }
            }} />
        );
      }
      if (def.source === "fornecedores") {
        const selected = counterparties.find(item => item.id === (editValues.clienteId || editValues.fornecedorId)) || null;
        return (
          <CounterpartyPicker className="cell-input" options={counterparties} selected={selected}
            legacyLabel={selected ? null : val}
            onBlur={() => commitCell(rowId, "fantasiaPadrao")}
            onEnter={() => commitCell(rowId, "fantasiaPadrao")} onEscape={() => resetCell("fantasiaPadrao")}
            onSelect={item => {
              changeEdit(rowId, { ...counterpartyIds(item), fantasiaPadrao: item ? counterpartyDisplay(item) : null }, true);
            }} />
        );
      }
      return (
        <select
          {...common}
          value={val ?? ""}
          onChange={e => changeEdit(rowId, { [def.key]: e.target.value }, true)}
          className="cell-input"
        >
          <option value="">—</option>
          {statusTipos.map(o => <option key={o.id} value={o.codigo}>{o.nome}</option>)}
        </select>
      );
    }
    if (def.key === "descricao" || def.key === "anotacao") return (
      <textarea
        className="cell-input lanc-inline-textarea"
        aria-label={def.label}
        rows={4}
        value={val ?? ""}
        onBlur={() => commitCell(rowId, def.key as keyof LancamentoDTO)}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); resetCell(def.key as keyof LancamentoDTO); e.currentTarget.blur(); } }}
        onChange={e => changeEdit(rowId, { [def.key]: e.target.value })}
      />
    );
    return (
      <input
        {...common}
        onBlur={() => commitCell(rowId, def.key as keyof LancamentoDTO)}
        type="text"
        value={val ?? ""}
        onChange={e => changeEdit(rowId, { [def.key]: e.target.value })}
        className={`cell-input ${def.key === "descricao" ? "wide" : ""}`}
      />
    );
  };

  return (
    <div className="lanc-page" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Topbar */}
        <div className="topbar">
          <div><h1 className="page-title">Lançamentos</h1><p className="page-sub">Operação e consulta do fluxo de caixa</p></div>
        </div>

        <section className="lanc-filters" aria-label="Filtros de lançamentos">
          <div className="lanc-toolbar">
            <label className={`filter-group lanc-search ${buscaInput.trim() ? "filter-active" : ""}`}><span className="filter-label">Busca</span>
              <input className="filter-input" value={buscaInput} placeholder="Cliente, fornecedor, fantasia, descrição, anotação"
                onChange={event => atualizarFiltro("busca", event.target.value)} /></label>
            <div className="lanc-toolbar-actions">
            {canCreate && <button ref={novoButtonRef} className="btn btn-outline lanc-new-button" onClick={() => setNovoModalOpen(true)}>+ Novo Lançamento</button>}
            {can("fluxo.lancamentos.import") && <button className="btn btn-primary" onClick={() => setImportModalOpen(true)}>Importar Lançamentos</button>}
            <ExportOnlyButton permission="fluxo.lancamentos.export" importPermission="fluxo.lancamentos.import" url={`/api/lancamentos/exportar?${parametrosFiltros()}`} filename="lancamentos.csv" label="Exportar Lançamentos" />
            </div>
          </div>
          <section className="lanc-summary" aria-label="Resumo financeiro dos filtros" aria-busy={resumoAtualizando}>
            {!canSeeBalances ? <div className="lanc-summary-loading">Saldos indisponíveis para este perfil.</div> : resumoErro ? <div className="lanc-summary-error">{resumoErro}</div> : !resumo ?
              <div className="lanc-summary-loading">Carregando resumo financeiro…</div> : <>
                <div className="lanc-summary-grid">{cards.map(card => {
                  const valor = Number(cardValor(card.id));
                  const sinal = card.cor === "saldo" ? valor > 0 ? "positive" : valor < 0 ? "negative" : "zero" : "";
                  return <button key={card.id} type="button" className={`lanc-summary-card ${card.cor} ${sinal} ${cardAtivo === card.id ? "is-active" : ""}`}
                    aria-pressed={cardAtivo === card.id} aria-label={`${card.titulo}: ${formatCurrency(valor)}. Filtrar lançamentos componentes.`}
                    onClick={() => { setCardAtivo(current => current === card.id ? null : card.id); setPagina(1); }}>
                    <span>{card.titulo}</span><strong>{formatCurrency(valor)}</strong></button>;
                })}</div>
              </>}
            {resumoAtualizando && resumo && <span className="lanc-summary-updating" role="status">Atualizando resumo…</span>}
          </section>
          <div className="lanc-filter-main">
            <div className="filter-group lanc-filter-action"><span className="filter-label">Filtros</span>
              <button className={`btn btn-outline lanc-advanced-toggle ${avancadosAtivos ? "lanc-criterion-active" : ""}`} type="button"
                aria-label={avancadosAtivos ? `Filtros avançados, ${avancadosAtivos} ${avancadosAtivos === 1 ? "ativo" : "ativos"}` : "Filtros avançados"}
                title="Filtros avançados" aria-expanded={avancadosOpen}
                onClick={() => setAvancadosOpen(open => !open)}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
                </svg>
                <span>+ Filtros</span>
                {avancadosAtivos > 0 && <span className="lanc-advanced-count" aria-hidden="true">{avancadosAtivos}</span>}
              </button>
            </div>
            <label className={`filter-group ${filtros.status ? "lanc-criterion-active" : ""}`}><span className="filter-label">Status financeiro</span>
              <select className="filter-input" value={filtros.status} onChange={event => atualizarFiltro("status", event.target.value)}>
                <option value="">Todos</option>{STATUS_FINANCEIROS.map(status =>
                  <option key={status} value={status}>{status === "REALIZADO" ? "REALIZADO / PAGO" : status}</option>)}</select></label>
            <label className={`filter-group ${filtros.tipo === "ENTRADA" ? "lanc-direction-in" : filtros.tipo === "SAIDA" ? "lanc-direction-out" : ""}`}><span className="filter-label">Direção</span>
              <select className="filter-input" value={filtros.tipo} onChange={event => atualizarFiltro("tipo", event.target.value)}>
                <option value="">Todas</option><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></label>
            <label className="filter-group lanc-criterion-active"><span className="filter-label">Data-base</span>
              <select className="filter-input" value={filtros.dataBase} onChange={event => atualizarFiltro("dataBase", event.target.value)}>
                {DATA_BASES.map(item => <option key={item.valor} value={item.valor}>{item.nome}</option>)}</select></label>
            <button className={`btn btn-outline lanc-year ${filtros.inicio === `${hoje.slice(0, 4)}-01-01` && filtros.fim === hoje ? "filter-active" : ""}`} type="button" onClick={() => {
              setFiltros(current => ({ ...current, busca: buscaInput, inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje })); setPagina(1);
            }}>Ano atual</button>
            <label className={`filter-group ${periodoAtivo ? "filter-active" : ""}`}><span className="filter-label">Ano / Mês</span>
              <input className="filter-input" type="month" value={filtros.inicio && filtros.fim && filtros.inicio.slice(0, 7) === filtros.fim.slice(0, 7) ? filtros.inicio.slice(0, 7) : ""}
                onChange={event => { const month = event.target.value; if (!month) return;
                  const [year, number] = month.split("-").map(Number);
                  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
                  setFiltros(current => ({ ...current, busca: buscaInput, inicio: `${month}-01`, fim: month === hoje.slice(0, 7) ? hoje : end })); setPagina(1); }} /></label>
            <label className={`filter-group ${periodoAtivo ? "filter-active" : ""}`}><span className="filter-label">De</span>
              <input className="filter-input" type="date" value={filtros.inicio} onChange={event => atualizarFiltro("inicio", event.target.value)} /></label>
            <label className={`filter-group ${periodoAtivo ? "filter-active" : ""}`}><span className="filter-label">Até</span>
              <input className="filter-input" type="date" value={filtros.fim} onChange={event => atualizarFiltro("fim", event.target.value)} /></label>
            <div className="lanc-filter-actions">
              <button className={`btn btn-outline lanc-clear-filters ${filtrosAtivos ? "is-active" : ""}`} type="button" onClick={() => { setBuscaInput(""); setFiltros({ ...filtrosIniciais(hoje), inicio: "", fim: "" }); setCardAtivo(null); setPagina(1); }}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.8 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.2-2" />
                </svg>
                Limpar filtros</button>
              <button className="accordion-trigger lanc-settings-trigger" type="button" aria-expanded={atalhosOpen} onClick={() => setAtalhosOpen(open => !open)}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2h4l.5 2.3a8 8 0 0 1 1.7.7l2-1.3 2.8 2.8-1.3 2a8 8 0 0 1 .7 1.7L22 10v4l-2.3.5a8 8 0 0 1-.7 1.7l1.3 2-2.8 2.8-2-1.3a8 8 0 0 1-1.7.7L14 22h-4l-.5-2.3a8 8 0 0 1-1.7-.7l-2 1.3L3 17.5l1.3-2a8 8 0 0 1-.7-1.7L2 14v-4l2.3-.5a8 8 0 0 1 1.7-.7l-1.3-2L6.5 3l2 1.3a8 8 0 0 1 1.7-.7L10 2Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="accordion-title">Configurações e Atalhos</span><span className={`accordion-chevron ${atalhosOpen ? "open" : ""}`}>›</span></button>
            </div>
          </div>
          {avancadosOpen && <div className="lanc-advanced" aria-label="Filtros avançados">
            <label className={`filter-group ${filtros.statusManual ? "lanc-criterion-active" : ""}`}><span className="filter-label">Status Manual</span><select className="filter-input" value={filtros.statusManual} onChange={event => atualizarFiltro("statusManual", event.target.value)}>
              <option value="">Todos</option>{statusTipos.map(st => <option key={st.id} value={st.codigo}>{st.nome}</option>)}</select></label>
            <div className={`filter-group ${filtros.categoria ? "lanc-criterion-active" : ""}`}><span className="filter-label">Categoria N1</span><SearchableSelect
              label="Filtrar Categoria N1" className="filter-input" emptyLabel="Todas" value={filtros.categoria}
              options={categories.map(item => ({ value: item.codigo, label: `${item.codigo} – ${item.nome}` }))}
              createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova categoria", href: "/estrutura/dimensoes-financeiras" }] : []}
              onChange={value => atualizarFiltro("categoria", value)} /></div>
            <div className={`filter-group ${filtros.contaId ? "lanc-criterion-active" : ""}`}><span className="filter-label">Conta N2</span><SearchableSelect
              label="Filtrar Conta N2" className="filter-input" emptyLabel="Todas" value={filtros.contaId}
              options={accounts.filter(item => !filtros.categoria || item.categoriaId === categories.find(cat => cat.codigo === filtros.categoria)?.id)
                .map(item => ({ value: item.id, label: `${item.codigo} – ${item.descricao}` }))}
              createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova conta", href: "/estrutura/dimensoes-financeiras" }] : []}
              onChange={value => {
              const account = accounts.find(item => item.id === value);
              const category = categories.find(item => item.id === account?.categoriaId);
              setFiltros(current => ({ ...current, busca: buscaInput, contaId: account?.id || "", categoria: category?.codigo || current.categoria })); setPagina(1);
            }} /></div>
            <div className={`filter-group ${filtros.clienteId ? "lanc-criterion-active" : ""}`}><span className="filter-label">Cliente</span><SearchableSelect
              label="Filtrar Cliente" className="filter-input" emptyLabel="Todos" value={filtros.clienteId}
              options={clientes.map((item: any) => ({ value: item.id, label: `${item.codigo} – ${item.nomeFantasia || item.nome}` }))}
              createActions={can("estrutura.cadastrais.create") ? [{ label: "+ Cadastrar novo cliente", href: "/estrutura/dimensoes-cadastrais#clientes-title" }] : []}
              onChange={value => atualizarFiltro("clienteId", value)} /></div>
            <div className={`filter-group ${filtros.fornecedorId ? "lanc-criterion-active" : ""}`}><span className="filter-label">Fornecedor</span><SearchableSelect
              label="Filtrar Fornecedor" className="filter-input" emptyLabel="Todos" value={filtros.fornecedorId}
              options={fornecedores.map(item => ({ value: item.id, label: item.display || `${item.codigo} – ${item.nome}` }))}
              createActions={can("estrutura.cadastrais.create") ? [{ label: "+ Cadastrar novo fornecedor", href: "/estrutura/dimensoes-cadastrais#fornecedores-title" }] : []}
              onChange={value => atualizarFiltro("fornecedorId", value)} /></div>
            <label className={`filter-group ${filtros.centroCusto ? "lanc-criterion-active" : ""}`}><span className="filter-label">Centro de Custo legado</span><input className="filter-input" value={filtros.centroCusto} onChange={event => atualizarFiltro("centroCusto", event.target.value)} /></label>
            <label className={`filter-group ${filtros.banco ? "lanc-criterion-active" : ""}`}><span className="filter-label">Local Financeiro</span><input className="filter-input" value={filtros.banco} onChange={event => atualizarFiltro("banco", event.target.value)} /></label>
            <label className={`filter-group ${filtros.fornecedor ? "lanc-criterion-active" : ""}`}><span className="filter-label">Fornecedor legado</span><input className="filter-input" value={filtros.fornecedor} onChange={event => atualizarFiltro("fornecedor", event.target.value)} /></label>
          </div>}
          {atalhosOpen && <div className="lanc-settings-content">{canEdit && <button className="btn btn-outline" onClick={() => setStatusModalOpen(true)}>Status Manual</button>}
              <LayoutManager colConfig={colConfig} onLayoutChange={setColConfig} />
              <label className="lanc-page-size">Linhas por página
                <select value={porPagina} onChange={event => { setPorPagina(event.target.value === "all" ? "all" : Number(event.target.value) as LinhasPorPagina); setPagina(1); }}>
                  {LINHAS_POR_PAGINA.map(size => <option key={size} value={size}>{size}</option>)}
                  <option value="all">Tudo</option>
                </select>
              </label>
              {can("estrutura.empresa.view") && <Link className="btn btn-outline" href="/estrutura/dimensao-empresa">Dimensão da Empresa</Link>}
              {can("estrutura.financeiras.view") && <Link className="btn btn-outline" href="/estrutura/dimensoes-financeiras">Dimensões Financeiras</Link>}
              {can("estrutura.cadastrais.view") && <Link className="btn btn-outline" href="/estrutura/dimensoes-cadastrais">Dimensões Cadastrais</Link>}
              {can("estrutura.portfolio.view") && <Link className="btn btn-outline" href="/estrutura/dimensao-produtos">Dimensão de Portfólio</Link>}</div>}
        </section>
        {listErro && <div className="lanc-list-error" role="alert">{listErro}</div>}

        {canBulkEdit && selectedIds.size > 0 && <div className="lanc-selection-bar" role="status">
          <strong>{selectedIds.size} selecionado(s)</strong>
          {canBulkEdit && <button className="btn btn-primary" onClick={() => setBulkOpen(true)}>Editar em massa</button>}
          <button className="btn btn-outline" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button>
        </div>}

        {/* Tabela — header fixo + body scrollável com scroll sincronizado */}
        <div className="lanc-table-shell" aria-busy={loading || updating} style={{ margin: "14px 28px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-card)", overflow: "hidden" }}>
          {updating && <div className="lanc-list-updating" role="status">Atualizando lançamentos…</div>}
          {/* Header fixo */}
          <div ref={headerScrollRef} style={{ overflowX: "hidden", flexShrink: 0 }}>
            <table className="data-table" style={{ tableLayout: "fixed", minWidth: tableWidth, borderCollapse: "separate", borderSpacing: 0 }}>
              <colgroup><col style={controlsWidth} />{visibleCols.map(def => <col key={def.key} style={{ width: effectiveWidth(def) }} />)}</colgroup>
              <thead>
                <tr>
                  <th className="lanc-select-cell" style={{ ...controlsWidth, position: "sticky", left: 0, zIndex: 3 }}>
                    {canBulkEdit && <input type="checkbox" aria-label="Selecionar lançamentos carregados" checked={allLoadedSelected} ref={element => { if (element) element.indeterminate = selectedLoaded.length > 0 && !allLoadedSelected; }} onChange={event => setSelectedIds(event.target.checked ? new Set(lancamentos.map(row => row.id)) : new Set())} />}
                  </th>
                  {visibleCols.map(def => {
                    const isSticky   = STICKY_KEYS.has(def.key);
                    const isNoSort   = NO_SORT_KEYS.has(def.key);
                    const isDragOver = dragOverKey === def.key;
                    const isSorted   = sortKey === def.key;
                    const isComputed = SORT_COMPUTED.has(def.key);

                  return (
                    <th
                      key={def.key}
                      className={[def.key === "contaId" ? "lanc-financial-end" : "", SORT_COMPUTED.has(def.key) ? "lanc-calculated" : ""].filter(Boolean).join(" ")}
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
                        background: isSorted ? "var(--selection)" : undefined,
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
                        isComputed? `${def.label} — Calculado automaticamente; ordenação na página atual` :
                        isSorted  ? (sortDir === "asc" ? `${def.label}: clique para Decrescente` : `${def.label}: clique para limpar`) :
                        `Ordenar por ${def.label}`
                      }
                    >
                      <span className="lanc-header-content" style={{
                        display: "flex", alignItems: "center", gap: def.key === "seq" ? 2 : 5,
                        justifyContent: def.align === "right" ? "flex-end" : "flex-start"
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
                        <span className="lanc-header-label" style={{ flex: "1 1 auto", minWidth: 0, textAlign: def.align === "right" ? "right" : "left" }}>{def.label}</span>
                        {/* Seta de ordenação — oculta só em Ações */}
                        {!isNoSort && (
                          <span style={{
                            fontSize: 9,
                            opacity: isSorted ? 1 : 0.2,
                            color: isSorted ? "var(--action)" : "inherit",
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
          <div ref={bodyScrollRef} className="lancamentos-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "auto" }} onScroll={e => { if (headerScrollRef.current) headerScrollRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft; }}>
            <table className="data-table" style={{ tableLayout: "fixed", minWidth: tableWidth, borderCollapse: "separate", borderSpacing: 0 }}>
            <colgroup><col style={controlsWidth} />{visibleCols.map(def => <col key={def.key} style={{ width: effectiveWidth(def) }} />)}</colgroup>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length + 1} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Carregando...</td></tr>
              ) : lancamentos.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 1} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Nenhum lançamento encontrado.</td></tr>
              ) : lancamentos.map(row => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} data-row-id={row.id} className={[isEditing ? "editing lanc-inline-editing" : "", isEditing && saveState.kind === "error" ? "lanc-inline-error" : "", selectedIds.has(row.id) ? "lanc-row-selected" : ""].filter(Boolean).join(" ")}>
                    <td className="lanc-select-cell" style={{ ...controlsWidth, position: "sticky", left: 0, zIndex: 2 }}>
                      {canBulkEdit && <input type="checkbox" aria-label={`Selecionar lançamento ${row.seq}`} checked={selectedIds.has(row.id)} onChange={() => toggleSelection(row.id)} onClick={event => event.stopPropagation()} />}
                      {canDelete && pendingDelete === row.id ? <span className="lanc-row-controls lanc-row-controls--confirm">
                        <button type="button" className="action-btn" aria-label="Confirmar exclusão" title="Confirmar exclusão" onClick={() => void handleDelete(row.id)}>✓</button>
                        <button type="button" className="action-btn" aria-label="Cancelar exclusão" title="Cancelar exclusão" onClick={() => setPendingDelete(null)}>✕</button>
                      </span> : canEdit && isEditing ? <span className="lanc-row-controls">
                        <button type="button" className="action-btn lanc-inline-complete" aria-label="Concluir edição" title="Concluir edição" aria-busy={completingEditId === row.id} disabled={completingEditId === row.id || saveState.kind === "error"}
                          onPointerDown={event => { if (event.button === 0) { event.preventDefault(); void completeEdit(row.id); } }}
                          onClick={event => { if (event.detail === 0) void completeEdit(row.id); }}
                        >{completingEditId === row.id ? "…" : "✓"}</button>
                        {canDelete && <button type="button" className="action-btn lanc-inline-delete" aria-label="Excluir lançamento" title="Excluir lançamento" disabled={completingEditId === row.id} onClick={() => setPendingDelete(row.id)}>🗑️</button>}
                        {saveState.kind !== "idle" && <span className={`lanc-save-indicator lanc-save-${saveState.kind}`} role="status" title={saveState.message}>{saveState.kind === "saving" ? "…" : saveState.kind === "saved" ? "✓" : "!"}</span>}
                        {saveState.kind === "error" && <button type="button" className="lanc-save-retry" title={saveState.message} onClick={() => void flushEdits(row.id)}>Tentar novamente</button>}
                      </span> : canEdit ? <button type="button" className="action-btn lanc-edit-trigger" aria-label="Editar lançamento" title="Editar lançamento" onClick={() => void startEdit(row)}>✏️</button> : null}
                      {isEditing && <span className="lanc-row-state-label lanc-row-state-label--editing" aria-hidden="true">{saveState.kind === "error" ? "Erro" : "Editando"}</span>}
                    </td>
                    {visibleCols.map(def => (
                      <td key={def.key} data-col-key={def.key} data-editable={!canEdit || def.editavel === false ? undefined : "true"}
                        tabIndex={canEdit && !isEditing && def.editavel !== false ? 0 : undefined}
                        aria-label={canEdit && !isEditing && def.editavel !== false ? `Editar ${def.label}, lançamento ${row.seq}` : undefined}
                        onClick={() => { if (canEdit && !isEditing && def.editavel !== false) void startEdit(row, def.key); }}
                        onKeyDown={event => { if (canEdit && !isEditing && def.editavel !== false && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void startEdit(row, def.key); } }}
                        className={[def.key === "contaId" ? "lanc-financial-end" : "", SORT_COMPUTED.has(def.key) ? "lanc-calculated" : ""].filter(Boolean).join(" ")} style={getTdStyle(def, isEditing)}>
                        {isEditing ? renderEditCell(def, row.id) : renderCell(def.key, row, statusTipos, accounts)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* Linha de inserção rápida (Alt+N) */}
              {canCreate && inlineNewOpen && (
                <tr className="editing lanc-inline-new" aria-label="Novo lançamento rápido">
                  <td className="lanc-select-cell" style={controlsWidth}><span className="lanc-row-controls lanc-row-controls--confirm">
                    <button className="action-btn" onClick={saveInlineNew} title="Salvar novo lançamento" disabled={inlineNewSaving}>✓</button>
                    <button className="action-btn" onClick={cancelInlineNew} title="Cancelar novo lançamento">✕</button>
                  </span><span className="lanc-row-state-label lanc-row-state-label--new" aria-hidden="true">Novo</span></td>
                  {visibleCols.map((def, idx) => (
                    <td key={def.key} className={def.key === "contaId" ? "lanc-financial-end" : undefined} style={getTdStyle(def, true)}>
                      {def.key === "seq" ? (
                        <span style={{ color: "var(--accent-green)", fontWeight: 700, fontSize: 11 }}>+</span>
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
                            <SearchableSelect label="Categoria N1" className="cell-input" value={inlineNewValues.categoria || ""}
                              options={categories.map(item => ({ value: item.codigo, label: `${item.codigo} – ${item.nome}` }))}
                              createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova categoria", href: "/estrutura/dimensoes-financeiras" }] : []}
                              onChange={value => setInlineNewValues(current => ({ ...current, categoria: value, contaId: "" }))} />
                          );
                          if (def.source === "plano-contas") return (
                            <SearchableSelect label="Conta N2" className="cell-input" value={inlineNewValues.contaId || ""}
                              options={accounts.filter(item => item.categoriaId === categories.find(cat => cat.codigo === inlineNewValues.categoria)?.id)
                                .map(item => ({ value: item.id, label: `${item.codigo} – ${item.descricao}` }))}
                              createActions={can("estrutura.financeiras.create") ? [{ label: "+ Cadastrar nova conta", href: "/estrutura/dimensoes-financeiras" }] : []}
                              onChange={value => {
                              const account = accounts.find(item => item.id === value);
                              const category = categories.find(item => item.id === account?.categoriaId);
                              setInlineNewValues(current => ({ ...current, contaId: account?.id || "", categoria: category?.codigo || current.categoria || "" }));
                            }} />
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
        <div className="table-footer lanc-totals-footer" style={{ margin: "0 28px 14px" }} aria-busy={loading || updating}>
          <div className="lanc-footer-totals">
            <span><small>Valor previsto</small><strong>{canSeeBalances ? formatCurrency(Number(totais.valorPrevisto)) : "—"}</strong></span>
            <span><small>Valor realizado</small><strong>{canSeeBalances ? formatCurrency(Number(totais.valorRealizado)) : "—"}</strong></span>
            <span><small>Cont.</small><strong>{totais.cont}</strong></span>
          </div>
          {totalPaginas > 1 && (
            <div className="lanc-footer-pagination">
              <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>← Ant.</button>
              <span style={{ fontSize: 12 }}>Pág. {pagina} de {totalPaginas}</span>
              <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Próx. →</button>
            </div>
          )}
        </div>

        {/* Toast */}
        <div className={`toast ${toast.show ? "show" : ""}`}>{toast.msg}</div>

        {/* Modal de configuração de Status */}
        <StatusTiposModal
          open={canEdit && statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          onUpdate={reloadStatusTipos}
        />

        {/* Modal de novo lançamento */}
        <NovoLancamentoModal
          open={canCreate && novoModalOpen}
          onClose={() => { setNovoModalOpen(false); requestAnimationFrame(() => novoButtonRef.current?.focus()); }}
          onCreated={refreshData}
          counterparties={counterparties}
          statusTipos={statusTipos}
        />

        {/* O ImportModal CSV anterior permanece no código como LEGACY, sem acesso pela UI. */}
        <OfficialImportModal
          open={can("fluxo.lancamentos.import") && importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImported={refreshData}
          filters={parametrosFiltros().toString()}
        />
        {canBulkEdit && bulkOpen && <BulkEditModal ids={[...selectedIds]} categories={categories} accounts={accounts} statuses={statusTipos} onClose={() => setBulkOpen(false)} onApplied={() => { setBulkOpen(false); setSelectedIds(new Set()); showToast("✅ Edição em massa concluída"); refreshData(); }} />}
    </div>
  );
}
