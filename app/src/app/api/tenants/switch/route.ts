import { authorizedAdvisoryGrant } from "@/lib/advisory-authorization";
import { sameOrigin } from "@/lib/advisory-management";
import { NextRequest, NextResponse } from "next/server";
import { getIdentityAccess, requireSession } from "@/lib/tenant";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tenantContextCookieOptions, tenantOverrideCookieOptions } from "@/lib/access-policy";
import { writeAudit } from "@/lib/audit";
import { authorizedSupportGrant, lockSupportOperator } from "@/lib/support-authorization";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  if (!legacyAuthEnabled) {
    try { sameOrigin(req); } catch { return NextResponse.json({ error: "Origem inválida." }, { status: 403 }); }
    let tenantId: unknown;
    let grantId: unknown;
    let advisoryGrantId: unknown;
    try { ({ tenantId, grantId, advisoryGrantId } = await req.json()); }
    catch { return NextResponse.json({ error: "Requisição inválida" }, { status: 400 }); }
    if (typeof tenantId !== "string" || !tenantId) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
    }
    try {
      const identity = await getIdentityAccess();
      const membership = identity.memberships.find(m => m.tenantId === tenantId);
      if (advisoryGrantId !== undefined) {
        if (grantId !== undefined || typeof advisoryGrantId !== "string") return NextResponse.json({ error: "Contexto inválido." }, { status: 400 });
        const grant = await authorizedAdvisoryGrant(prisma, identity.id, advisoryGrantId, tenantId);
        await writeAudit(prisma, { tenantId, actorIdentityId: identity.id, advisoryGrantId: grant.id,
          accessMode: "ADVISORY", action: "ADVISORY_CONTEXT_ENTERED", resourceType: "AdvisoryAccessGrant", resourceId: grant.id });
        const res = NextResponse.json({ active: tenantId, kind: "ADVISORY" });
        res.cookies.set("advisory_context", `${identity.id}:${identity.loginNonce}:${grant.id}`, tenantContextCookieOptions());
        for (const name of ["support_context", "tenant_context"]) res.cookies.set(name, "", { ...tenantContextCookieOptions(), maxAge: 0 });
        return res;
      }
      if (grantId !== undefined) {
        if (typeof grantId !== "string" || !grantId || membership || identity.supportOperator?.status !== "ACTIVE") {
          return NextResponse.json({ error: "Contexto de suporte inválido" }, { status: 403 });
        }
        const previous = req.cookies.get("tenant_context")?.value || req.cookies.get("support_context")?.value;
        await prisma.$transaction(async tx => {
          await lockSupportOperator(tx, identity.id);
          const grant = await authorizedSupportGrant(tx, identity.id, grantId, tenantId);
          await tx.supportGrantEvent.create({ data: { grantId: grant.id, tenantId: grant.tenantId,
            type: "USED", actorIdentityId: identity.id, detail: "Entrada no contexto de suporte." } });
          await writeAudit(tx, { tenantId, actorIdentityId: identity.id, accessMode: "SUPPORT_GRANT",
            action: "SUPPORT_CONTEXT_ENTERED", resourceType: "SupportGrant", resourceId: grant.id,
            supportGrantId: grant.id });
          await writeAudit(tx, { tenantId, actorIdentityId: identity.id, accessMode: "SUPPORT_GRANT",
            action: previous ? "TENANT_CONTEXT_SWITCHED" : "TENANT_CONTEXT_SELECTED",
            resourceType: "Tenant", resourceId: tenantId, supportGrantId: grant.id });
        });
        const res = NextResponse.json({ active: tenantId, kind: "SUPPORT_GRANT" });
        res.cookies.set("advisory_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
        res.cookies.set("support_context", `${identity.id}:${identity.loginNonce}:${grantId}`, tenantContextCookieOptions());
        res.cookies.set("tenant_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
        return res;
      }
      if (!membership) return NextResponse.json({ error: "Acesso ao tenant não permitido" }, { status: 403 });
      const previous = req.cookies.get("tenant_context")?.value || req.cookies.get("support_context")?.value;
      await writeAudit(prisma, { tenantId, actorIdentityId: identity.id, actorMembershipId: membership.id,
        accessMode: "MEMBERSHIP", action: previous ? "TENANT_CONTEXT_SWITCHED" : "TENANT_CONTEXT_SELECTED",
        resourceType: "Tenant", resourceId: tenantId });
      const res = NextResponse.json({ active: tenantId, role: membership.role, kind: "MEMBERSHIP" });
      res.cookies.set("advisory_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
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
