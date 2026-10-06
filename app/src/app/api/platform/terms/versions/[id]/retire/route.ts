import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;
    const updated = await prisma.termVersion.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "RETIRED" } });
    if (!updated.count) return NextResponse.json({ error: "Versão publicada não encontrada." }, { status: 409 });
    return NextResponse.json({ retired: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao retirar versão." }, { status: (error as {status?: number}).status ?? 500 });
  }
}
