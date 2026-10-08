import { prisma } from "@/lib/db";
import { supportStatus } from "@/lib/support-policy";
import { writeAudit } from "@/lib/audit";

/** Expiration is enforced by time, not by a scheduled task. This write only records it. */
export async function expireSupportGrant(id: string, tenantId: string, expiresAt: Date | null) {
  if (!expiresAt || expiresAt > new Date()) return false;
  await prisma.$transaction(async tx => {
    const changed = await tx.supportGrant.updateMany({
      where: { id, tenantId, status: "ACTIVE", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (changed.count) await tx.supportGrantEvent.create({
      data: { grantId: id, tenantId, type: "EXPIRED", detail: "Prazo do acesso encerrado." },
    });
    if (changed.count) await writeAudit(tx, { tenantId, accessMode: "SYSTEM", action: "SUPPORT_EXPIRED",
      resourceType: "SupportGrant", resourceId: id, supportGrantId: id,
      changes: { before: { status: "ACTIVE" }, after: { status: "EXPIRED" } } });
  });
  return true;
}

export async function expireListedSupportGrants(grants: { id: string; tenantId: string; status: string; expiresAt: Date | null }[]) {
  await Promise.all(grants.filter(g => supportStatus(g.status, g.expiresAt) === "EXPIRED" && g.status === "ACTIVE")
    .map(g => expireSupportGrant(g.id, g.tenantId, g.expiresAt)));
}
