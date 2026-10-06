import { NextRequest, NextResponse } from "next/server";
import { getIdentityAccess, requireSession } from "@/lib/tenant";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tenantContextCookieOptions, tenantOverrideCookieOptions } from "@/lib/access-policy";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  if (!legacyAuthEnabled) {
    let tenantId: unknown;
    let grantId: unknown;
    try { ({ tenantId, grantId } = await req.json()); }
    catch { return NextResponse.json({ error: "Requisição inválida" }, { status: 400 }); }
    if (typeof tenantId !== "string" || !tenantId) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
    }
    try {
      const identity = await getIdentityAccess();
      const membership = identity.memberships.find(m => m.tenantId === tenantId);
      if (grantId !== undefined) {
        if (typeof grantId !== "string" || !grantId || membership || identity.platformAdmin?.status !== "ACTIVE") {
          return NextResponse.json({ error: "Contexto de suporte inválido" }, { status: 403 });
        }
        const grant = await prisma.supportGrant.findFirst({ where: {
          id: grantId, tenantId, platformAdminIdentityId: identity.id, status: "ACTIVE",
          startsAt: { lte: new Date() }, expiresAt: { gt: new Date() }, tenant: { ativo: true },
        }, select: { id: true, tenantId: true } });
        if (!grant) return NextResponse.json({ error: "Acesso de suporte ausente, revogado ou expirado" }, { status: 403 });
        await prisma.supportGrantEvent.create({ data: { grantId: grant.id, tenantId: grant.tenantId,
          type: "USED", actorIdentityId: identity.id, detail: "Entrada no contexto de suporte." } });
        const res = NextResponse.json({ active: tenantId, kind: "SUPPORT_GRANT" });
        res.cookies.set("support_context", `${identity.id}:${identity.loginNonce}:${grant.id}`, tenantContextCookieOptions());
        res.cookies.set("tenant_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
        return res;
      }
      if (!membership) return NextResponse.json({ error: "Acesso ao tenant não permitido" }, { status: 403 });
      const res = NextResponse.json({ active: tenantId, role: membership.role, kind: "MEMBERSHIP" });
      res.cookies.set("tenant_context", `${identity.id}:${identity.loginNonce}:${tenantId}`, tenantContextCookieOptions());
      res.cookies.set("support_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
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
  return NextResponse.json({ error: "Troca empresarial entre tenants exige SupportGrant no modo de identidade." }, { status: 403 });
}
