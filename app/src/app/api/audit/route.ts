import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { requireTenantPermission } from "@/lib/permissions";

function date(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error("Data inválida."), { status: 400 });
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error("Data inválida."), { status: 400 });
  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const view = params.get("view");
    let base: Prisma.AuditEventWhereInput;
    if (view === "tenant") {
      const { session } = await requireTenantPermission("acessos.auditoria.view");
      base = { tenantId: session.tenantId };
    } else if (view === "platform") {
      await requirePlatformAdmin();
      // Platform administration may inspect platform activity and support grants,
      // not arbitrary confidential membership activity in customer tenants.
      base = { OR: [{ tenantId: null }, { accessMode: "PLATFORM_ADMIN" }, { supportGrantId: { not: null } }] };
    } else throw Object.assign(new Error("Visão inválida."), { status: 400 });
    const from = date(params.get("from"));
    const to = date(params.get("to"), true);
    if (from && to && from > to) throw Object.assign(new Error("Período inválido."), { status: 400 });
    const match: Prisma.AuditEventWhereInput = {
      ...(from || to ? { occurredAt: { gte: from, lte: to } } : {}),
      ...(params.get("identityId") ? { actorIdentityId: params.get("identityId")! } : {}),
      ...(params.get("user") ? { actor: { nome: { contains: params.get("user")!.slice(0, 100), mode: "insensitive" } } } : {}),
      ...(params.get("action") ? { action: params.get("action")! } : {}),
      ...(params.get("type") ? { resourceType: params.get("type")! } : {}),
      ...(params.get("result") && ["SUCCESS", "DENIED", "FAILURE"].includes(params.get("result")!)
        ? { result: params.get("result") as "SUCCESS" | "DENIED" | "FAILURE" } : {}),
      ...(view === "platform" && params.get("tenantId") ? { tenantId: params.get("tenantId")! } : {}),
      ...(view === "platform" && params.get("supportGrantId") ? { supportGrantId: params.get("supportGrantId")! } : {}),
      ...(view === "platform" && params.get("platformAdminId") ? { platformAdminId: params.get("platformAdminId")! } : {}),
    };
    const page = Math.min(100, Math.max(1, Number(params.get("page") || 1) || 1));
    const events = await prisma.auditEvent.findMany({ where: { AND: [base, match] },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 100, take: 101,
      include: { actor: { select: { nome: true } }, tenant: { select: { nome: true } } },
    });
    return NextResponse.json({ rows: events.slice(0, 100).map(({ actor, tenant, ...event }) => ({
      ...event, actorName: actor?.nome ?? "Sistema", tenantName: tenant?.nome ?? null,
    })), hasMore: events.length > 100 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Falha ao consultar auditoria." : (error as Error).message },
      { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
