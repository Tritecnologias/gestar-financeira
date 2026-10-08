export function productError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
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

export async function validateProductClassification(db: any, tenantId: string, groupId: string, typeId: string, lineId: string | null) {
  const group = await db.produtoGrupo.findFirst({ where: { id: groupId, tenantId, ativo: true } });
  if (!group) throw productError("Grupo inexistente, inativo ou de outro tenant.");
  const type = await db.produtoTipo.findFirst({ where: { id: typeId, tenantId, ativo: true } });
  if (!type || type.grupoId !== groupId) throw productError("Tipo inexistente, inativo ou incompatível com o Grupo.");
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
  return reserveProductCode(tx, tenantId, "item");
}

/** Deve ser chamado dentro de productTransaction: o lock por tenant serializa a reserva. */
export async function reserveProductCode(tx: any, tenantId: string, kind: "grupo" | "tipo" | "linha" | "item", parent?: { id: string; codigo: string }) {
  if ((kind === "tipo" || kind === "linha") && !parent) throw productError("Classificação pai obrigatória.");
  const escopo = parent ? `${kind}:${parent.id}` : kind;
  const saved = await tx.produtoSequencia.findFirst({ where: { tenantId, escopo } });
  let ultimo = saved?.ultimoNumero ?? BigInt(0);
  if (!saved) {
    const rows = kind === "grupo"
      ? await tx.produtoGrupo.findMany({ where: { tenantId }, select: { codigo: true } })
      : kind === "tipo"
        ? await tx.produtoTipo.findMany({ where: { tenantId, grupoId: parent!.id }, select: { codigo: true } })
        : kind === "linha"
          ? await tx.produtoLinha.findMany({ where: { tenantId, tipoId: parent!.id }, select: { codigo: true } })
          : await tx.produto.findMany({ where: { tenantId }, select: { codigo: true } });
    const prefix = kind === "item" ? "I" : parent ? `${parent.codigo}.` : "";
    for (const row of rows as { codigo: string }[]) {
      if (!row.codigo.startsWith(prefix)) continue;
      const segment = row.codigo.slice(prefix.length);
      if (!/^\d+$/.test(segment)) continue;
      const number = BigInt(segment);
      if (number > ultimo) ultimo = number;
    }
  }
  const next = ultimo + BigInt(1);
  const code = kind === "item" ? `I${next.toString().padStart(4, "0")}` : `${parent ? `${parent.codigo}.` : ""}${next.toString().padStart(2, "0")}`;
  if (code.length > 30) throw productError("A sequência de códigos atingiu o limite do cadastro.", 409);
  if (saved) await tx.produtoSequencia.update({ where: { id: saved.id }, data: { ultimoNumero: next } });
  else await tx.produtoSequencia.create({ data: { escopo, ultimoNumero: next } });
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
