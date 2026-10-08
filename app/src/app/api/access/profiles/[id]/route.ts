import { NextRequest, NextResponse } from "next/server";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { normalizedPermissions } from "@/lib/access-catalog";
import { prisma } from "@/lib/db";
import { auditContext, writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { db, session } = await requireTenantPermission("acessos.perfis.manage");
    const { id } = await params;
    const existing = await db.accessProfile.findFirst({ where: { id },
      include: { _count: { select: { memberships: true } } } });
    if (!existing) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
    const body = await req.json();
    const data: { nome?: string; descricao?: string | null; ativo?: boolean; permissoes?: string[] } = {};
    if (body.nome !== undefined) {
      if (typeof body.nome !== "string" || !body.nome.trim() || body.nome.trim().length > 100) {
        return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
      }
      data.nome = body.nome.trim();
    }
    if (body.descricao !== undefined) {
      if (body.descricao !== null && (typeof body.descricao !== "string" || body.descricao.length > 500)) {
        return NextResponse.json({ error: "Descrição inválida." }, { status: 400 });
      }
      data.descricao = body.descricao?.trim() || null;
    }
    if (body.ativo !== undefined) {
      if (typeof body.ativo !== "boolean") return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      if (!body.ativo && existing._count.memberships > 0) {
        return NextResponse.json({ error: "Remova os vínculos antes de inativar o perfil." }, { status: 409 });
      }
      data.ativo = body.ativo;
    }
    if (body.permissoes !== undefined) data.permissoes = normalizedPermissions(body.permissoes);
    const profile = await prisma.$transaction(async tx => {
      const fresh = await tx.accessProfile.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!fresh) throw Object.assign(new Error("Perfil não encontrado."), { status: 404 });
      const row = await tx.accessProfile.update({ where: { id, tenantId: session.tenantId }, data });
      await writeAudit(tx, { ...auditContext(session),
        action: fresh.ativo && !row.ativo ? "PERMISSION_PROFILE_DISABLED" : "PERMISSION_PROFILE_CHANGED",
        resourceType: "AccessProfile", resourceId: id,
        changes: { before: { name: fresh.nome, active: fresh.ativo, permissions: fresh.permissoes },
          after: { name: row.nome, active: row.ativo, permissions: row.permissoes } } });
      return row;
    });
    return NextResponse.json(profile);
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Perfil já existe neste tenant." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
