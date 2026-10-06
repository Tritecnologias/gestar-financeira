import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { discardTermPdf, saveTermPdf } from "@/lib/term-storage";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let storageKey: string | null = null;
  try {
    await requirePlatformAdmin();
    const { id: documentId } = await params;
    const document = await prisma.termDocument.findUnique({ where: { id: documentId }, select: { id: true } });
    if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const form = await req.formData();
    const file = form.get("file");
    const version = String(form.get("version") || "").trim();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const requiresReaccept = form.get("requiresReaccept") === "true";
    if (!(file instanceof File) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(version) ||
      !title || title.length > 200 || description.length > 1000 || !["true", "false"].includes(String(form.get("requiresReaccept")))) {
      return NextResponse.json({ error: "Informe PDF, versão, título e regra de reaceite válidos." }, { status: 400 });
    }
    const stored = await saveTermPdf(file);
    storageKey = stored.storageKey;
    const created = await prisma.termVersion.create({ data: {
      documentId, version, title, description: description || null,
      ...stored, requiresReaccept,
    } });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (storageKey) await discardTermPdf(storageKey);
    const status = (error as {code?: string}).code === "P2002" ? 409 : (error as {status?: number}).status ?? 500;
    return NextResponse.json({ error: status === 409 ? "Versão já cadastrada." : status === 500 ? "Falha ao criar versão." : (error as Error).message }, { status });
  }
}
