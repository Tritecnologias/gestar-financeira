export interface FinancialCategory {
  id: string;
  codigo: string;
  nome: string;
  tipo?: string | null;
}

export interface FinancialAccount {
  id: string;
  codigo: string | null;
  descricao: string;
  tipo: string;
  categoriaId: string | null;
}

export interface FinancialTreeFilters {
  busca: string;
  categoriaId: string;
  tipo: string;
}

const codeCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "variant" });

function compareCodes(first: string | null, second: string | null) {
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return codeCollator.compare(first, second) || (first < second ? -1 : first > second ? 1 : 0);
}

function compareAccountCodes(first: string | null, second: string | null) {
  const firstSuffix = first?.match(/\.(\d+)$/)?.[1];
  const secondSuffix = second?.match(/\.(\d+)$/)?.[1];
  if (firstSuffix && secondSuffix) {
    const a = BigInt(firstSuffix), b = BigInt(secondSuffix);
    if (a !== b) return a < b ? -1 : 1;
  }
  return compareCodes(first, second);
}

export function buildFinancialTree(categories: FinancialCategory[], accounts: FinancialAccount[], filters: FinancialTreeFilters) {
  const term = filters.busca.trim().toLocaleLowerCase("pt-BR");
  const matches = (values: (string | null | undefined)[]) =>
    !term || values.some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
  const sortedCategories = [...categories].sort((a, b) => compareCodes(a.codigo, b.codigo) || a.id.localeCompare(b.id));
  const sortedAccounts = [...accounts].sort((a, b) => compareCodes(a.codigo, b.codigo) || a.id.localeCompare(b.id));
  const accountsByCategory = new Map<string, FinancialAccount[]>();
  for (const account of sortedAccounts) {
    if (!account.categoriaId) continue;
    const group = accountsByCategory.get(account.categoriaId) || [];
    group.push(account);
    accountsByCategory.set(account.categoriaId, group);
  }
  for (const group of accountsByCategory.values()) group.sort((a, b) => compareAccountCodes(a.codigo, b.codigo) || a.id.localeCompare(b.id));
  const grouped = sortedCategories.flatMap(cat => {
    if (filters.categoriaId && cat.id !== filters.categoriaId) return [];
    const allChildren = accountsByCategory.get(cat.id) || [];
    const parentMatch = matches([cat.codigo, cat.nome]);
    const children = allChildren.filter(account =>
      (!filters.tipo || account.tipo === filters.tipo) &&
      (parentMatch || matches([account.codigo, account.descricao, account.tipo])));
    const visible = (!term || parentMatch || children.length > 0) && (!filters.tipo || children.length > 0);
    return visible ? [{ cat, children, totalChildren: allChildren.length }] : [];
  });
  const categoryIds = new Set(categories.map(cat => cat.id));
  const orphanAccounts = sortedAccounts.filter(account => !account.categoriaId || !categoryIds.has(account.categoriaId));
  const visibleOrphans = filters.categoriaId ? [] : orphanAccounts.filter(account =>
    (!filters.tipo || account.tipo === filters.tipo) && matches([account.codigo, account.descricao, account.tipo]));
  const matchingAccounts = grouped.reduce((total, group) => total + group.children.length, 0) + visibleOrphans.length;
  return { sortedCategories, grouped, orphanAccounts, visibleOrphans, matchingAccounts, resultCount: grouped.length + matchingAccounts };
}
