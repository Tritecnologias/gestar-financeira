import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { requireSupportApprover } from "@/lib/support-approval";
import { expireSupportGrant } from "@/lib/support-grants";
import { writeAudit } from "@/lib/audit";

const noStore = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const cause = error as { status?: number; code?: string };
  const status = cause.status ?? (cause.code === "P2034" ? 409 : 500);
  return NextResponse.json({ error: cause.status ? (error as Error).message :
    status === 409 ? "Decisão concorrente. Atualize a lista." : "Falha ao decidir acesso de suporte." }, { status, headers: noStore });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => { throw Object.assign(new Error("JSON inválido."), { status: 400 }); });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Decisão inválida."), { status: 400 });
    const action = body.action;
    const note = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    if (!["approve", "reject", "revoke"].includes(action)) throw Object.assign(new Error("Ação inválida."), { status: 400 });
    const grant = await prisma.supportGrant.findUnique({ where: { id }, select: {
      id: true, tenantId: true, platformAdminIdentityId: true, status: true, requestedMinutes: true, expiresAt: true,
    } });
    if (!grant) throw Object.assign(new Error("Solicitação inexistente."), { status: 404 });
    if (grant.status === "ACTIVE" && grant.expiresAt && grant.expiresAt <= new Date()) {
      await expireSupportGrant(grant.id, grant.tenantId, grant.expiresAt);
      throw Object.assign(new Error("Acesso já expirado."), { status: 409 });
    }

    let actorIdentityId: string;
    let approverMembershipId: string | null = null;
    let requesterRevoked = false;
    if (action === "revoke") {
      // The requester may end their own grant. The responsible may revoke any grant of this tenant.
      try {
        const actor = await requirePlatformAdmin();
        if (!actor.identityId || actor.identityId !== grant.platformAdminIdentityId) throw new Error("Not requester");
        actorIdentityId = actor.identityId;
        requesterRevoked = true;
      } catch {
        const { session } = await requireSupportApprover();
        if (session.tenantId !== grant.tenantId) throw Object.assign(new Error("Tenant incorreto."), { status: 403 });
        actorIdentityId = session.identityId!;
      }
    } else {
      const { session } = await requireSupportApprover();
      if (session.tenantId !== grant.tenantId || session.identityId === grant.platformAdminIdentityId) {
        throw Object.assign(new Error("Aprovação própria ou de outro tenant proibida."), { status: 403 });
      }
      actorIdentityId = session.identityId!;
      approverMembershipId = session.membershipId!;
    }

    const result = await prisma.$transaction(async tx => {
      // Recheck responsible, identity and target inside the same transaction.
      if (approverMembershipId) {
        const responsible = await tx.tenantContractualResponsible.findUnique({
          where: { tenantId: grant.tenantId }, include: { membership: { include: { identity: true } } },
        });
        if (!responsible || responsible.membershipId !== approverMembershipId ||
            responsible.membership.role !== "OWNER" || responsible.membership.status !== "ACTIVE" ||
            responsible.membership.identity.status !== "ACTIVE" || responsible.membership.identityId !== actorIdentityId) {
          throw Object.assign(new Error("Responsável contratual perdeu autorização."), { status: 403 });
        }
      }
      if (action === "approve") {
        const requester = await tx.authIdentity.findUnique({ where: { id: grant.platformAdminIdentityId },
          select: { status: true, platformAdmin: { select: { status: true } } } });
        if (requester?.status !== "ACTIVE" || requester.platformAdmin?.status !== "ACTIVE") {
          throw Object.assign(new Error("PlatformAdmin solicitante não está mais ativo."), { status: 409 });
        }
        const normalMembership = await tx.tenantMembership.findFirst({ where: {
          identityId: grant.platformAdminIdentityId, tenantId: grant.tenantId, status: "ACTIVE",
        }, select: { id: true } });
        if (normalMembership) throw Object.assign(new Error("Solicitante já possui membership normal neste tenant."), { status: 409 });
      }
      const now = new Date();
      const targetStatus = action === "approve" ? "ACTIVE" : action === "reject" ? "REJECTED" : "REVOKED";
      const previousStatus = action === "revoke" ? "ACTIVE" : "PENDING";
      const changed = await tx.supportGrant.updateMany({
        where: { id, tenantId: grant.tenantId, status: previousStatus,
          ...(action === "revoke" ? { expiresAt: { gt: now } } : {}) },
        data: action === "approve" ? {
          status: "ACTIVE", approvedAt: now, approvedByMembershipId: approverMembershipId,
          startsAt: now, expiresAt: new Date(now.getTime() + grant.requestedMinutes * 60_000),
        } : action === "reject" ? { status: "REJECTED", rejectedAt: now, rejectionReason: note }
          : { status: "REVOKED", revokedAt: now, revokedByIdentityId: actorIdentityId, revocationReason: note },
      });
      if (!changed.count) throw Object.assign(new Error("Solicitação alterada ou expirada. Atualize a lista."), { status: 409 });
      await tx.supportGrantEvent.create({ data: { grantId: id, tenantId: grant.tenantId,
        type: action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "REVOKED",
        actorIdentityId, detail: note } });
      if (action === "approve") await tx.supportGrantEvent.create({ data: {
        grantId: id, tenantId: grant.tenantId, type: "ACTIVATED", actorIdentityId,
        detail: `Válido por ${grant.requestedMinutes} minutos.` } });
      await writeAudit(tx, { tenantId: grant.tenantId, actorIdentityId,
        actorMembershipId: approverMembershipId,
        accessMode: requesterRevoked ? "PLATFORM_ADMIN" : "MEMBERSHIP",
        action: action === "approve" ? "SUPPORT_APPROVED" : action === "reject" ? "SUPPORT_REJECTED" :
          requesterRevoked ? "SUPPORT_ENDED_BY_PLATFORM_ADMIN" : "SUPPORT_REVOKED",
        resourceType: "SupportGrant", resourceId: id, supportGrantId: id,
        changes: { before: { status: previousStatus }, after: { status: targetStatus } } });
      if (action === "approve") await writeAudit(tx, { tenantId: grant.tenantId, actorIdentityId,
        actorMembershipId: approverMembershipId, accessMode: "MEMBERSHIP", action: "SUPPORT_ACTIVATED",
        resourceType: "SupportGrant", resourceId: id, supportGrantId: id });
      return { status: targetStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) { return failure(error); }
}
