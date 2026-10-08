import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    const { id } = await params;
    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.termVersion.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "RETIRED" } });
      if (changed.count) await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: "TERM_VERSION_RETIRED", resourceType: "TermVersion", resourceId: id,
        changes: { before: { status: "PUBLISHED" }, after: { status: "RETIRED" } } });
      return changed;
    });
    if (!updated.count) return NextResponse.json({ error: "Versão publicada não encontrada." }, { status: 409 });
    return NextResponse.json({ retired: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao retirar versão." }, { status: (error as {status?: number}).status ?? 500 });
  }
}
