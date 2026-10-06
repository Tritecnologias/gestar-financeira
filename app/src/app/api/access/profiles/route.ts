import { NextRequest, NextResponse } from "next/server";
import { requireTenantPermission, permissionError } from "@/lib/permissions";
import { normalizedPermissions } from "@/lib/access-catalog";
import { prisma } from "@/lib/db";
import { auditContext, writeAudit } from "@/lib/audit";

export async function GET() {
  try {
    const { db } = await requireTenantPermission("acessos.perfis.view");
    const profiles = await db.accessProfile.findMany({
      orderBy: { nome: "asc" }, include: { _count: { select: { memberships: true } } },
    });
    return NextResponse.json(profiles);
  } catch (error) {
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session } = await requireTenantPermission("acessos.perfis.manage");
    const body = await req.json();
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const descricao = typeof body.descricao === "string" ? body.descricao.trim() : null;
    if (!nome || nome.length > 100 || (descricao && descricao.length > 500)) {
      return NextResponse.json({ error: "Nome ou descrição inválidos." }, { status: 400 });
    }
    const permissoes = normalizedPermissions(body.permissoes ?? []);
    const profile = await prisma.$transaction(async tx => {
      const row = await tx.accessProfile.create({ data: { tenantId: session.tenantId, nome, descricao, permissoes } });
      await writeAudit(tx, { ...auditContext(session), action: "PERMISSION_PROFILE_CREATED",
        resourceType: "AccessProfile", resourceId: row.id, metadata: { profileName: nome, permissions: permissoes } });
      return row;
    });
    return NextResponse.json(profile, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Perfil já existe neste tenant." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
