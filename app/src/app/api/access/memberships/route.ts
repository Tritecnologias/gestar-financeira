import { NextResponse } from "next/server";
import { requireTenantPermission, permissionError } from "@/lib/permissions";

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

// O fluxo anterior permitia senha escolhida pelo administrador e criava
// membership ACTIVE antes do aceite. Novos vínculos passam pelo convite.
export async function POST() {
  try { await requireTenantPermission("acessos.usuarios.manage"); }
  catch (error) {
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Use o fluxo de convite para conceder novo acesso." }, { status: 410 });
}
