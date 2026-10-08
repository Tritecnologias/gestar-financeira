/** Only new N1 codes are constrained; existing legacy codes stay untouched. */
export function validNewCategoryCode(code: string) {
  return /^\d{2}$/.test(code);
}

/** A one-digit legacy N1 keeps its stored code, but new N2 codes use two digits. */
export function accountCategoryPrefix(categoryCode: string) {
  return /^\d$/.test(categoryCode) ? categoryCode.padStart(2, "0") : categoryCode;
}

export function accountCodeBelongsToCategory(code: string, categoryCode: string) {
  const prefixes = new Set([categoryCode, accountCategoryPrefix(categoryCode)]);
  return [...prefixes].some(prefix => code.startsWith(`${prefix}.`) && /^\d+$/.test(code.slice(prefix.length + 1)));
}

export function nextAccountCode(categoryCode: string, codes: (string | null)[]) {
  let highest = BigInt(0);
  const prefix = `${accountCategoryPrefix(categoryCode)}.`;
  for (const code of codes) {
    if (code && accountCodeBelongsToCategory(code, categoryCode)) {
      const value = BigInt(code.slice(code.lastIndexOf(".") + 1));
      if (value > highest) highest = value;
    }
  }
  return `${prefix}${(highest + BigInt(1)).toString().padStart(2, "0")}`;
}

export function validNewAccountCode(code: string, categoryCode: string) {
  const prefix = `${accountCategoryPrefix(categoryCode)}.`;
  return code.startsWith(prefix) && /^\d{2,}$/.test(code.slice(prefix.length)) && BigInt(code.slice(prefix.length)) > BigInt(0);
}

/** Shared by manual creation and XLSX confirmation. The key includes tenant. */
export async function financialCodeTransaction<T>(db: any, tenantId: string, work: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`financial-codes:${tenantId}`}, 0))`;
        return work(tx);
      }, { isolationLevel: "ReadCommitted", maxWait: 60_000, timeout: 60_000 });
    } catch (error: any) {
      if (attempt < 2 && (error?.code === "P2034" || error?.code === "P2002")) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível reservar um código financeiro.");
}

export async function reserveAccountCode(tx: any, category: { id: string; codigo: string }) {
  const prefix = `${accountCategoryPrefix(category.codigo)}.`;
  const rows = await tx.planoContas.findMany({
    where: { OR: [{ categoriaId: category.id }, { codigo: { startsWith: prefix } }] },
    select: { codigo: true },
  }) as { codigo: string | null }[];
  return nextAccountCode(category.codigo, rows.map(row => row.codigo));
}
