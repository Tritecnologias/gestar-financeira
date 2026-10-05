import { NextRequest, NextResponse } from "next/server";
import { getIdentityAccess, requirePlatformAdmin, requireSession } from "@/lib/tenant";
import { legacyAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emailEqualsNormalized, normalizeEmail } from "@/lib/email";

// GET /api/tenants — lista todos os tenants (apenas admin_global)
export async function GET() {
  if (!legacyAuthEnabled) {
    try {
      const identity = await getIdentityAccess();
      const tenants = identity.memberships.map(m => ({
        id: m.tenantId, nome: m.tenant.nome, membershipId: m.id, role: m.role,
        isActive: false,
      }));
      const { cookies } = await import("next/headers");
      const selected = (await cookies()).get("tenant_context")?.value;
      const cookiePrefix = `${identity.id}:${identity.loginNonce}:`;
      const activeId = tenants.length === 1 ? tenants[0].id
        : selected?.startsWith(cookiePrefix) ? selected.slice(cookiePrefix.length) : null;
      return NextResponse.json(tenants.map(t => ({ ...t, isActive: t.id === activeId })));
    } catch (error) {
      return NextResponse.json({ error: "Não autenticado" }, { status: (error as {status?: number}).status ?? 401 });
    }
  }
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, slug: true, email: true, plano: true },
    orderBy: [{ nome: "asc" }],
  });

  const enriched = tenants.map(t => ({
    ...t,
    isActive: t.id === session.tenantId,
  }));

  const res = NextResponse.json(enriched);
  res.headers.set("X-Active-Tenant-Id", session.tenantId);
  res.headers.set("X-Active-Tenant-Nome", encodeURIComponent(session.tenantNome));
  return res;
}

// POST /api/tenants — criar novo tenant (apenas admin_global)
export async function POST(req: NextRequest) {
  try { await requirePlatformAdmin(); }
  catch (error) { return NextResponse.json({ error: "Acesso negado" }, { status: (error as {status?: number}).status ?? 403 }); }

  const { nome, email, plano } = await req.json();
  if (typeof nome !== "string" || typeof email !== "string" || !nome.trim() || !normalizeEmail(email)) {
    return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });
  }
  if (plano !== undefined && !["trial", "mensal", "anual"].includes(plano)) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  }

  // Gerar slug a partir do nome
  const slug = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!slug) return NextResponse.json({ error: "Nome precisa conter letras ou números para gerar o identificador." }, { status: 400 });

  // Verificar unicidade
  const existente = await prisma.tenant.findFirst({ where: { OR: [{ slug }, { email: emailEqualsNormalized(email) }] } });
  if (existente) return NextResponse.json({ error: "Nome ou email já cadastrado" }, { status: 409 });

  const tenant = await prisma.tenant.create({
    data: { nome: nome.trim(), slug, email: normalizeEmail(email), plano: plano || "trial" },
    select: { id: true, nome: true, slug: true, email: true, plano: true },
  });

  return NextResponse.json(tenant, { status: 201 });
}
