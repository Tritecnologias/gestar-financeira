import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireTenantPermission, permissionError } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };
const ROLES = new Set(["OWNER", "ADMIN", "MEMBER"]);

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { session } = await requireTenantPermission("acessos.usuarios.manage");
    const { id } = await params;
    const body = await req.json();
    if (body.role !== undefined && !ROLES.has(body.role)) return NextResponse.json({ error: "Role inválido." }, { status: 400 });
    if (body.status !== undefined && !["ACTIVE", "INACTIVE"].includes(body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    if (body.profileId !== undefined && typeof body.profileId !== "string") {
      return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
    }
    if (body.role === undefined && body.status === undefined && body.profileId === undefined) {
      return NextResponse.json({ error: "Nenhuma alteração informada." }, { status: 400 });
    }
    const result = await prisma.$transaction(async tx => {
      const tenantId = session.tenantId;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-owner:${tenantId}`}, 0))`;
      const current = await tx.tenantMembership.findFirst({ where: { id, tenantId },
        include: { legacyMaps: { select: { legacyUsuarioId: true } } } });
      if (!current) throw Object.assign(new Error("Membership não encontrado neste tenant."), { status: 404 });
      if (session.membershipRole !== "OWNER" && (current.role !== "MEMBER" ||
          (body.role !== undefined && body.role !== "MEMBER"))) {
        throw Object.assign(new Error("ADMIN pode administrar somente memberships MEMBER."), { status: 403 });
      }
      if (current.role === "OWNER" && current.status === "ACTIVE" &&
          (body.role && body.role !== "OWNER" || body.status === "INACTIVE")) {
        const count = await tx.tenantMembership.count({ where: { tenantId, role: "OWNER", status: "ACTIVE" } });
        if (count <= 1) throw Object.assign(new Error("O último OWNER ativo não pode perder acesso."), { status: 409 });
      }
      if (body.profileId !== undefined) {
        const profile = await tx.accessProfile.findFirst({ where: { id: body.profileId, tenantId, ativo: true } });
        if (!profile) throw Object.assign(new Error("Perfil inativo ou de outro tenant."), { status: 400 });
      }
      if (current.legacyMaps.length !== 1) throw Object.assign(new Error("Mapping legado incompleto."), { status: 409 });
      const update = await tx.tenantMembership.update({ where: { id, tenantId }, data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.profileId !== undefined ? { profileId: body.profileId } : {}),
      } });
      await tx.usuario.update({ where: { id: current.legacyMaps[0].legacyUsuarioId, tenantId }, data: {
        ...(body.role !== undefined ? { papel: body.role === "MEMBER" ? "membro" : "admin" } : {}),
        ...(body.status !== undefined ? { ativo: body.status === "ACTIVE" } : {}),
      } });
      return { id: update.id, role: update.role, status: update.status, profileId: update.profileId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json(result);
  } catch (error) {
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
