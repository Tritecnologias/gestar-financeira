export const PRODUCT_GROUPS = ["PRODUTO", "SERVICO"] as const;

export function productError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function productGroup(value: unknown) {
  if (value !== "PRODUTO" && value !== "SERVICO") throw productError("Selecione Produto ou Serviço.");
  return value;
}

export function productText(value: unknown, label: string, required = false, max = 200) {
  if (value == null || value === "") {
    if (required) throw productError(`${label} é obrigatório.`);
    return null;
  }
  if (typeof value !== "string") throw productError(`${label} inválido.`);
  const text = value.trim();
  if (required && !text) throw productError(`${label} é obrigatório.`);
  if (text.length > max) throw productError(`${label} deve ter até ${max} caracteres.`);
  return text || null;
}

export function productPrice(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") throw productError(`${label} inválido.`);
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(text)) throw productError(`${label} deve ser um valor não negativo com até duas casas decimais.`);
  return text;
}

export async function validateProductClassification(db: any, tenantId: string, group: string, typeId: string, lineId: string | null) {
  const type = await db.produtoTipo.findFirst({ where: { id: typeId, tenantId, ativo: true } });
  if (!type || type.grupo !== group) throw productError("Tipo inexistente, inativo ou incompatível com o Grupo.");
  if (lineId) {
    const line = await db.produtoLinha.findFirst({ where: { id: lineId, tenantId, ativo: true } });
    if (!line || line.tipoId !== typeId) throw productError("Linha inexistente, inativa ou incompatível com o Tipo.");
  }
}

/** Serializa a reserva do código dentro do tenant e inclui códigos inativos. */
export async function productTransaction<T>(db: any, tenantId: string, work: (tx: any) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`product-catalog:${tenantId}`}, 0))`;
        return work(tx);
      }, { isolationLevel: "ReadCommitted", maxWait: 60_000, timeout: 60_000 });
    } catch (error: any) {
      if (attempt < 2 && (error?.code === "P2034" || error?.code === "P2002")) continue;
      throw error;
    }
  }
  throw productError("Não foi possível reservar o próximo código.", 409);
}

export async function nextProductCode(tx: any, tenantId: string) {
  const rows = await tx.produto.findMany({ where: { tenantId }, select: { codigo: true } }) as { codigo: string }[];
  let max = BigInt(0);
  for (const row of rows) {
    const match = /^I(\d+)$/i.exec(row.codigo);
    if (match) {
      const number = BigInt(match[1]);
      if (number > max) max = number;
    }
  }
  const code = `I${(max + BigInt(1)).toString().padStart(4, "0")}`;
  if (code.length > 30) throw productError("A sequência de códigos atingiu o limite do cadastro.", 409);
  return code;
}

export function productApiError(error: any, fallback: string) {
  if (error?.status) return { message: error.message, status: error.status as number };
  if (error?.code === "P2002") return { message: "Código já cadastrado neste escopo.", status: 409 };
  if (error?.code === "P2025") return { message: "Registro não encontrado neste tenant.", status: 404 };
  if (error?.code === "P2003") return { message: "Classificação inválida para este tenant.", status: 400 };
  if (error?.code === "P2034") return { message: "Conflito ao gravar. Tente novamente.", status: 409 };
  return { message: fallback, status: 500 };
}
