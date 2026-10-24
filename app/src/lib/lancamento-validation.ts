import { normalizeLancamento, invalid } from "./lancamento-input.mjs";
import { resolveAccountSelection, resolveCounterpartyLink } from "./lancamento-counterparty";

/** Validate changed controlled references only; never invent links for legacy text. */
export async function validateLancamentoLinks(db: any, tenantId: string, data: Record<string, any>, existing?: any) {
  Object.assign(data, await resolveCounterpartyLink(db, tenantId, data, existing));
  for (const [field, model] of [["categoria", "categoria"], ["centroCusto", "centroCusto"], ["statusManual", "statusManualTipo"]]) {
    if (data[field] && data[field] !== existing?.[field]) {
      const item = await db[model].findFirst({ where: { tenantId, codigo: data[field], ativo: true }, select: { id: true } });
      if (!item) invalid(`${field}: código inexistente ou inativo neste tenant.`, 422);
    }
  }
  const changed = ["contaId", "categoria", "tipo"].some(key => Object.hasOwn(data, key) && data[key] !== existing?.[key]);
  if (changed || !existing) {
    const accountId = Object.hasOwn(data, "contaId") ? data.contaId : existing?.contaId;
    if (accountId && Object.hasOwn(data, "categoria") && !data.categoria) invalid("Conta N2 exige Categoria N1.", 422);
    Object.assign(data, await resolveAccountSelection(db, tenantId, accountId ?? null, undefined,
      data.tipo ?? existing?.tipo, data.categoria ?? (Object.hasOwn(data, "contaId") ? undefined : existing?.categoria)));
  }
  return data;
}

export async function prepareLancamento(db: any, tenantId: string, input: unknown, existing?: any) {
  return validateLancamentoLinks(db, tenantId, normalizeLancamento(input, !existing), existing);
}

export function lancamentoError(error: any) {
  const conflict = error?.code === "P2034";
  return { status: error?.status || (conflict ? 409 : error instanceof SyntaxError ? 400 : 500),
    error: error?.status ? error.message : conflict ? "Conflito de edição simultânea. Recarregue a base e tente novamente."
      : error instanceof SyntaxError ? "Envie um JSON válido." : "Não foi possível concluir a operação. Nenhuma alteração foi gravada." };
}
