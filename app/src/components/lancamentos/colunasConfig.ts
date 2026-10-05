// Configuração das colunas de dados da tabela de lançamentos
import type { ColConfig } from "@/types";

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

export const COLUNAS_DEF: ColDef[] = [
  { key: "seq",              label: "#",             width: 45,  editavel: false, align: "center" },
  { key: "dataLanc",         label: "Data Lançamento", width: 160, tipo: "date" },
  { key: "dataEmissao",      label: "Data Emissão", width: 155, tipo: "date" },
  { key: "statusManual",     label: "Status Manual", width: 120, tipo: "select-api", source: "status-tipos" },
  { key: "dataVencOriginal", label: "Vencimento Original", width: 170, tipo: "date" },
  { key: "dataVencPlano",    label: "Vencimento Planejado", width: 180, tipo: "date" },
  { key: "fantasiaPadrao",   label: "Fantasia", width: 180, tipo: "select-api", source: "fornecedores" },
  { key: "descricao",        label: "Descrição Objetiva", width: 250, tipo: "text" },
  { key: "dataEvento",       label: "Data Evento", width: 155, tipo: "date" },
  { key: "statusExtrato",    label: "Extrato",       width: 85,  tipo: "text" },
  { key: "fornecedor",       label: "Empresa",       width: 140, tipo: "text" },
  { key: "banco",            label: "Banco",         width: 110, tipo: "text" },
  { key: "valorPrevisto",    label: "Valor Previsto", width: 140, tipo: "number", align: "right" },
  { key: "dataPagamento",    label: "Data Pagamento", width: 160, tipo: "date" },
  { key: "valor",            label: "Valor Realizado", width: 145, tipo: "number", align: "right" },
  { key: "tipo",             label: "Direção",       width: 85,  tipo: "select",
    options: [{ value: "ENTRADA", label: "ENTRADA" }, { value: "SAIDA", label: "SAÍDA" }] },
  { key: "categoria",        label: "Categoria N1",  width: 160, tipo: "select-api", source: "categorias" },
  { key: "contaId",          label: "Conta N2",      width: 165, tipo: "select-api", source: "plano-contas" },
  { key: "statusAuto",       label: "Status Automático", width: 155, editavel: false },
  { key: "centroCusto",      label: "C. Custo",      width: 110, tipo: "text" },
  { key: "dre",              label: "DRE",           width: 100, tipo: "text" },
  { key: "cont",             label: "Cont.",         width: 80,  tipo: "text" },
  { key: "vencA",            label: "Venc A",        width: 65,  editavel: false, align: "center" },
  { key: "vencM",            label: "Venc M",        width: 55,  editavel: false, align: "center" },
  { key: "vencD",            label: "Venc D",        width: 55,  editavel: false, align: "center" },
  { key: "vencAM",           label: "Venc A_M",      width: 70,  editavel: false, align: "center" },
  { key: "diasAtrasoOriginal",label: "Atr. Orig.",   width: 80,  editavel: false, align: "right" },
  { key: "diasAtrasoPlano",  label: "Atr. Plano",    width: 80,  editavel: false, align: "right" },
  { key: "rangeAtraso",      label: "Range",         width: 85,  editavel: false },
  { key: "emissaoAM",        label: "Emissão A_M",   width: 80,  editavel: false, align: "center" },
  { key: "anotacao",         label: "Anotação",      width: 180, tipo: "text" },
];

// Largura mínima que mantém os controles da edição inline utilizáveis.
export function minColumnWidth(def: ColDef): number {
  if (def.minWidth) return def.minWidth;
  if (def.key === "seq") return 42;
  if (def.tipo === "date") return 148;
  if (def.tipo === "number") return 118;
  if (def.key === "categoria" || def.key === "contaId") return 145;
  if (def.key === "fantasiaPadrao") return 150;
  if (def.key === "descricao") return 180;
  if (def.tipo === "select-api") return 118;
  if (def.tipo === "select") return 84;
  return 55;
}

// Config padrão (todas visíveis)
export const DEFAULT_COLUNAS_CONFIG: ColConfig[] = COLUNAS_DEF.map((c, i) => ({
  key:     c.key,
  visible: true,
  order:   i,
  width:   c.width,
}));

// Atualiza somente a antiga ordem padrão; layouts personalizados mantêm sua ordem e larguras.
const legacyDefaultKeys = COLUNAS_DEF.map(col => col.key);
legacyDefaultKeys.splice(legacyDefaultKeys.indexOf("tipo"), 1);
legacyDefaultKeys.splice(legacyDefaultKeys.indexOf("statusAuto") + 1, 0, "tipo");

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
  const originalDefault = ordered.length === legacyDefaultKeys.length &&
    ordered.every((col, index) => col.key === legacyDefaultKeys[index]);
  const currentDefault = ordered.length === COLUNAS_DEF.length &&
    ordered.every((col, index) => col.key === COLUNAS_DEF[index].key);
  if (!originalDefault && !currentDefault) return complete;
  const nextOrder = new Map(COLUNAS_DEF.map((col, index) => [col.key, index]));
  return complete.map(col => ({ ...col,
    order: nextOrder.get(col.key) ?? col.order,
    width: col.key === "statusAuto" && col.width === 100 ? 145 : col.width,
  }));
}
