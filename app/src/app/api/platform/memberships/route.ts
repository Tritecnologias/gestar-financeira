import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const memberships = await prisma.tenantMembership.findMany({
      select: { id: true, role: true, status: true,
        identity: { select: { id: true, nome: true, email: true } },
        tenant: { select: { id: true, nome: true } },
        profile: { select: { id: true, nome: true } } },
      orderBy: { tenant: { nome: "asc" } },
    });
    return NextResponse.json(memberships);
  } catch (error: any) {
    return NextResponse.json({ error: error?.status ? error.message : "Falha ao consultar vínculos." }, { status: error?.status ?? 500 });
  }
}
