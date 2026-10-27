import { Prisma, type AuditAccessMode, type AuditResult } from "@prisma/client";
import type { UserSession } from "@/types";
import { accessRequestContext } from "@/lib/access-request-context";

type Writer = Pick<Prisma.TransactionClient, "auditEvent" | "platformAdmin">;
type SafeObject = Record<string, string | number | boolean | null | string[]>;

export type AuditInput = {
  tenantId?: string | null;
  actorIdentityId?: string | null;
  actorMembershipId?: string | null;
  platformAdminId?: string | null;
  advisoryGrantId?: string | null;
  supportGrantId?: string | null;
  accessMode: AuditAccessMode;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: AuditResult;
  reason?: string | null;
  metadata?: SafeObject;
  changes?: { before?: SafeObject; after?: SafeObject };
  requestId?: string | null;
};

// Only explicitly selected administrative fields belong in the trail. These
// checks are a second barrier against accidental credentials/PDFs in callers.
const forbidden = /^(password|senha|hash|token|secret|cookie|credential|credencial|pdf|file|storage|authorization|ipaddress|useragent)|(?:password|senha|secret|token|cookie|credential|pdf|hash)$/i;
function safeObject(value?: SafeObject): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  const result: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error(`Unsafe audit field: ${key}`);
    if (typeof item === "string") result[key] = item.slice(0, 200);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) result[key] = item;
    else if (Array.isArray(item) && item.every(part => typeof part === "string")) result[key] = item.slice(0, 30).map(part => part.slice(0, 100));
    else throw new Error(`Invalid audit field: ${key}`);
  }
  return result;
}

export async function writeAudit(tx: Writer, input: AuditInput) {
  const trace = accessRequestContext(input.tenantId);
  const before = safeObject(input.changes?.before);
  const after = safeObject(input.changes?.after);
  const platformAdminId = input.platformAdminId ??
    ((input.accessMode === "PLATFORM_ADMIN" || input.accessMode === "SUPPORT_GRANT") && input.actorIdentityId
      ? (await tx.platformAdmin.findUnique({ where: { identityId: input.actorIdentityId }, select: { id: true } }))?.id
      : null);
  return tx.auditEvent.create({ data: {
    tenantId: input.tenantId ?? null,
    actorIdentityId: input.actorIdentityId ?? null,
    actorMembershipId: input.actorMembershipId ?? null,
    platformAdminId: platformAdminId ?? null,
    advisoryGrantId: input.advisoryGrantId ?? null,
    supportGrantId: input.supportGrantId ?? null,
    accessMode: input.accessMode,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    result: input.result ?? "SUCCESS",
    reason: input.reason?.slice(0, 200) ?? null,
    metadata: safeObject(input.metadata),
    changes: before || after ? { before: before ?? {}, after: after ?? {} } : undefined,
    requestId: input.requestId?.slice(0, 100) ?? trace?.requestId ?? null,
  } });
}

export function auditContext(session: UserSession): Pick<AuditInput,
  "tenantId" | "actorIdentityId" | "actorMembershipId" | "supportGrantId" | "advisoryGrantId" | "accessMode"> {
  return {
    tenantId: session.tenantId,
    actorIdentityId: session.identityId ?? null,
    actorMembershipId: session.membershipId ?? null,
    advisoryGrantId: session.advisoryGrantId ?? null,
    supportGrantId: session.supportGrantId ?? null,
    accessMode: session.accessSource === "ADVISORY" ? "ADVISORY" : session.accessSource === "SUPPORT_GRANT" ? "SUPPORT_GRANT" : "MEMBERSHIP",
  };
}
