import { counterpartyDisplay } from "./counterparty";

type LinkInput = { clienteId?: unknown; fornecedorId?: unknown };
type ExistingLink = { clienteId: string | null; fornecedorId: string | null };

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

/** Validate only explicit controlled links; textual legacy imports remain textual. */
export async function resolveCounterpartyLink(db: any, tenantId: string, input: LinkInput, existing?: ExistingLink) {
  const hasClient = Object.hasOwn(input, "clienteId") && input.clienteId !== undefined;
  const hasSupplier = Object.hasOwn(input, "fornecedorId") && input.fornecedorId !== undefined;
  if (!hasClient && !hasSupplier) return {};
  const normalize = (value: unknown, label: string) => {
    if (value === null || value === "") return null;
    if (typeof value !== "string" || !value.trim()) badRequest(`${label} inválido.`);
    return value;
  };
  let clienteId = hasClient ? normalize(input.clienteId, "Cliente") : existing?.clienteId ?? null;
  let fornecedorId = hasSupplier ? normalize(input.fornecedorId, "Fornecedor") : existing?.fornecedorId ?? null;
  if (clienteId && fornecedorId) {
    if (hasClient && hasSupplier) badRequest("Selecione Cliente ou Fornecedor, nunca os dois.");
    if (hasClient) fornecedorId = null;
    else clienteId = null;
  }
  if (clienteId) {
    const item = await db.cliente.findFirst({ where: { id: clienteId, tenantId, ativo: true }, select: { codigo: true, nome: true, nomeFantasia: true } });
    if (!item) badRequest("Cliente inexistente, inativo ou de outro tenant.");
    return { clienteId, fornecedorId: null, fantasiaPadrao: counterpartyDisplay(item) };
  }
  if (fornecedorId) {
    const item = await db.fornecedor.findFirst({ where: { id: fornecedorId, tenantId, ativo: true }, select: { codigo: true, nome: true, nomeFantasia: true } });
    if (!item) badRequest("Fornecedor inexistente, inativo ou de outro tenant.");
    return { clienteId: null, fornecedorId, fantasiaPadrao: counterpartyDisplay(item) };
  }
  return existing?.clienteId || existing?.fornecedorId
    ? { clienteId: null, fornecedorId: null, fantasiaPadrao: null }
    : {};
}

export const counterpartInclude = {
  clienteRef: { select: { codigo: true, nome: true, nomeFantasia: true } },
  fornecedorRef: { select: { codigo: true, nome: true, nomeFantasia: true } },
};

/** A selected Conta N2 must still be active under an active Categoria N1 in this tenant. */
export async function resolveAccountSelection(db: any, tenantId: string, value: unknown, existingId?: string | null) {
  if (value === undefined) return {};
  if (value === null || value === "") return { contaId: null };
  if (typeof value !== "string" || !value.trim()) badRequest("Conta N2 inválida.");
  if (value === existingId) return {};
  const account = await db.planoContas.findFirst({ where: { id: value, tenantId, ativo: true },
    select: { id: true, categoria: { select: { tenantId: true, codigo: true, ativo: true } } } });
  if (!account || !account.categoria || !account.categoria.ativo || account.categoria.tenantId !== tenantId) {
    badRequest("Conta N2 inexistente, inativa, sem Categoria ativa ou de outro tenant.");
  }
  return { contaId: account.id, categoria: account.categoria.codigo };
}
