// Configuração das colunas de dados da tabela de lançamentos
import type { ColConfig } from "@/types";
import { LANCAMENTO_FIELD_ORDER } from "../../lib/lancamento-field-order.mjs";

export interface ColDef {
  key:       string;
  label:     string;
  width:     number;
  minWidth?:  number;
  stickyLeft?:  boolean;
  stickyRight?: boolean;
  editavel?: boolean;
  tipo?:     "text" | "date" | "number" | "select" | "select-api";
  options?:  { value: string; label: string }[];
  source?:   string; // para select-api
  align?:    "left" | "right" | "center";
}

const COLUNAS_BASE: ColDef[] = [
  { key: "seq",              label: "#",             width: 45,  editavel: false, align: "center" },
  { key: "descricao",        label: "Descrição Objetiva", width: 320, tipo: "text" },
  { key: "fantasiaPadrao",   label: "Fantasia", width: 210, tipo: "select-api", source: "fornecedores" },
  { key: "tipo",             label: "Direção",       width: 110, tipo: "select",
    options: [{ value: "ENTRADA", label: "ENTRADA" }, { value: "SAIDA", label: "SAÍDA" }] },
  { key: "categoria",        label: "Categoria N1",  width: 190, tipo: "select-api", source: "categorias" },
  { key: "contaId",          label: "Conta N2",      width: 220, tipo: "select-api", source: "plano-contas" },
  { key: "valorPrevisto",    label: "Valor Previsto", width: 130, tipo: "number", align: "right" },
  { key: "valor",            label: "Valor Realizado", width: 130, tipo: "number", align: "right" },
  { key: "dataLanc",         label: "Data Lançamento", width: 150, tipo: "date" },
  { key: "dataEmissao",      label: "Data Emissão", width: 150, tipo: "date" },
  { key: "dataVencOriginal", label: "Vencimento Original", width: 150, tipo: "date" },
  { key: "dataVencPlano",    label: "Vencimento Planejado", width: 150, tipo: "date" },
  { key: "dataPagamento",    label: "Data Pagamento", width: 150, tipo: "date" },
  { key: "dataEvento",       label: "Data Evento", width: 150, tipo: "date" },
  { key: "statusAuto",       label: "Status Automático", width: 145, editavel: false },
  { key: "statusManual",     label: "Status Manual", width: 120, tipo: "select-api", source: "status-tipos" },
  { key: "fornecedor",       label: "Empresa",       width: 140, tipo: "text" },
  { key: "banco",            label: "Local Financeiro", width: 160, tipo: "text" },
  { key: "centroCusto",      label: "C. Custo",      width: 120, tipo: "text" },
  { key: "dre",              label: "DRE",           width: 100, tipo: "text" },
  { key: "statusExtrato",    label: "Extrato",       width: 120, tipo: "text" },
  { key: "cont",             label: "Cont.",         width: 94,  tipo: "text" },
  { key: "anotacao",         label: "Anotação",      width: 240, tipo: "text" },
  { key: "vencA",            label: "Venc A",        width: 86,  editavel: false, align: "center" },
  { key: "vencM",            label: "Venc M",        width: 86,  editavel: false, align: "center" },
  { key: "vencD",            label: "Venc D",        width: 86,  editavel: false, align: "center" },
  { key: "vencAM",           label: "Venc A_M",      width: 86,  editavel: false, align: "center" },
  { key: "diasAtrasoOriginal",label: "Atr. Orig.",   width: 94,  editavel: false, align: "right" },
  { key: "diasAtrasoPlano",  label: "Atr. Plano",    width: 94,  editavel: false, align: "right" },
  { key: "rangeAtraso",      label: "Range",         width: 94,  editavel: false },
  { key: "emissaoAM",        label: "Emissão A_M",   width: 110, editavel: false, align: "center" },
];

const canonicalRank = new Map<string, number>(LANCAMENTO_FIELD_ORDER.map((key, index) => [key, index]));
export const COLUNAS_DEF: ColDef[] = [...COLUNAS_BASE].sort((a, b) => {
  const position = (key: string) => key === "seq" ? -1
    : canonicalRank.get(key) ?? LANCAMENTO_FIELD_ORDER.length + COLUNAS_BASE.findIndex(col => col.key === key);
  return position(a.key) - position(b.key);
});

// Largura mínima que mantém os controles da edição inline utilizáveis.
export function minColumnWidth(def: ColDef): number {
  const longestWord = Math.max(...def.label.split(/\s+/).map(word => word.length));
  const headingMinimum = longestWord * 8 + 54; // palavra inteira + drag + ordenação + respiro
  if (def.key === "seq") return 42;
  const controlMinimum = def.minWidth ?? (def.tipo === "date" ? 148
    : def.tipo === "number" ? 118
    : def.key === "categoria" || def.key === "contaId" ? 145
    : def.key === "fantasiaPadrao" ? 150
    : def.key === "descricao" ? 180
    : def.tipo === "select-api" ? 118
    : def.tipo === "select" ? 84 : 55);
  return Math.max(controlMinimum, headingMinimum);
}

