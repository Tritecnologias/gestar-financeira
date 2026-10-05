import { NextRequest, NextResponse } from "next/server";
import { getIdentityAccess, requireSession } from "@/lib/tenant";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canUseActiveTenant, tenantContextCookieOptions, tenantOverrideCookieOptions } from "@/lib/access-policy";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  if (!legacyAuthEnabled) {
    let tenantId: unknown;
    try { ({ tenantId } = await req.json()); }
    catch { return NextResponse.json({ error: "Requisição inválida" }, { status: 400 }); }
    if (typeof tenantId !== "string" || !tenantId) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
    }
    try {
      const identity = await getIdentityAccess();
      const membership = identity.memberships.find(m => m.tenantId === tenantId);
      if (!membership) return NextResponse.json({ error: "Acesso ao tenant não permitido" }, { status: 403 });
      const res = NextResponse.json({ active: tenantId, role: membership.role });
      res.cookies.set("tenant_context", `${identity.id}:${identity.loginNonce}:${tenantId}`, tenantContextCookieOptions());
      return res;
    } catch (error) {
      return NextResponse.json({ error: "Não autenticado" }, { status: (error as {status?: number}).status ?? 401 });
    }
  }
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
