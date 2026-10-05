import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { canUseActiveTenant, tenantOverrideCookieOptions } from "@/lib/access-policy";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  let context: Awaited<ReturnType<typeof requireSession>>;
  try { context = await requireSession(); } catch { return NextResponse.json({ error: "Não autenticado" }, { status: 401 }); }
  if (context.session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let tenantId: unknown;
  try { ({ tenantId } = await req.json()); }
  catch { return NextResponse.json({ error: "Requisição inválida" }, { status: 400 }); }

  if (tenantId == null || tenantId === context.baseTenantId) {
    // Voltar ao tenant original — deletar cookie
    const res = NextResponse.json({ active: context.baseTenantId, message: "Voltou ao tenant original" });
    res.cookies.set("tenant_override", "", { ...tenantOverrideCookieOptions(), maxAge: 0 });
    return res;
  }

  if (typeof tenantId !== "string" || !tenantId.trim()) {
    return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
  }
  const target = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ativo: true } });
  if (!target || !canUseActiveTenant(context.session.papel, context.baseTenantId, tenantId, target.ativo)) {
    return NextResponse.json({ error: "Tenant inexistente ou inativo" }, { status: 404 });
  }

  // Temporário: Admin Global pode selecionar tenant ativo até SupportGrant.
  const res = NextResponse.json({ active: tenantId, message: "Tenant alterado" });
  res.cookies.set("tenant_override", tenantId, tenantOverrideCookieOptions());
  return res;
}
