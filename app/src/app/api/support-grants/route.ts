import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getIdentityAccess, requirePlatformAdmin } from "@/lib/tenant";
import { requireSupportApprover } from "@/lib/support-approval";
import { expireListedSupportGrants } from "@/lib/support-grants";
import { SUPPORT_MINUTES, validSupportModules } from "@/lib/support-policy";

const noStore = { "Cache-Control": "private, no-store" };
const withDetails = {
  tenant: { select: { id: true, nome: true } },
  requester: { select: { id: true, nome: true, email: true } },
  events: { orderBy: { createdAt: "asc" as const }, select: { type: true, createdAt: true, detail: true } },
} as const;

function fail(error: unknown) {
  const cause = error as { status?: number; code?: string };
  const status = cause.status ?? (cause.code === "P2034" || cause.code === "P2002" ? 409 : 500);
  return NextResponse.json({ error: cause.status ? (error as Error).message :
    status === 409 ? "Solicitação alterada simultaneamente. Atualize e tente novamente." : "Falha ao processar acesso de suporte." }, { status, headers: noStore });
}

export async function GET(req: NextRequest) {
  try {
    const view = req.nextUrl.searchParams.get("view");
    let where: Prisma.SupportGrantWhereInput;
    if (view === "platform") {
      const actor = await requirePlatformAdmin();
      if (!actor.identityId) throw Object.assign(new Error("Modo de identidade necessário."), { status: 403 });
      where = { platformAdminIdentityId: actor.identityId };
    } else if (view === "tenant") {
      const { session } = await requireSupportApprover();
      where = { tenantId: session.tenantId };
    } else throw Object.assign(new Error("Visão inválida."), { status: 400 });
    let grants = await prisma.supportGrant.findMany({ where, include: withDetails, orderBy: { requestedAt: "desc" } });
    if (grants.some(g => g.status === "ACTIVE" && g.expiresAt && g.expiresAt <= new Date())) {
      await expireListedSupportGrants(grants);
      grants = await prisma.supportGrant.findMany({ where, include: withDetails, orderBy: { requestedAt: "desc" } });
    }
    return NextResponse.json(grants.map(g => ({ ...g,
      status: g.status === "ACTIVE" && g.expiresAt && g.expiresAt <= new Date() ? "EXPIRED" : g.status,
    })), { headers: noStore });
  } catch (error) { return fail(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformAdmin();
    if (!actor.identityId) throw Object.assign(new Error("Modo de identidade necessário."), { status: 403 });
    const body = await req.json().catch(() => { throw Object.assign(new Error("JSON inválido."), { status: 400 }); });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Solicitação inválida."), { status: 400 });
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const minutes = Number(body.requestedMinutes);
    const accessLevel = body.accessLevel ?? "READ_ONLY";
    const genericReason = ["suporte", "suporte tecnico", "investigacao de erro", "homologacao assistida", "correcao autorizada", "teste"];
    const normalizedReason = reason.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!tenantId || reason.length < 15 || reason.length > 500 || genericReason.includes(normalizedReason) ||
        !validSupportModules(body.modules) ||
        !Number.isInteger(minutes) || minutes < SUPPORT_MINUTES.min || minutes > SUPPORT_MINUTES.max ||
        !["READ_ONLY", "OPERATIONAL"].includes(accessLevel)) {
      throw Object.assign(new Error("Informe tenant, motivo específico (15–500 caracteres), escopo, nível e duração de 15 a 1440 minutos."), { status: 400 });
    }
    const identity = await getIdentityAccess();
    if (identity.memberships.some(m => m.tenantId === tenantId)) {
      throw Object.assign(new Error("Use o membership normal neste tenant."), { status: 409 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ativo: true } });
    if (!tenant?.ativo) throw Object.assign(new Error("Tenant indisponível."), { status: 404 });
    const responsible = await prisma.tenantContractualResponsible.findUnique({
      where: { tenantId }, include: { membership: { include: { identity: { select: { status: true } } } } },
    });
    if (!responsible || responsible.membership.role !== "OWNER" || responsible.membership.status !== "ACTIVE" ||
        responsible.membership.identity.status !== "ACTIVE") {
      throw Object.assign(new Error("Tenant sem responsável contratual OWNER ativo para decidir suporte."), { status: 409 });
    }
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`support:${actor.identityId}:${tenantId}`}, 0))`;
      const existing = await tx.supportGrant.findFirst({ where: { tenantId, platformAdminIdentityId: actor.identityId!,
        OR: [{ status: "PENDING" }, { status: "ACTIVE", expiresAt: { gt: new Date() } }] }, select: { id: true } });
      if (existing) throw Object.assign(new Error("Já existe solicitação pendente ou acesso ativo para este tenant."), { status: 409 });
      const grant = await tx.supportGrant.create({ data: {
        tenantId, platformAdminIdentityId: actor.identityId!, reason, modules: body.modules,
        accessLevel, requestedMinutes: minutes,
      } });
      await tx.supportGrantEvent.create({ data: { grantId: grant.id, tenantId, type: "REQUESTED",
        actorIdentityId: actor.identityId, detail: `${accessLevel}; ${body.modules.join(",")}; ${minutes} min` } });
      return grant;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { status: 201, headers: noStore });
  } catch (error) { return fail(error); }
}
