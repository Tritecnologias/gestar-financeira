export type DescriptionCandidate = { codigo: string; descricao: string; codigoCategoria?: string };

function descriptionKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, "").replace(/\s+/g, "");
}

function variants(key: string) {
  const result = new Set([key]);
  if (key.length >= 6 && key.length <= 80) {
    for (let index = 0; index < key.length; index++) result.add(key.slice(0, index) + key.slice(index + 1));
  }
  return result;
}

function near(first: string, second: string) {
  if (first === second) return true;
  if (Math.abs(first.length - second.length) > 1) return false;
  if (first.length === second.length) {
    const differences: number[] = [];
    for (let index = 0; index < first.length; index++) if (first[index] !== second[index]) differences.push(index);
    return differences.length === 1 || differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      first[differences[0]] === second[differences[1]] && first[differences[1]] === second[differences[0]];
  }
  const shorter = first.length < second.length ? first : second;
  const longer = first.length < second.length ? second : first;
  let index = 0, extra = 0;
  while (index < shorter.length && shorter[index] === longer[index + extra]) index++;
  if (index === shorter.length) return true;
  extra++;
  while (index < shorter.length && shorter[index] === longer[index + extra]) index++;
  return index === shorter.length;
}

export function createDescriptionLookup(candidates: DescriptionCandidate[]) {
  const index = new Map<string, DescriptionCandidate[]>();
  for (const candidate of candidates) {
    const key = descriptionKey(candidate.descricao);
    if (!key) continue;
    for (const variant of variants(key)) {
      const bucket = index.get(variant) || [];
      bucket.push(candidate);
      index.set(variant, bucket);
    }
  }
  return (row: DescriptionCandidate) => {
    const key = descriptionKey(row.descricao);
    if (!key) return [];
    const found = new Map<string, DescriptionCandidate>();
    for (const variant of variants(key)) {
      for (const candidate of index.get(variant) || []) {
        if (candidate.codigo !== row.codigo && !found.has(candidate.codigo) && near(key, descriptionKey(candidate.descricao))) found.set(candidate.codigo, candidate);
      }
    }
    return [...found.values()].slice(0, 2);
  };
}

export function categoryCandidatesFromCode(accountCode: string, categoriesByCode: Map<string, { codigo: string; nome: string; ativo: boolean }>) {
  const matches = [];
  for (let index = accountCode.indexOf("."); index > 0; index = accountCode.indexOf(".", index + 1)) {
    const category = categoriesByCode.get(accountCode.slice(0, index));
    if (category?.ativo) matches.push(category);
  }
  return matches;
}
