export type CounterpartyType = "CLIENTE" | "FORNECEDOR";

export type CounterpartyOption = {
  id: string;
  tipo: CounterpartyType;
  codigo: string;
  nome: string;
  nomeFantasia: string | null;
  tenantId: string;
  contaPadraoId: string | null;
  contaPadrao: {
    id: string;
    tenantId: string;
    codigo: string | null;
    ativo: boolean;
    categoriaId: string | null;
    categoria: { id: string; tenantId: string; codigo: string; ativo: boolean } | null;
  } | null;
};

export function counterpartyName(item: Pick<CounterpartyOption, "nome" | "nomeFantasia">) {
  return item.nomeFantasia?.trim() || item.nome;
}

export function counterpartyDisplay(item: Pick<CounterpartyOption, "codigo" | "nome" | "nomeFantasia">) {
  return `${item.codigo} – ${counterpartyName(item)}`;
}

export function counterpartyOptionLabel(item: CounterpartyOption) {
  return `${item.codigo} | ${counterpartyName(item)} | ${item.tipo === "CLIENTE" ? "Cliente" : "Fornecedor"}`;
}

export function activeCounterparties(clientes: any[], fornecedores: any[]): CounterpartyOption[] {
  return [
    ...clientes.filter(item => item.ativo).map(item => ({ ...item, tipo: "CLIENTE" as const })),
    ...fornecedores.filter(item => item.ativo).map(item => ({ ...item, tipo: "FORNECEDOR" as const })),
  ].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

export function defaultAccount(item: CounterpartyOption | null) {
  const account = item?.contaPadrao;
  if (!item || !account || !account.ativo || account.tenantId !== item.tenantId || !account.codigo ||
    !account.categoria || !account.categoria.ativo || account.categoria.tenantId !== item.tenantId ||
    account.categoriaId !== account.categoria.id) return null;
  return { contaId: account.id, categoria: account.categoria.codigo, codigoConta: account.codigo };
}

export function counterpartyIds(item: CounterpartyOption | null) {
  return {
    clienteId: item?.tipo === "CLIENTE" ? item.id : null,
    fornecedorId: item?.tipo === "FORNECEDOR" ? item.id : null,
  };
}
