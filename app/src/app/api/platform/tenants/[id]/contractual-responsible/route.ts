import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    if (!actor.identityId) return NextResponse.json({ error: "Designação exige identidade PlatformAdmin." }, { status: 403 });
    const { id: tenantId } = await params;
    const { membershipId, confirm } = await req.json();
    if (typeof membershipId !== "string" || confirm !== true) return NextResponse.json({ error: "Selecione e confirme explicitamente o vínculo OWNER." }, { status: 400 });
    const membership = await prisma.tenantMembership.findFirst({ where: {
      id: membershipId, tenantId, role: "OWNER", status: "ACTIVE", identity: { status: "ACTIVE" }, tenant: { ativo: true },
    }, select: { id: true, identityId: true } });
    if (!membership) return NextResponse.json({ error: "OWNER ativo deste tenant não encontrado." }, { status: 409 });
    const current = await prisma.tenantContractualResponsible.findUnique({ where: { tenantId } });
    if (current?.membershipId === membershipId) return NextResponse.json({ membershipId, unchanged: true });
    await prisma.tenantContractualResponsible.upsert({
      where: { tenantId },
      create: { tenantId, membershipId, assignedByIdentityId: actor.identityId },
      update: { membershipId, assignedByIdentityId: actor.identityId, assignedAt: new Date() },
    });
    return NextResponse.json({ membershipId });
  } catch (error) {
    return NextResponse.json({ error: (error as {status?: number}).status ? (error as Error).message : "Falha ao designar responsável contratual." }, { status: (error as {status?: number}).status ?? 500 });
  }
}
