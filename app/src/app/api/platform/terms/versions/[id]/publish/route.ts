import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { readTermPdf } from "@/lib/term-storage";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    if (!actor.identityId) return NextResponse.json({ error: "Publicação exige PlatformAdmin com identidade atual." }, { status: 403 });
    const { id } = await params;
    const version = await prisma.termVersion.findUnique({ where: { id } });
    if (!version || version.status !== "DRAFT") return NextResponse.json({ error: "Somente rascunho pode ser publicado." }, { status: 409 });
    await readTermPdf(version.storageKey, version.sha256);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`term:${version.documentId}`}, 0))`;
      const fresh = await tx.termVersion.findUnique({ where: { id } });
      if (fresh?.status !== "DRAFT") throw Object.assign(new Error("Versão já publicada ou alterada."), { status: 409 });
      await tx.termVersion.updateMany({ where: { documentId: version.documentId, status: "PUBLISHED" }, data: { status: "RETIRED" } });
      await tx.termVersion.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedByIdentityId: actor.identityId! } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ published: true });
  } catch (error) {
    const status = (error as {status?: number}).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Falha ao publicar versão." : (error as Error).message }, { status });
  }
}
