import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { auditContext, writeAudit } from "@/lib/audit";
import { canIssueDevInvite, devInviteLink, inviteExpiresAt, newInviteToken } from "@/lib/access-invites";

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
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session } = await requireTenantPermission("acessos.usuarios.manage");
    if (!session.identityId || !canIssueDevInvite(req.nextUrl)) {
      return NextResponse.json({ error: "Envio de convites não configurado neste ambiente." }, { status: 503 });
    }
    const body = await req.json();
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
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${tenantId}:${email}`}, 0))`;
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, ativo: true }, select: { id: true } });
      const profile = await tx.accessProfile.findFirst({ where: { id: profileId, tenantId, ativo: true }, select: { id: true } });
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
      const invitation = await tx.accessInvite.create({ data: { tenantId, email, name, role, profileId,
        status: "PENDING", tokenHash: secret.tokenHash, expiresAt: inviteExpiresAt(),
        invitedByIdentityId: session.identityId! } });
      await writeAudit(tx, { ...auditContext(session), action: "INVITE_CREATED", resourceType: "AccessInvite",
        resourceId: invitation.id, metadata: { role } });
      return { id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json({ ...result, devLink: devInviteLink(req.nextUrl.origin, secret.token) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe convite pendente para este email." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
