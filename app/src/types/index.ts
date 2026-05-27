// ── Tipos compartilhados da aplicação ────────────────────────

export type TipoLancamento  = "ENTRADA" | "SAIDA";
export type StatusLancamento = "realizado" | "previsto" | "cancelado";
export type StatusAuto      = "PAGO" | "ATRASADO" | "A VENCER" | "PREVISTO";
export type TipoConta       = "RECEITA" | "DESPESA" | "TRANSFERENCIA";
export type Papel           = "admin_global" | "admin" | "membro";
export type Plano           = "trial" | "mensal" | "anual";

// ── Lançamento (forma completa serializada para o frontend) ───
export interface LancamentoDTO {
  id:       string;
  seq:      number;         // imutável, gerado pelo banco
  tenantId: string;

  // Datas
  dataLanc:          string;        // YYYY-MM-DD obrigatório
  dataEmissao:       string | null;
  dataVencOriginal:  string | null;
  dataVencPlano:     string | null;
  dataEvento:        string | null;
  dataPagamento:     string | null;

  // Financeiro
  valor:         number;
  valorPrevisto: number | null;
  banco:         string | null;

  // Classificação
  tipo:          TipoLancamento;
  status:        StatusLancamento;
  statusManual:  string | null;   // ex: PAGO, PENDENTE
  statusExtrato: string | null;   // ex: A
  statusAuto:    StatusAuto;      // calculado

  // Campos de texto
  descricao:      string;
  fornecedor:     string | null;
  fornecedorId:   string | null;
  fantasiaPadrao: string | null;  // display: "codigo – nome"
  centroCusto:    string | null;
  referencia:     string | null;
  contaId:        string | null;
  categoria:      string | null;
  dre:            string | null;
  cont:           string | null;
  anotacao:       string | null;

  // Calculados (derivados no servidor)
  diasAtrasoOriginal: number;
  diasAtrasoPlano:    number;
  rangeAtraso:        string;      // ex: "01-30 dias"
  vencA:  number | null;           // ano do vencimento plano
  vencM:  number | null;           // mês
  vencD:  number | null;           // dia
  vencAM: string | null;           // ex: "26_01"
  emissaoAM: string | null;        // ex: "25_11"

  criadoEm: string;
}

// ── Filtros de lançamentos ────────────────────────────────────
export interface LancamentoFiltros {
  tipo?:        TipoLancamento | "";
  status?:      StatusLancamento | "";
  centroCusto?: string;
  fornecedor?:  string;
  busca?:       string;
  dataInicio?:  string;
  dataFim?:     string;
  pagina?:      number;
  porPagina?:   number;
}

// ── KPIs do dashboard / lançamentos ──────────────────────────
export interface KpiData {
  entradas: number;
  saidas:   number;
  saldo:    number;
  totalLancamentos: number;
}

// ── Fornecedor ────────────────────────────────────────────────
export interface FornecedorDTO {
  id:       string;
  codigo:   string;
  nome:     string;
  display:  string;    // "codigo – nome"
  ativo:    boolean;
}

// ── Status Manual Tipo ─────────────────────────────────────────
export interface StatusManualTipoDTO {
  id:     string;
  codigo: string;
  nome:   string;
  cor:    string | null;
  ordem:  number;
}

// ── Layout de Colunas ─────────────────────────────────────────
export interface ColConfig {
  key:     string;
  visible: boolean;
  order:   number;
  width?:  number;
}

export interface LayoutColunasDTO {
  id:        string;
  nome:      string;
  colunas:   ColConfig[];
  isDefault: boolean;
  criadoEm:  string;
}

// ── Tenant ────────────────────────────────────────────────────
export interface TenantDTO {
  id:     string;
  nome:   string;
  slug:   string;
  email:  string;
  plano:  Plano;
  ativo:  boolean;
}

// ── Plano de Contas ───────────────────────────────────────────
export interface PlanoContasDTO {
  id:        string;
  codigo:    string | null;
  descricao: string;
  tipo:      TipoConta;
  paiId:     string | null;
  ativo:     boolean;
}

// ── Session do usuário logado ─────────────────────────────────
export interface UserSession {
  id:         string;
  nome:       string;
  email:      string;
  papel:      Papel;
  tenantId:   string;
  tenantNome: string;
}

// ── Resposta paginada genérica ────────────────────────────────
export interface PaginatedResponse<T> {
  data:         T[];
  total:        number;
  pagina:       number;
  porPagina:    number;
  totalPaginas: number;
}

// ── Resposta de erro da API ───────────────────────────────────
export interface ApiError {
  error:    string;
  details?: string;
}
