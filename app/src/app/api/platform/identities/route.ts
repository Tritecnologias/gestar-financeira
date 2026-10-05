import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const identities = await prisma.authIdentity.findMany({
      select: { id: true, nome: true, email: true, status: true,
        platformAdmin: { select: { status: true } },
        memberships: { select: { id: true, role: true, status: true,
          tenant: { select: { id: true, nome: true } } } } },
      orderBy: { nome: "asc" },
    });
    return NextResponse.json(identities);
  } catch (error: any) {
    return NextResponse.json({ error: error?.status ? error.message : "Falha ao consultar identidades." }, { status: error?.status ?? 500 });
  }
}
