import { NextResponse } from "next/server";
import { requireSupportOperator } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { readTermPdf } from "@/lib/term-storage";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSupportOperator();
    const version = await prisma.termVersion.findFirst({ where: { id: (await params).id, status: "PUBLISHED", document: { audience: "USUARIO" } } });
    if (!version) return NextResponse.json({ error: "Documento pessoal indisponível." }, { status: 404 });
    return new NextResponse(new Uint8Array(await readTermPdf(version.storageKey, version.sha256)), { headers: {
      "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=termo-pessoal.pdf", "X-Content-Type-Options": "nosniff",
      "X-Term-Version-Id": version.id, "X-Term-Sha256": version.sha256 } });
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Documento pessoal indisponível." }, { status: e.status ?? 500 }); }
}
