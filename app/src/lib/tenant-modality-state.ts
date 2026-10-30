import type { Prisma } from "@prisma/client";

export type TenantModality = "PF" | "PJ";
export type ModalityReader = Pick<Prisma.TransactionClient, "tenant">;
export function validTenantModality(value: unknown): value is TenantModality {
  return value === "PF" || value === "PJ";
}
export function tenantModalityErrorStatus(error: unknown) {
  const e = error as { status?: number; code?: string; meta?: {
    code?: string; driverAdapterError?: { cause?: { originalCode?: string } };
  } };
  if (e?.status) return e.status;
  if (error instanceof SyntaxError) return 400;
  // SELECT ... FOR SHARE in the live OWNER check can surface serialization
  // through a raw-query error. It is the same retryable conflict as P2034.
  const sqlState = e?.meta?.code ?? e?.meta?.driverAdapterError?.cause?.originalCode;
  if (e?.code === "P2034" || e?.code === "P2010" && ["40001", "40P01"].includes(sqlState ?? "")) return 409;
  return 500;
}
export function modalityPending(row: { modalidade: string | null; escolhaModalidadePendente: boolean }) {
  if (row.modalidade !== null && !validTenantModality(row.modalidade) || row.escolhaModalidadePendente && row.modalidade !== null) {
    throw Object.assign(new Error("Modalidade da empresa inconsistente. Solicite revisão à administração."), { status: 409 });
  }
  return row.escolhaModalidadePendente;
}
export async function tenantModalityState(db: ModalityReader, tenantId: string) {
  const row = await db.tenant.findUnique({ where: { id: tenantId },
    select: { id: true, nome: true, ativo: true, modalidade: true, escolhaModalidadePendente: true } });
  if (!row?.ativo) throw Object.assign(new Error("Empresa indisponível."), { status: 403 });
  return { tenantId: row.id, tenantName: row.nome, modalidade: row.modalidade as TenantModality | null, pending: modalityPending(row) };
}
export async function requireTenantModalityReady(db: ModalityReader, tenantId: string) {
  if ((await tenantModalityState(db, tenantId)).pending) {
    throw Object.assign(new Error("O Proprietário precisa definir a modalidade deste espaço antes de continuar."), { status: 428 });
  }
}
