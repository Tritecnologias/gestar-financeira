import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  try { await requirePlatformAdmin(); }
  catch { return NextResponse.json({ error: "Acesso negado." }, { status: 403 }); }
  const documents = await prisma.termDocument.findMany({
    include: { versions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { acceptances: true } }, publishedBy: { select: { nome: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(documents, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformAdmin();
    const body = await req.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(code) || !["CONTRATANTE", "USUARIO"].includes(body.audience) || typeof body.required !== "boolean") {
      return NextResponse.json({ error: "Código, audiência e obrigatoriedade são necessários." }, { status: 400 });
    }
    const document = await prisma.$transaction(async tx => {
      const created = await tx.termDocument.create({ data: { code, audience: body.audience, required: body.required } });
      await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: "TERM_DOCUMENT_CREATED", resourceType: "TermDocument", resourceId: created.id,
        metadata: { code, audience: body.audience, required: body.required } });
      return created;
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    const status = (error as {code?: string}).code === "P2002" ? 409 : (error as {status?: number}).status ?? 500;
    return NextResponse.json({ error: status === 409 ? "Código já cadastrado." : status === 500 ? "Falha ao criar documento." : (error as Error).message }, { status });
  }
}
