import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { contractualReadiness } from "@/lib/contractual-state";

/** Catálogo administrativo; nunca concede acesso operacional ao tenant. */
export async function GET() {
  try { await requirePlatformAdmin(); }
  catch (error) { return NextResponse.json({ error: "Acesso negado" }, { status: (error as {status?: number}).status ?? 403 }); }
  const tenants = await prisma.tenant.findMany({
    select: { id: true, nome: true, slug: true, email: true, plano: true, ativo: true,
      _count: { select: { memberships: true } },
      memberships: { where: { role: "OWNER", status: "ACTIVE", identity: { status: "ACTIVE" } }, select: { id: true } },
      contractualResponsible: { select: { membershipId: true,
        membership: { select: { status: true, role: true, identity: { select: { status: true } } } } } },
      ownerEvents: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(await Promise.all(tenants.map(async ({ memberships, ownerEvents, contractualResponsible, ...tenant }) => {
    const ready = await contractualReadiness(prisma, tenant.id);
    return {
    ...tenant, activeOwnerCount: memberships.length, lastOwnerDesignationAt: ownerEvents[0]?.createdAt ?? null,
    contractualResponsibleMembershipId: contractualResponsible?.membershipId ?? null,
    contractualResponsibleReady: contractualResponsible?.membership.status === "ACTIVE" &&
      contractualResponsible.membership.role === "OWNER" &&
      contractualResponsible.membership.identity.status === "ACTIVE",
    contractualStatus: ready.active ? "Contrato ativo" : ready.validResponsible ? "Aguardando aceite" : "Responsável Contratual pendente",
  }; })));
}
