// Configuração das 32 colunas da tabela de lançamentos
import type { ColConfig } from "@/types";

export interface ColDef {
  key:       string;
  label:     string;
  width:     number;
  stickyLeft?:  boolean;
  stickyRight?: boolean;
  editavel?: boolean;
  tipo?:     "text" | "date" | "number" | "select" | "select-api";
  options?:  { value: string; label: string }[];
  source?:   string; // para select-api
  align?:    "left" | "right" | "center";
}

export const COLUNAS_DEF: ColDef[] = [
  { key: "seq",              label: "SEQ",           width: 55,  stickyLeft: true,  editavel: false, align: "center" },
  { key: "dataLanc",         label: "Data Lanç.",    width: 105, stickyLeft: true,  tipo: "date" },
  { key: "dataEmissao",      label: "Dt. Emissão",   width: 105, tipo: "date" },
  { key: "statusManual",     label: "Status Manual", width: 120, tipo: "select-api", source: "status-tipos" },
  { key: "dataVencOriginal", label: "Venc. Original",width: 110, tipo: "date" },
  { key: "dataVencPlano",    label: "Venc. Plano",   width: 110, tipo: "date" },
  { key: "fantasiaPadrao",   label: "Fantasia (n4)", width: 140, tipo: "select-api", source: "fornecedores" },
  { key: "descricao",        label: "Descrição",     width: 230, stickyLeft: true,  tipo: "text" },
  { key: "dataEvento",       label: "Dt. Evento",    width: 105, tipo: "date" },
  { key: "statusExtrato",    label: "Extrato",       width: 85,  tipo: "text" },
  { key: "fornecedor",       label: "Empresa",       width: 140, tipo: "text" },
  { key: "banco",            label: "Banco",         width: 110, tipo: "text" },
  { key: "valorPrevisto",    label: "Vl. Previsto",  width: 115, tipo: "number", align: "right" },
  { key: "dataPagamento",    label: "Dt. Pagamento", width: 110, tipo: "date" },
  { key: "valor",            label: "Vl. Realizado", width: 115, tipo: "number", align: "right" },
  { key: "categoria",        label: "Categoria",     width: 110, tipo: "text" },
  { key: "conta",            label: "Conta (n5)",    width: 110, tipo: "text" },
  { key: "statusAuto",       label: "Status Auto",   width: 100, editavel: false },
  { key: "tipo",             label: "Direção",       width: 85,  tipo: "select",
    options: [{ value: "ENTRADA", label: "ENTRADA" }, { value: "SAIDA", label: "SAÍDA" }] },
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
  { key: "acoes",            label: "Ações",         width: 75,  stickyRight: true, editavel: false, align: "center" },
];

// Config padrão (todas visíveis)
export const DEFAULT_COLUNAS_CONFIG: ColConfig[] = COLUNAS_DEF.map((c, i) => ({
  key:     c.key,
  visible: true,
  order:   i,
  width:   c.width,
}));
