import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/email";
import { ALL_PERMISSIONS } from "@/lib/access-catalog";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** Bootstrap an OWNER without giving PlatformAdmin operational tenant access. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    const { id: tenantId } = await params;
    const body = await req.json();
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!email.includes("@")) throw Object.assign(new Error("Email inválido."), { status: 400 });
    if (body.confirm !== true) throw Object.assign(new Error("Confirme explicitamente a designação de OWNER."), { status: 400 });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-owner:${tenantId}`}, 0))`;
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, ativo: true }, select: { id: true } });
      if (!tenant) throw Object.assign(new Error("Tenant ativo não encontrado."), { status: 404 });
      let identity = await tx.authIdentity.findUnique({ where: { email } });
      if (identity?.status === "INACTIVE") throw Object.assign(new Error("Identidade inativa."), { status: 409 });
      const existing = identity && await tx.tenantMembership.findUnique({
        where: { identityId_tenantId: { identityId: identity.id, tenantId } },
        include: { legacyMaps: { select: { legacyUsuarioId: true } } },
      });
      if (existing) {
        if (existing.role === "OWNER" && existing.status === "ACTIVE") {
          throw Object.assign(new Error("Este vínculo já é OWNER ativo."), { status: 409 });
        }
        if (existing.legacyMaps.length !== 1) {
          throw Object.assign(new Error("Mapping legado incompleto; saneamento necessário."), { status: 409 });
        }
        const legacyUser = await tx.usuario.findFirst({ where: { id: existing.legacyMaps[0].legacyUsuarioId, tenantId } });
        if (!legacyUser) throw Object.assign(new Error("Usuário legado não encontrado neste tenant."), { status: 409 });
        const membership = await tx.tenantMembership.update({ where: { id: existing.id },
          data: { role: "OWNER", status: "ACTIVE" } });
        await tx.usuario.update({ where: { id: legacyUser.id }, data: { papel: "admin", ativo: true } });
        await tx.accessOwnerEvent.create({ data: {
          tenantId, actorIdentityId: actor.identityId, actorLegacyUserId: actor.legacySession?.id ?? null,
          targetIdentityId: identity!.id, targetMembershipId: membership.id,
          previousRole: existing.role, previousStatus: existing.status,
        } });
        await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId,
          accessMode: "PLATFORM_ADMIN", action: "OWNER_ASSIGNED", resourceType: "TenantMembership",
          resourceId: membership.id, changes: { before: { role: existing.role, status: existing.status },
            after: { role: "OWNER", status: "ACTIVE" } } });
        return { id: membership.id, email, tenantId, role: membership.role, profileId: membership.profileId };
      }
      if (await tx.usuario.findFirst({ where: { tenantId, email } })) {
        throw Object.assign(new Error("Usuário legado exige saneamento antes do vínculo."), { status: 409 });
      }
      if (!identity) {
        if (typeof body.nome !== "string" || !body.nome.trim() || typeof body.senha !== "string" || body.senha.length < 12) {
          throw Object.assign(new Error("Nova identidade exige nome e senha de pelo menos 12 caracteres."), { status: 400 });
        }
        identity = await tx.authIdentity.create({ data: {
          email, nome: body.nome.trim(), senhaHash: await bcrypt.hash(body.senha, 12),
        } });
        await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
          action: "IDENTITY_CREATED", resourceType: "AuthIdentity", resourceId: identity.id,
          metadata: { identityName: identity.nome } });
      }
      const profile = await tx.accessProfile.upsert({
        where: { tenantId_nome: { tenantId, nome: "ADMINISTRAÇÃO" } },
        create: { tenantId, nome: "ADMINISTRAÇÃO", descricao: "Perfil inicial de administração", permissoes: ALL_PERMISSIONS },
        update: {},
      });
      if (!profile.ativo) throw Object.assign(new Error("Perfil de administração inativo."), { status: 409 });
      const membership = await tx.tenantMembership.create({ data: { tenantId, identityId: identity.id, role: "OWNER", profileId: profile.id } });
      const legacy = await tx.usuario.create({ data: { tenantId, nome: identity.nome, email,
        senhaHash: identity.senhaHash, papel: "admin" } });
      await tx.legacyUserAccessMap.create({ data: { tenantId, identityId: identity.id,
        membershipId: membership.id, legacyUsuarioId: legacy.id } });
      await tx.accessOwnerEvent.create({ data: {
        tenantId, actorIdentityId: actor.identityId, actorLegacyUserId: actor.legacySession?.id ?? null,
        targetIdentityId: identity.id, targetMembershipId: membership.id,
        previousRole: null, previousStatus: null,
      } });
      await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: "OWNER_ASSIGNED", resourceType: "TenantMembership", resourceId: membership.id,
        changes: { before: { role: null }, after: { role: "OWNER", status: "ACTIVE" } } });
      return { id: membership.id, email, tenantId, role: membership.role, profileId: profile.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Identidade ou vínculo já existe." }, { status: 409 });
    return NextResponse.json({ error: error?.status ? error.message : "Falha ao criar OWNER." }, { status: error?.status ?? 500 });
  }
}
