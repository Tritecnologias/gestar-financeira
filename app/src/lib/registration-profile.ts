type ProfileMode = "create" | "update";

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

export function profileData(body: unknown, mode: ProfileMode) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("Dados do cadastro inválidos.");
  const input = body as Record<string, unknown>;
  const data: Record<string, string | null> = {};

  for (const field of ["codigo", "nome"] as const) {
    if (mode === "create" || Object.hasOwn(input, field)) {
      const value = input[field];
      if (typeof value !== "string" || !value.trim()) invalid("Código e nome são obrigatórios.");
      data[field] = field === "codigo" ? value.trim().toUpperCase() : value.trim();
    }
  }
  if (mode === "update" && !Object.hasOwn(data, "nome")) invalid("Nome é obrigatório.");

  for (const field of ["nomeFantasia", "documento", "email", "telefone", "endereco"] as const) {
    if (Object.hasOwn(input, field)) {
      const value = input[field];
      if (value !== null && typeof value !== "string") invalid(`Campo ${field} inválido.`);
      data[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    }
  }

  if (Object.hasOwn(input, "tipoPessoa")) {
    const value = input.tipoPessoa;
    if (value !== null && value !== "" && value !== "PF" && value !== "PJ") invalid("Tipo de pessoa deve ser PF ou PJ.");
    data.tipoPessoa = value === "PF" || value === "PJ" ? value : null;
  }

  if (Object.hasOwn(input, "contaPadraoId")) {
    const value = input.contaPadraoId;
    if (value !== null && typeof value !== "string") invalid("Conta padrão inválida.");
    data.contaPadraoId = typeof value === "string" && value.trim() ? value.trim() : null;
  }

  return data;
}

export async function validateDefaultAccount(db: any, tenantId: string, data: Record<string, string | null>) {
  if (!data.contaPadraoId) return;
  const account = await db.planoContas.findFirst({
    where: { id: data.contaPadraoId, tenantId, ativo: true },
    select: { id: true, categoria: { select: { tenantId: true, ativo: true } } },
  });
  if (!account || !account.categoria || !account.categoria.ativo || account.categoria.tenantId !== tenantId) {
    invalid("Conta padrão inexistente, inativa, sem Categoria ativa ou de outro tenant.");
  }
}

export const defaultAccountRelation = {
  contaPadrao: {
    select: {
      id: true, tenantId: true, codigo: true, descricao: true, ativo: true, categoriaId: true,
      categoria: { select: { id: true, tenantId: true, codigo: true, nome: true, ativo: true } },
    },
  },
};
