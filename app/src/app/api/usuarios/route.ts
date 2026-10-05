import { NextRequest, NextResponse } from "next/server";
import { requireUserAdminActor } from "@/lib/access-admin";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { canAssignLegacyRole, canUseActiveTenant } from "@/lib/access-policy";
import { emailEqualsNormalized, normalizeEmail } from "@/lib/email";

// GET /api/usuarios — lista usuários (admin: do próprio tenant, admin_global: todos)
export async function GET() {
  let session: any;
  try { session = await requireUserAdminActor(); } catch (error) { return NextResponse.json({ error: "Não autorizado" }, { status: (error as {status?: number}).status ?? 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const where = session.papel === "admin_global" ? {} : {
    tenantId: session.tenantId, papel: { not: "admin_global" },
  };
  const usuarios = await prisma.usuario.findMany({
    where,
    select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true, tenantId: true,
      tenant: { select: { nome: true } },
      legacyAccessMap: { select: {
        identity: { select: { status: true } },
        membership: { select: { role: true, status: true } },
        platformAdmin: { select: { status: true } },
      } },
    },
    orderBy: [{ criadoEm: "desc" }],
  });
  if (legacyAuthEnabled) return NextResponse.json(usuarios.map(({ legacyAccessMap, ...usuario }) => usuario));
  return NextResponse.json(usuarios.map(({ legacyAccessMap, ...usuario }) => ({
    ...usuario,
    papel: legacyAccessMap?.membership
      ? legacyAccessMap.membership.role === "MEMBER" ? "membro" : "admin"
      : legacyAccessMap?.platformAdmin?.status === "ACTIVE" ? "admin_global" : usuario.papel,
    ativo: usuario.ativo && legacyAccessMap?.identity.status === "ACTIVE" &&
      (legacyAccessMap?.membership?.status === "ACTIVE" || legacyAccessMap?.platformAdmin?.status === "ACTIVE"),
  })));
}

// POST /api/usuarios — criar novo usuário
export async function POST(req: NextRequest) {
  if (!legacyAuthEnabled) return NextResponse.json({ error: "Use Acessos / Usuários para administrar memberships." }, { status: 410 });
  let session: any;
  try { session = await requireUserAdminActor(); } catch (error) { return NextResponse.json({ error: "Não autorizado" }, { status: (error as {status?: number}).status ?? 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { nome, email, senha, papel, tenantId: targetTenantId } = await req.json();

  if (typeof nome !== "string" || typeof email !== "string" || typeof senha !== "string" ||
      !nome.trim() || !normalizeEmail(email) || !senha.trim()) {
    return NextResponse.json({ error: "Nome, email e senha são obrigatórios" }, { status: 400 });
  }

  if (senha.length < 6) {
    return NextResponse.json({ error: "Senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  // Admin global pode criar em qualquer tenant; admin só no próprio
  const tenantIdFinal = (session.papel === "admin_global" && targetTenantId) ? targetTenantId : session.tenantId;
  if (targetTenantId && session.papel !== "admin_global" && targetTenantId !== session.tenantId) {
    return NextResponse.json({ error: "Sem permissão para este tenant" }, { status: 403 });
  }
  if (typeof tenantIdFinal !== "string") return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
  const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantIdFinal }, select: { ativo: true } });
  if (!targetTenant || !canUseActiveTenant(session.papel, session.tenantId, tenantIdFinal, targetTenant.ativo)) {
    return NextResponse.json({ error: "Tenant inexistente ou inativo" }, { status: 403 });
  }

  const papelFinal = papel || "membro";
  if (!legacyAuthEnabled && papelFinal === "admin_global") {
    return NextResponse.json({ error: "Administrador da plataforma requer concessão separada" }, { status: 403 });
  }
  if (!canAssignLegacyRole(session.papel, papelFinal)) {
    return NextResponse.json({ error: "Papel não permitido" }, { status: 403 });
  }

  // Verificar se email já existe no tenant
  const existente = await prisma.usuario.findFirst({ where: { email: emailEqualsNormalized(email), tenantId: tenantIdFinal } });
  if (existente) return NextResponse.json({ error: "Email já cadastrado neste tenant" }, { status: 409 });

  const senhaHash = await bcrypt.hash(senha, 12);

  try {
    if (!legacyAuthEnabled) {
      const normalizedEmail = normalizeEmail(email);
      if (await prisma.authIdentity.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) {
        return NextResponse.json({ error: "Identidade já existe. Vinculação a outro tenant requer fluxo de convite próprio." }, { status: 409 });
      }
      const usuario = await prisma.$transaction(async tx => {
        const identity = await tx.authIdentity.create({
          data: { nome: nome.trim(), email: normalizedEmail, senhaHash },
        });
        const membership = await tx.tenantMembership.create({
          data: { identityId: identity.id, tenantId: tenantIdFinal,
            role: papelFinal === "admin" ? "ADMIN" : "MEMBER" },
        });
        const created = await tx.usuario.create({
          data: { tenantId: tenantIdFinal, nome: nome.trim(), email: normalizedEmail, senhaHash, papel: papelFinal },
          select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
        });
        await tx.legacyUserAccessMap.create({
          data: { identityId: identity.id, tenantId: tenantIdFinal,
            membershipId: membership.id, legacyUsuarioId: created.id },
        });
        return created;
      });
      return NextResponse.json(usuario, { status: 201 });
    }
    const usuario = await prisma.usuario.create({
      data: {
        tenantId: tenantIdFinal,
        nome: nome.trim(),
        email: normalizeEmail(email),
        senhaHash,
        papel: papelFinal,
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    });
    return NextResponse.json(usuario, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") return NextResponse.json({ error: "Email ou vínculo já cadastrado" }, { status: 409 });
    throw error;
  }
}
