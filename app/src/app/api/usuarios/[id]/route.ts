import { NextRequest, NextResponse } from "next/server";
import { requireUserAdminActor } from "@/lib/access-admin";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { canAssignLegacyRole, canManageLegacyUser } from "@/lib/access-policy";
import { emailEqualsNormalized, normalizeEmail } from "@/lib/email";

// PUT /api/usuarios/[id] — editar usuário (nome, email, papel, ativo, senha)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session: any;
  try { session = await requireUserAdminActor(); } catch (error) { return NextResponse.json({ error: "Não autorizado" }, { status: (error as {status?: number}).status ?? 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { nome, email, papel, ativo, senha } = body;

  // Verificar se o usuário pertence ao tenant (admin normal) ou se é admin_global
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (!canManageLegacyUser(session, usuario)) {
    return NextResponse.json({ error: "Sem permissão para este usuário" }, { status: 403 });
  }
  if (session.papel !== "admin_global") {
    const targetMap = await prisma.legacyUserAccessMap.findUnique({
      where: { legacyUsuarioId: id },
      select: { identity: { select: { platformAdmin: { select: { id: true } } } } },
    });
    if (targetMap?.identity.platformAdmin) {
      return NextResponse.json({ error: "Administrador da plataforma exige autorização própria" }, { status: 403 });
    }
  }

  if (papel !== undefined && !canAssignLegacyRole(session.papel, papel)) {
    return NextResponse.json({ error: "Papel não permitido" }, { status: 403 });
  }
  if (!legacyAuthEnabled && papel === "admin_global") {
    return NextResponse.json({ error: "Administrador da plataforma requer concessão separada" }, { status: 403 });
  }

  if (email !== undefined) {
    if (typeof email !== "string" || !normalizeEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    const duplicado = await prisma.usuario.findFirst({
      where: { tenantId: usuario.tenantId, email: emailEqualsNormalized(email), id: { not: id } },
      select: { id: true },
    });
    if (duplicado) return NextResponse.json({ error: "Email já cadastrado neste tenant" }, { status: 409 });
  }

  // Montar dados de atualização
  const data: any = {};
  if (nome !== undefined) data.nome = nome.trim();
  if (email !== undefined) data.email = normalizeEmail(email);
  if (papel !== undefined) data.papel = papel;
  if (ativo !== undefined) data.ativo = ativo;
  if (senha && senha.trim().length >= 6) data.senhaHash = await bcrypt.hash(senha, 12);

  try {
    if (!legacyAuthEnabled) {
      const mapping = await prisma.legacyUserAccessMap.findUnique({
        where: { legacyUsuarioId: id },
        select: { identityId: true, membershipId: true, tenantId: true, identity: {
          select: { _count: { select: { memberships: true } }, platformAdmin: { select: { id: true } } },
        } },
      });
      if (!mapping?.membershipId || mapping.tenantId !== usuario.tenantId) {
        return NextResponse.json({ error: "Mapping de acesso empresarial pendente" }, { status: 409 });
      }
      if ((nome !== undefined || email !== undefined || data.senhaHash !== undefined) &&
          (mapping.identity._count.memberships > 1 || mapping.identity.platformAdmin)) {
        return NextResponse.json({ error: "Identidade compartilhada: nome, email e senha exigem fluxo próprio" }, { status: 409 });
      }
      if (email !== undefined) {
        const match = await prisma.authIdentity.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
        if (match && match.id !== mapping.identityId) {
          return NextResponse.json({ error: "Email já pertence a outra identidade" }, { status: 409 });
        }
      }
      const updated = await prisma.$transaction(async tx => {
        if (nome !== undefined || email !== undefined || data.senhaHash !== undefined) {
          await tx.authIdentity.update({ where: { id: mapping.identityId }, data: {
            ...(nome !== undefined && { nome: data.nome }),
            ...(email !== undefined && { email: data.email }),
            ...(data.senhaHash !== undefined && { senhaHash: data.senhaHash }),
          } });
        }
        if (papel !== undefined || ativo !== undefined) {
          await tx.tenantMembership.update({ where: { id: mapping.membershipId! }, data: {
            ...(papel !== undefined && { role: papel === "admin" ? "ADMIN" : "MEMBER" }),
            ...(ativo !== undefined && { status: ativo ? "ACTIVE" : "INACTIVE" }),
          } });
        }
        return tx.usuario.update({
          where: session.papel === "admin_global" ? { id } : { id, tenantId: session.tenantId, papel: { not: "admin_global" } },
          data,
          select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
        });
      });
      return NextResponse.json(updated);
    }
    const updated = await prisma.usuario.update({
      where: session.papel === "admin_global" ? { id } : { id, tenantId: session.tenantId, papel: { not: "admin_global" } },
      data,
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    throw e;
  }
}

// DELETE /api/usuarios/[id] — compatibilidade: desativa, não remove histórico/layouts.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session: any;
  try { session = await requireUserAdminActor(); } catch (error) { return NextResponse.json({ error: "Não autorizado" }, { status: (error as {status?: number}).status ?? 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;

  // Não pode excluir a si mesmo
  if (id === session.id) return NextResponse.json({ error: "Não é possível excluir seu próprio usuário" }, { status: 400 });

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (!canManageLegacyUser(session, usuario)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (session.papel !== "admin_global") {
    const targetMap = await prisma.legacyUserAccessMap.findUnique({
      where: { legacyUsuarioId: id },
      select: { identity: { select: { platformAdmin: { select: { id: true } } } } },
    });
    if (targetMap?.identity.platformAdmin) {
      return NextResponse.json({ error: "Administrador da plataforma exige autorização própria" }, { status: 403 });
    }
  }

  if (!legacyAuthEnabled) {
    const mapping = await prisma.legacyUserAccessMap.findUnique({ where: { legacyUsuarioId: id },
      select: { identityId: true, membershipId: true, tenantId: true } });
    if (!mapping?.membershipId || mapping.tenantId !== usuario.tenantId) {
      return NextResponse.json({ error: "Mapping de acesso empresarial pendente" }, { status: 409 });
    }
    if (mapping.identityId === session.identityId) {
      return NextResponse.json({ error: "Não é possível desativar seu próprio vínculo" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.tenantMembership.update({ where: { id: mapping.membershipId }, data: { status: "INACTIVE" } }),
      prisma.usuario.update({ where: { id }, data: { ativo: false } }),
    ]);
  } else {
    await prisma.usuario.update({
      where: session.papel === "admin_global" ? { id } : { id, tenantId: session.tenantId, papel: { not: "admin_global" } },
      data: { ativo: false },
    });
  }
  return NextResponse.json({ ok: true, desativado: true });
}
