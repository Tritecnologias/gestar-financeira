import { withAccessRequest } from "@/lib/access-request-context";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { auditContext, writeAudit } from "@/lib/audit";
import { assertInviteRateLimit, expireInvite, inviteExpiresAt, newInviteToken } from "@/lib/access-invites";
import { sameOrigin } from "@/lib/advisory-management";
import { invitationDelivery, issueInvitationDelivery, INVITATION_RESPONSE_HEADERS } from "@/lib/invite-delivery";
import { lockContractualTenant, linkReissuedContractualInvite, markContractualInviteRevoked } from "@/lib/contractual-onboarding";

type Params = { params: Promise<{ id: string }> };

async function handlePOST(req: NextRequest, { params }: Params) {
  try {
    sameOrigin(req);
    const { session } = await requireTenantPermission("acessos.usuarios.manage");
    const { id } = await params;
    const body = await req.json();
    if (body.action !== "resend" && body.action !== "revoke") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    if (!session.identityId) return NextResponse.json({ error: "Identidade válida necessária." }, { status: 403 });
    const deliveryConfig = body.action === "revoke" ? null : invitationDelivery(req.nextUrl, body.channel);
    await expireInvite(id, session.tenantId);
    const secret = body.action === "resend" ? newInviteToken() : null;
    const result = await prisma.$transaction(async tx => {
      const tenantId = session.tenantId;
      await lockContractualTenant(tx, tenantId);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite-id:${id}`}, 0))`;
      const current = await tx.accessInvite.findFirst({ where: { id, tenantId },
        include: { tenant: { select: { ativo: true, nome: true } }, profile: { select: { ativo: true, nome: true } } } });
      if (!current) throw Object.assign(new Error("Convite não encontrado."), { status: 404 });
      if (session.membershipRole !== "OWNER" && current.role !== "MEMBER") {
        throw Object.assign(new Error("ADMIN pode administrar somente convites MEMBER."), { status: 403 });
      }
      if (current.status === "PENDING" && current.expiresAt <= new Date() && body.action === "resend") {
        await tx.accessInvite.update({ where: { id }, data: { status: "EXPIRED" } });
        await writeAudit(tx, { ...auditContext(session), action: "INVITE_EXPIRED", resourceType: "AccessInvite", resourceId: id });
      }
      if (current.status !== "PENDING" || current.expiresAt <= new Date()) {
        if (body.action === "revoke") throw Object.assign(new Error("Somente convite pendente pode ser revogado."), { status: 409 });
        if (current.status !== "PENDING" && current.status !== "EXPIRED") {
          throw Object.assign(new Error("Convite já concluído ou revogado."), { status: 409 });
        }
      }
      if (body.action === "revoke") {
        await tx.accessInvite.update({ where: { id }, data: { status: "REVOKED",
          revokedAt: new Date(), revokedByIdentityId: session.identityId! } });
        await writeAudit(tx, { ...auditContext(session), action: "INVITE_REVOKED", resourceType: "AccessInvite", resourceId: id });
        await markContractualInviteRevoked(tx, tenantId, id, session.identityId!);
        return { id, status: "REVOKED" };
      }
      if (!current.tenant.ativo || !current.profile.ativo) {
        throw Object.assign(new Error("Tenant ou perfil inativo."), { status: 409 });
      }
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${tenantId}:${current.email}`}, 0))`;
      await assertInviteRateLimit(tx, tenantId, current.email);
      const identity = await tx.authIdentity.findUnique({ where: { email: current.email }, select: { id: true, status: true } });
      const legacy = await tx.usuario.findFirst({ where: { tenantId, email: current.email }, select: { id: true } });
      if (identity?.status === "INACTIVE" || identity && await tx.tenantMembership.findUnique({
        where: { identityId_tenantId: { identityId: identity.id, tenantId } }, select: { id: true } }) || legacy) {
        throw Object.assign(new Error("Acesso já existente ou identidade indisponível."), { status: 409 });
      }
      if (current.status === "PENDING" && current.expiresAt > new Date()) {
        await tx.accessInvite.update({ where: { id }, data: { status: "REVOKED",
          revokedAt: new Date(), revokedByIdentityId: session.identityId! } });
        await writeAudit(tx, { ...auditContext(session), action: "INVITE_REVOKED", resourceType: "AccessInvite", resourceId: id,
          reason: "Reenvio" });
      }
      const next = await tx.accessInvite.create({ data: { tenantId, email: current.email,
        name: current.name, role: current.role, profileId: current.profileId,
        tokenHash: secret!.tokenHash, expiresAt: inviteExpiresAt(), invitedByIdentityId: session.identityId! } });
      await writeAudit(tx, { ...auditContext(session), action: "INVITE_CREATED", resourceType: "AccessInvite",
        resourceId: next.id, reason: "Reenvio" });
      await linkReissuedContractualInvite(tx, tenantId, id, next.id, session.identityId!);
      return { id: next.id, status: next.status, expiresAt: next.expiresAt,
        tenantName: current.tenant.nome, email: current.email, name: current.name, role: current.role, profileName: current.profile.nome };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    const sent = secret && deliveryConfig && "email" in result && result.email && result.tenantName && result.expiresAt
      ? await issueInvitationDelivery(deliveryConfig, { id: result.id, tenantId: session.tenantId,
      to: result.email, name: result.name, role: result.role, profileName: result.profileName,
      tenantName: result.tenantName, token: secret.token, expiresAt: result.expiresAt, replacesId: id,
      actor: auditContext(session) }) : null;
    return NextResponse.json({ id: result.id, status: result.status,
      ...("expiresAt" in result ? { expiresAt: result.expiresAt } : {}), ...sent },
      { headers: INVITATION_RESPONSE_HEADERS });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") return NextResponse.json(
      { error: "A estrutura de convites ainda não foi preparada neste ambiente." }, { status: 503 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export const POST = withAccessRequest("INVITE_ACTION", handlePOST);
