import { withAccessRequest } from "@/lib/access-request-context";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { auditContext, writeAudit } from "@/lib/audit";
import { assertInviteRateLimit, inviteExpiresAt, newInviteToken } from "@/lib/access-invites";
import { sameOrigin } from "@/lib/advisory-management";
import { invitationDelivery, issueInvitationDelivery, INVITATION_RESPONSE_HEADERS } from "@/lib/invite-delivery";
import { lockContractualTenant } from "@/lib/contractual-onboarding";

const ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);

export async function GET() {
  try {
    const { session } = await requireTenantPermission("acessos.usuarios.view");
    const invitations = await prisma.accessInvite.findMany({
      where: { tenantId: session.tenantId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, email: true, name: true, role: true, status: true, expiresAt: true,
        createdAt: true, acceptedAt: true, profile: { select: { nome: true } } },
    });
    return NextResponse.json(invitations.map(item => ({ ...item,
      status: item.status === "PENDING" && item.expiresAt <= new Date() ? "EXPIRED" : item.status,
    })), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") return NextResponse.json(
      { error: "A estrutura de convites ainda não foi preparada neste ambiente." }, { status: 503 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

async function handlePOST(req: NextRequest) {
  try {
    sameOrigin(req);
    const { session } = await requireTenantPermission("acessos.usuarios.manage");
    const body = await req.json();
    if (!session.identityId) return NextResponse.json({ error: "Identidade válida necessária." }, { status: 403 });
    const deliveryConfig = invitationDelivery(req.nextUrl, body.channel);
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const name = typeof body.nome === "string" ? body.nome.trim() : "";
    const role = body.role;
    const profileId = body.profileId;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 160 ||
        !ROLES.has(role) || typeof profileId !== "string") {
      return NextResponse.json({ error: "Nome, email, papel e perfil ativo são obrigatórios." }, { status: 400 });
    }
    if (session.membershipRole !== "OWNER" && role !== "MEMBER") {
      return NextResponse.json({ error: "Somente OWNER pode convidar para papel administrativo." }, { status: 403 });
    }
    const secret = newInviteToken();
    const result = await prisma.$transaction(async tx => {
      const tenantId = session.tenantId;
      await lockContractualTenant(tx, tenantId);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${tenantId}:${email}`}, 0))`;
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, ativo: true }, select: { id: true, nome: true } });
      const profile = await tx.accessProfile.findFirst({ where: { id: profileId, tenantId, ativo: true }, select: { id: true, nome: true } });
      if (!tenant || !profile) throw Object.assign(new Error("Tenant ou perfil indisponível."), { status: 400 });
      const stale = await tx.accessInvite.findMany({ where: { tenantId, email, status: "PENDING",
        expiresAt: { lte: new Date() } }, select: { id: true } });
      for (const item of stale) {
        await tx.accessInvite.update({ where: { id: item.id }, data: { status: "EXPIRED" } });
        await writeAudit(tx, { ...auditContext(session), action: "INVITE_EXPIRED",
          resourceType: "AccessInvite", resourceId: item.id });
      }
      const identity = await tx.authIdentity.findUnique({ where: { email }, select: { id: true, status: true } });
      const existing = identity && await tx.tenantMembership.findUnique({
        where: { identityId_tenantId: { identityId: identity.id, tenantId } }, select: { id: true },
      });
      const pending = await tx.accessInvite.findFirst({ where: { tenantId, email, status: "PENDING" }, select: { id: true } });
      const legacy = await tx.usuario.findFirst({ where: { tenantId, email }, select: { id: true } });
      if (identity?.status === "INACTIVE" || existing || pending || legacy) {
        throw Object.assign(new Error("Já existe acesso ou convite para este email neste tenant; revise o cadastro."), { status: 409 });
      }
      await assertInviteRateLimit(tx, tenantId, email);
      const invitation = await tx.accessInvite.create({ data: { tenantId, email, name, role, profileId,
        status: "PENDING", tokenHash: secret.tokenHash, expiresAt: inviteExpiresAt(),
        invitedByIdentityId: session.identityId! } });
      await writeAudit(tx, { ...auditContext(session), action: "INVITE_CREATED", resourceType: "AccessInvite",
        resourceId: invitation.id, metadata: { role } });
      return { id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt, tenantName: tenant.nome, profileName: profile.nome };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    const sent = await issueInvitationDelivery(deliveryConfig, { id: result.id, tenantId: session.tenantId,
      to: email, name, role, profileName: result.profileName, tenantName: result.tenantName, token: secret.token, expiresAt: result.expiresAt,
      actor: auditContext(session) });
    return NextResponse.json({ id: result.id, status: result.status, expiresAt: result.expiresAt, ...sent },
      { status: 201, headers: INVITATION_RESPONSE_HEADERS });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe convite pendente para este email." }, { status: 409 });
    if ((error as { code?: string })?.code === "P2021") return NextResponse.json(
      { error: "A estrutura de convites ainda não foi preparada neste ambiente." }, { status: 503 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export const POST = withAccessRequest("INVITE_CREATE", handlePOST);
