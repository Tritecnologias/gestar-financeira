import { withAccessRequest } from "@/lib/access-request-context";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { sameOrigin } from "@/lib/advisory-management";
import { lockContractualTenant, cancelContractualNomination } from "@/lib/contractual-onboarding";
import { currentContractualResponsible } from "@/lib/contractual-state";

type Params = { params: Promise<{ id: string }> };

async function handlePOST(req: NextRequest, { params }: Params) {
  try {
    sameOrigin(req);
    const actor = await requirePlatformAdmin();
    if (!actor.identityId) return NextResponse.json({ error: "Designação exige identidade PlatformAdmin." }, { status: 403 });
    const { id: tenantId } = await params;
    const { membershipId, confirm } = await req.json();
    if (typeof membershipId !== "string" || confirm !== true) return NextResponse.json({ error: "Selecione e confirme explicitamente o vínculo OWNER." }, { status: 400 });
    const result = await prisma.$transaction(async tx => {
      await lockContractualTenant(tx, tenantId);
      const membership = await tx.tenantMembership.findFirst({ where: {
        id: membershipId, tenantId, role: "OWNER", status: "ACTIVE", identity: { status: "ACTIVE" }, tenant: { ativo: true },
      }, select: { id: true, identityId: true } });
      if (!membership) throw Object.assign(new Error("Proprietário ativo desta empresa não encontrado."), { status: 409 });
      const current = await tx.tenantContractualResponsible.findUnique({ where: { tenantId } });
      if ((await currentContractualResponsible(tx, tenantId))?.membershipId === membershipId) return { membershipId, unchanged: true };
      await cancelContractualNomination(tx, tenantId, actor.identityId!, "Designação administrativa de contingência");
      await tx.tenantContractualResponsible.upsert({
        where: { tenantId },
        create: { tenantId, membershipId, assignedByIdentityId: actor.identityId! },
        update: { membershipId, assignedByIdentityId: actor.identityId!, assignedAt: new Date() },
      });
      await writeAudit(tx, { tenantId, actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: current ? "OWNER_REASSIGNED" : "OWNER_ASSIGNED",
        resourceType: "TenantContractualResponsible", resourceId: tenantId,
        changes: { before: { membershipId: current?.membershipId ?? null }, after: { membershipId } } });
      return { membershipId, unchanged: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return NextResponse.json(result);
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    const status = e.status ?? (["P2002", "P2034"].includes(e.code || "") ? 409 : 500);
    return NextResponse.json({ error: e.status ? e.message : status === 409 ? "A situação da empresa mudou. Atualize e tente novamente." : "Falha ao designar responsável contratual." }, { status });
  }
}

export const POST = withAccessRequest("CONTRACT_RESPONSIBLE", handlePOST);
