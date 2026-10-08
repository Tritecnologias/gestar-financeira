export type RegistrationKind = "cliente" | "fornecedor";

const prefix = { cliente: "C", fornecedor: "F" } as const;
const order: RegistrationKind[] = ["cliente", "fornecedor"];

/** The transaction lock is shared by manual creation and the Excel import. */
export async function lockRegistrationCodes(tx: any, tenantId: string, kinds: RegistrationKind[]) {
  for (const kind of order.filter(value => kinds.includes(value))) {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`registration-code:${tenantId}:${kind}`}, 0))`;
  }
}

/** Call only after acquiring the matching transaction lock. Includes inactive rows. */
export async function registrationCodeAllocator(tx: any, tenantId: string, kind: RegistrationKind) {
  const codes = await tx[kind].findMany({ where: { tenantId }, select: { codigo: true } }) as { codigo: string }[];
  const pattern = new RegExp(`^${prefix[kind]}([0-9]+)$`, "i");
  let current = BigInt(0);
  for (const { codigo } of codes) {
    const match = pattern.exec(codigo);
    if (match) {
      const number = BigInt(match[1]);
      if (number > current) current = number;
    }
  }
  return () => {
    current += BigInt(1);
    const codigo = `${prefix[kind]}${current.toString().padStart(4, "0")}`;
    if (codigo.length > 20) throw Object.assign(new Error("A sequência de códigos atingiu o limite do cadastro."), { status: 409 });
    return codigo;
  };
}

export async function registrationTransaction<T>(db: any, tenantId: string, kinds: RegistrationKind[], work: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx: any) => {
        await lockRegistrationCodes(tx, tenantId, kinds);
        return work(tx);
      }, { isolationLevel: "Serializable", maxWait: 60_000, timeout: 60_000 });
    } catch (error: any) {
      if (attempt < 2 && (error?.code === "P2034" || error?.code === "P2002")) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível reservar um código.");
}
