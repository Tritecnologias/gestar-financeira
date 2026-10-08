import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { auth, legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { expireInvite, hashInviteToken, INVITE_UNAVAILABLE, validInviteToken } from "@/lib/access-invites";

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (legacyAuthEnabled) return NextResponse.json({ error: "Ativação indisponível neste modo de autenticação." }, { status: 503, headers });
  try {
    const body = await req.json();
    if (!validInviteToken(body.token)) return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
    const invite = await prisma.accessInvite.findUnique({ where: { tokenHash: hashInviteToken(body.token) },
      select: { id: true, tenantId: true, email: true, status: true, expiresAt: true } });
    if (invite?.status === "PENDING" && invite.expiresAt <= new Date()) await expireInvite(invite.id, invite.tenantId);
    if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
      return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
    }
    const current = (await auth())?.user as { id?: string; authMode?: string } | undefined;
    const password = typeof body.password === "string" ? body.password : "";
    // Hash antes da transação para não segurar lock durante o trabalho de CPU.
    const passwordHash = password.length >= 12 && password.length <= 200 ? await bcrypt.hash(password, 12) : null;
    const result = await prisma.$transaction(async tx => {
      const consumed = await tx.accessInvite.updateMany({ where: { id: invite.id, status: "PENDING",
        expiresAt: { gt: new Date() } }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      if (consumed.count !== 1) throw Object.assign(new Error(INVITE_UNAVAILABLE), { status: 409 });
      const pending = await tx.accessInvite.findUniqueOrThrow({ where: { id: invite.id } });
      const tenant = await tx.tenant.findFirst({ where: { id: pending.tenantId, ativo: true }, select: { id: true } });
      const profile = await tx.accessProfile.findFirst({ where: { id: pending.profileId,
        tenantId: pending.tenantId, ativo: true }, select: { id: true } });
      if (!tenant || !profile) throw Object.assign(new Error("Empresa ou perfil indisponível."), { status: 409 });
      let identity = await tx.authIdentity.findUnique({ where: { email: pending.email } });
      let newlyActivated = false;
      if (identity) {
        if (identity.status !== "ACTIVE" || current?.authMode !== "identity" || current.id !== identity.id) {
          throw Object.assign(new Error("Entre com a identidade destinatária para aceitar o convite."), { status: 403 });
        }
      } else {
        if (current?.authMode === "identity") throw Object.assign(new Error("Saia da sessão atual para criar sua identidade."), { status: 409 });
        if (!passwordHash) throw Object.assign(new Error("Defina uma senha de 12 a 200 caracteres."), { status: 400 });
        identity = await tx.authIdentity.create({ data: { email: pending.email, nome: pending.name,
          senhaHash: passwordHash, status: "ACTIVE" } });
        newlyActivated = true;
        await writeAudit(tx, { tenantId: pending.tenantId, actorIdentityId: identity.id, accessMode: "SYSTEM",
          action: "IDENTITY_ACTIVATED", resourceType: "AuthIdentity", resourceId: identity.id });
      }
      const existing = await tx.tenantMembership.findUnique({ where: { identityId_tenantId: {
        identityId: identity.id, tenantId: pending.tenantId } }, select: { id: true } });
      const legacy = await tx.usuario.findFirst({ where: { tenantId: pending.tenantId, email: pending.email }, select: { id: true } });
      if (existing || legacy) throw Object.assign(new Error("Acesso já existente; solicite revisão ao administrador."), { status: 409 });
      const membership = await tx.tenantMembership.create({ data: { tenantId: pending.tenantId,
        identityId: identity.id, role: pending.role, profileId: pending.profileId, status: "ACTIVE" } });
      const user = await tx.usuario.create({ data: { tenantId: pending.tenantId, nome: identity.nome,
        email: pending.email, senhaHash: identity.senhaHash,
        papel: pending.role === "MEMBER" ? "membro" : "admin", ativo: true } });
      await tx.legacyUserAccessMap.create({ data: { tenantId: pending.tenantId, identityId: identity.id,
        membershipId: membership.id, legacyUsuarioId: user.id } });
      if (pending.role === "OWNER") {
        await tx.accessOwnerEvent.create({ data: { tenantId: pending.tenantId,
          actorIdentityId: pending.invitedByIdentityId, targetIdentityId: identity.id,
          targetMembershipId: membership.id, previousRole: null, previousStatus: null } });
        await writeAudit(tx, { tenantId: pending.tenantId, actorIdentityId: pending.invitedByIdentityId,
          accessMode: "MEMBERSHIP", action: "OWNER_ASSIGNED", resourceType: "TenantMembership",
          resourceId: membership.id });
      }
      await tx.accessInvite.update({ where: { id: pending.id }, data: { acceptedByIdentityId: identity.id } });
      await writeAudit(tx, { tenantId: pending.tenantId, actorIdentityId: identity.id,
        actorMembershipId: membership.id, accessMode: "MEMBERSHIP", action: "INVITE_ACCEPTED",
        resourceType: "AccessInvite", resourceId: pending.id });
      await writeAudit(tx, { tenantId: pending.tenantId, actorIdentityId: identity.id,
        actorMembershipId: membership.id, accessMode: "MEMBERSHIP", action: "MEMBERSHIP_ACTIVATED",
        resourceType: "TenantMembership", resourceId: membership.id });
      return { newlyActivated, tenantId: pending.tenantId, email: pending.email };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json(result, { headers });
  } catch (error: unknown) {
    const failure = error as { code?: string; status?: number; message?: string };
    if (failure?.code && ["P2002", "P2034"].includes(failure.code)) return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 409, headers });
    return NextResponse.json({ error: failure?.status ? failure.message : "Não foi possível concluir o convite." },
      { status: failure?.status ?? 500, headers });
  }
}
