import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/email";
import { ALL_PERMISSIONS } from "@/lib/access-catalog";
import { writeAudit } from "@/lib/audit";
import { canIssueDevInvite, devInviteLink, expireInvite, inviteExpiresAt, newInviteToken } from "@/lib/access-invites";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin();
    const { id: tenantId } = await params;
    const rows = await prisma.accessInvite.findMany({ where: { tenantId, role: "OWNER" },
      orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, email: true, name: true, status: true, expiresAt: true } });
    return NextResponse.json(rows.map(row => ({ ...row,
      status: row.status === "PENDING" && row.expiresAt <= new Date() ? "EXPIRED" : row.status,
    })), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const failure = error as { status?: number; message?: string };
    return NextResponse.json({ error: failure?.status ? failure.message : "Acesso negado." }, { status: failure?.status ?? 403 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    if (!actor.identityId || !canIssueDevInvite(req.nextUrl)) {
      return NextResponse.json({ error: "Envio de convites não configurado neste ambiente." }, { status: 503 });
    }
    const { id: tenantId } = await params;
    const body = await req.json();
    if (body.action === "revoke" || body.action === "resend") {
      const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";
      if (!inviteId) return NextResponse.json({ error: "Convite obrigatório." }, { status: 400 });
      await expireInvite(inviteId, tenantId);
      const secret = body.action === "resend" ? newInviteToken() : null;
      const changed = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite-id:${inviteId}`}, 0))`;
        const old = await tx.accessInvite.findFirst({ where: { id: inviteId, tenantId, role: "OWNER" },
          include: { tenant: { select: { ativo: true } }, profile: { select: { ativo: true } } } });
        if (!old || (old.status !== "PENDING" && old.status !== "EXPIRED")) {
          throw Object.assign(new Error("Convite OWNER indisponível."), { status: 409 });
        }
        if (body.action === "revoke") {
          if (old.status !== "PENDING") throw Object.assign(new Error("Convite não está pendente."), { status: 409 });
          await tx.accessInvite.update({ where: { id: inviteId }, data: { status: "REVOKED",
            revokedAt: new Date(), revokedByIdentityId: actor.identityId! } });
          await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
            action: "INVITE_REVOKED", resourceType: "AccessInvite", resourceId: inviteId });
          return { id: inviteId, status: "REVOKED" };
        }
        if (!old.tenant.ativo || !old.profile.ativo) throw Object.assign(new Error("Tenant ou perfil inativo."), { status: 409 });
        const targetIdentity = await tx.authIdentity.findUnique({ where: { email: old.email }, select: { id: true, status: true } });
        const legacy = await tx.usuario.findFirst({ where: { tenantId, email: old.email }, select: { id: true } });
        if (targetIdentity?.status === "INACTIVE" || targetIdentity && await tx.tenantMembership.findUnique({
          where: { identityId_tenantId: { identityId: targetIdentity.id, tenantId } }, select: { id: true } }) || legacy) {
          throw Object.assign(new Error("Acesso existente ou identidade indisponível."), { status: 409 });
        }
        if (old.status === "PENDING") {
          await tx.accessInvite.update({ where: { id: inviteId }, data: { status: "REVOKED",
            revokedAt: new Date(), revokedByIdentityId: actor.identityId! } });
          await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
            action: "INVITE_REVOKED", resourceType: "AccessInvite", resourceId: inviteId, reason: "Reenvio" });
        }
        const next = await tx.accessInvite.create({ data: { tenantId, email: old.email, name: old.name,
          role: "OWNER", profileId: old.profileId, tokenHash: secret!.tokenHash,
          expiresAt: inviteExpiresAt(), invitedByIdentityId: actor.identityId! } });
        await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
          action: "INVITE_CREATED", resourceType: "AccessInvite", resourceId: next.id, reason: "Reenvio" });
        return { id: next.id, status: next.status, expiresAt: next.expiresAt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      return NextResponse.json({ ...changed, ...(secret ? { devLink: devInviteLink(req.nextUrl.origin, secret.token) } : {}) },
        { headers: { "Cache-Control": "private, no-store" } });
    }
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const name = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!body.confirm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 160) {
      return NextResponse.json({ error: "Confirme OWNER e informe nome e email válidos." }, { status: 400 });
    }
    const secret = newInviteToken();
    const invite = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${tenantId}:${email}`}, 0))`;
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, ativo: true }, select: { id: true } });
      if (!tenant) throw Object.assign(new Error("Tenant ativo não encontrado."), { status: 404 });
      const identity = await tx.authIdentity.findUnique({ where: { email }, select: { id: true, status: true } });
      const membership = identity && await tx.tenantMembership.findUnique({ where: { identityId_tenantId: {
        identityId: identity.id, tenantId } }, select: { id: true } });
      const pending = await tx.accessInvite.findFirst({ where: { tenantId, email, status: "PENDING",
        expiresAt: { gt: new Date() } }, select: { id: true } });
      const legacy = await tx.usuario.findFirst({ where: { tenantId, email }, select: { id: true } });
      if (identity?.status === "INACTIVE" || membership || pending || legacy) {
        throw Object.assign(new Error("Acesso ou convite já existente para este tenant."), { status: 409 });
      }
      const stale = await tx.accessInvite.findMany({ where: { tenantId, email, status: "PENDING",
        expiresAt: { lte: new Date() } }, select: { id: true } });
      for (const item of stale) {
        await tx.accessInvite.update({ where: { id: item.id }, data: { status: "EXPIRED" } });
        await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
          action: "INVITE_EXPIRED", resourceType: "AccessInvite", resourceId: item.id });
      }
      const profile = await tx.accessProfile.upsert({
        where: { tenantId_nome: { tenantId, nome: "ADMINISTRAÇÃO" } },
        create: { tenantId, nome: "ADMINISTRAÇÃO", descricao: "Perfil inicial de administração", permissoes: ALL_PERMISSIONS },
        update: {},
      });
      if (!profile.ativo) throw Object.assign(new Error("Perfil administrativo inativo."), { status: 409 });
      const created = await tx.accessInvite.create({ data: { tenantId, email, name,
        role: "OWNER", profileId: profile.id, tokenHash: secret.tokenHash,
        expiresAt: inviteExpiresAt(), invitedByIdentityId: actor.identityId! } });
      await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: "INVITE_CREATED", resourceType: "AccessInvite", resourceId: created.id,
        metadata: { role: "OWNER" } });
      return { id: created.id, expiresAt: created.expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json({ ...invite, devLink: devInviteLink(req.nextUrl.origin, secret.token) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const failure = error as { code?: string; status?: number; message?: string };
    return NextResponse.json({ error: failure?.status ? failure.message : "Falha ao criar convite OWNER." },
      { status: failure?.status ?? (failure?.code === "P2002" ? 409 : 500) });
  }
}