// Config padrão (todas visíveis)
export const DEFAULT_COLUNAS_CONFIG: ColConfig[] = COLUNAS_DEF.map((c, i) => ({
  key:     c.key,
  visible: true,
  order:   i,
  width:   c.width,
}));

// Assinatura do padrão anterior. Só essa sequência (e a variante histórica) é migrada.
// Visibilidade e larguras ajustadas pelo usuário permanecem independentes da ordem.
const previousDefaultWidths: Record<string, number> = {
  seq: 45, dataLanc: 160, dataEmissao: 155, statusManual: 120,
  dataVencOriginal: 170, dataVencPlano: 180, fantasiaPadrao: 180,
  descricao: 250, dataEvento: 155, statusExtrato: 85, fornecedor: 140,
  banco: 140, valorPrevisto: 140, dataPagamento: 160, valor: 145,
  tipo: 85, categoria: 160, contaId: 165, statusAuto: 155,
  centroCusto: 110, dre: 100, cont: 80, vencA: 65, vencM: 55,
  vencD: 55, vencAM: 70, diasAtrasoOriginal: 80, diasAtrasoPlano: 80,
  rangeAtraso: 85, emissaoAM: 80, anotacao: 180,
};
const previousDefaultKeys = Object.keys(previousDefaultWidths);
const olderDefaultKeys = [...previousDefaultKeys];
olderDefaultKeys.splice(olderDefaultKeys.indexOf("tipo"), 1);
olderDefaultKeys.splice(olderDefaultKeys.indexOf("statusAuto") + 1, 0, "tipo");

const legacyKeys: Record<string, string> = {
  conta: "contaId",
  "Conta N5": "contaId",
  "Conta (n5)": "contaId",
  Categoria: "categoria",
  "Categoria N1": "categoria",
};

function reconcileColumnKeys(config: ColConfig[]): ColConfig[] {
  const known = new Set(COLUNAS_DEF.map(col => col.key));
  const direct = new Set(config.filter(col => col && known.has(col.key)).map(col => col.key));
  const ordered = [...config].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const seen = new Set<string>();
  const result: ColConfig[] = [];

  for (const col of ordered) {
    if (!col || typeof col.key !== "string") continue;
    const key = legacyKeys[col.key] ?? col.key;
    if (!known.has(key) || seen.has(key) || (col.key !== key && direct.has(key))) continue;
    result.push({ ...col, key });
    seen.add(key);
  }

  for (const [index, def] of COLUNAS_DEF.entries()) {
    if (seen.has(def.key)) continue;
    const preceding = COLUNAS_DEF.slice(0, index).reverse().find(col => seen.has(col.key));
    const following = COLUNAS_DEF.slice(index + 1).find(col => seen.has(col.key));
    const at = preceding ? result.findIndex(col => col.key === preceding.key) + 1
      : following ? result.findIndex(col => col.key === following.key) : result.length;
    result.splice(at, 0, { ...DEFAULT_COLUNAS_CONFIG[index] });
    seen.add(def.key);
  }

  return result.map((col, order) => {
    const def = COLUNAS_DEF.find(item => item.key === col.key)!;
    return { ...col, order, width: Math.max(minColumnWidth(def), col.width ?? def.width) };
  });
}

export function alignLegacyDefaultColumns(config: ColConfig[]): ColConfig[] {
  const complete = reconcileColumnKeys(Array.isArray(config) ? config : []);
  const ordered = [...complete].sort((a, b) => a.order - b.order);
  const previousDefault = ordered.length === previousDefaultKeys.length &&
    ordered.every((col, index) => col.key === previousDefaultKeys[index]);
  const olderDefault = ordered.length === olderDefaultKeys.length &&
    ordered.every((col, index) => col.key === olderDefaultKeys[index]);
  const currentDefault = ordered.length === COLUNAS_DEF.length &&
    ordered.every((col, index) => col.key === COLUNAS_DEF[index].key);
  if (!previousDefault && !olderDefault && !currentDefault) return complete;
  const nextOrder = new Map(COLUNAS_DEF.map((col, index) => [col.key, index]));
  return complete.map(col => ({ ...col,
    order: nextOrder.get(col.key) ?? col.order,
    width: currentDefault ? col.width : (() => {
      const def = COLUNAS_DEF.find(item => item.key === col.key)!;
      const previousWidth = previousDefaultWidths[col.key];
      const priorEffectiveWidth = Math.max(minColumnWidth(def), previousWidth);
      return col.width === priorEffectiveWidth || col.width === previousWidth
        ? Math.max(minColumnWidth(def), def.width) : col.width;
    })(),
  })).sort((a, b) => a.order - b.order);
}
