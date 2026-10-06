import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { auditContext, writeAudit } from "@/lib/audit";

const ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);

export async function GET() {
  try {
    const { db } = await requireTenantPermission("acessos.usuarios.view");
    const memberships = await db.tenantMembership.findMany({
      orderBy: { identity: { nome: "asc" } },
      select: { id: true, role: true, status: true, profileId: true,
        identity: { select: { id: true, nome: true, email: true, status: true } },
        profile: { select: { id: true, nome: true, ativo: true } } },
    });
    return NextResponse.json(memberships);
  } catch (error) {
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session } = await requireTenantPermission("acessos.usuarios.manage");
    const body = await req.json();
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const role = body.role;
    const profileId = body.profileId;
    if (!email || !email.includes("@") || !ROLES.has(role) || typeof profileId !== "string") {
      return NextResponse.json({ error: "Email, role e perfil ativo são obrigatórios." }, { status: 400 });
    }
    if (session.membershipRole !== "OWNER" && role !== "MEMBER") {
      return NextResponse.json({ error: "Somente OWNER pode conceder papel administrativo." }, { status: 403 });
    }
    const result = await prisma.$transaction(async tx => {
      const tenantId = session.tenantId;
      const profile = await tx.accessProfile.findFirst({ where: { id: profileId, tenantId, ativo: true } });
      if (!profile) throw Object.assign(new Error("Perfil inativo ou de outro tenant."), { status: 400 });
      let identity = await tx.authIdentity.findUnique({ where: { email } });
      if (identity?.status === "INACTIVE") throw Object.assign(new Error("Identidade inativa."), { status: 409 });
      if (identity && await tx.tenantMembership.findUnique({ where: { identityId_tenantId: { identityId: identity.id, tenantId } } })) {
        throw Object.assign(new Error("Identidade já vinculada a este tenant."), { status: 409 });
      }
      if (await tx.usuario.findFirst({ where: { tenantId, email } })) {
        throw Object.assign(new Error("Usuário legado com este email exige saneamento antes do vínculo."), { status: 409 });
      }
      if (!identity) {
        if (typeof body.nome !== "string" || !body.nome.trim() || typeof body.senha !== "string" || body.senha.length < 12) {
          throw Object.assign(new Error("Nova identidade exige nome e senha de pelo menos 12 caracteres."), { status: 400 });
        }
        identity = await tx.authIdentity.create({ data: {
          email, nome: body.nome.trim(), senhaHash: await bcrypt.hash(body.senha, 12),
        } });
        await writeAudit(tx, { ...auditContext(session), action: "IDENTITY_CREATED",
          resourceType: "AuthIdentity", resourceId: identity.id,
          metadata: { identityName: identity.nome } });
      }
      const membership = await tx.tenantMembership.create({ data: {
        tenantId, identityId: identity.id, role, profileId,
      } });
      const legacy = await tx.usuario.create({ data: {
        tenantId, nome: identity.nome, email, senhaHash: identity.senhaHash,
        papel: role === "MEMBER" ? "membro" : "admin",
      } });
      await tx.legacyUserAccessMap.create({ data: {
        tenantId, identityId: identity.id, membershipId: membership.id, legacyUsuarioId: legacy.id,
      } });
      await writeAudit(tx, { ...auditContext(session), action: "MEMBERSHIP_CREATED",
        resourceType: "TenantMembership", resourceId: membership.id,
        metadata: { targetIdentityId: identity.id, role, profileName: profile.nome } });
      return { id: membership.id, role: membership.role, status: membership.status,
        profileId: membership.profileId, identity: { nome: identity.nome, email: identity.email } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Identidade ou vínculo já existe." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
