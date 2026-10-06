import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin, requireSession } from "@/lib/tenant";
import { readTermPdf } from "@/lib/term-storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await prisma.termVersion.findUnique({ where: { id }, include: { document: true } });
    if (!version) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    let platform = false;
    try { await requirePlatformAdmin(); platform = true; } catch { /* contexto empresarial */ }
    if (!platform) {
      const { session } = await requireSession({ allowPendingTerms: true });
      if (version.status === "DRAFT") return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      // Documentos oficiais são globais; a sessão empresarial ativa limita a consulta autenticada.
      void session;
    }
    const bytes = await readTermPdf(version.storageKey, version.sha256);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=termo.pdf",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return NextResponse.json({ error: (error as {status?: number}).status ? (error as Error).message : "Documento indisponível." }, { status: (error as {status?: number}).status ?? 500 });
  }
}
