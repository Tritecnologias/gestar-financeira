import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// GET /api/status-tipos/config — retorna título da tabela de apoio
export async function GET() {
  let session: any;
  try {
    ({ session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { tituloTabelaStatus: true },
  });

  return NextResponse.json({ titulo: tenant?.tituloTabelaStatus ?? "VALOR PREVISTO" });
}

// PUT /api/status-tipos/config — atualiza título da tabela de apoio
export async function PUT(req: NextRequest) {
  let session: any;
  try {
    ({ session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { titulo } = body;

  if (!titulo?.trim()) {
    return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { tituloTabelaStatus: titulo.trim() },
  });

  return NextResponse.json({ titulo: titulo.trim() });
}
