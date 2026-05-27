import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// PUT /api/status-tipos/[id] — atualizar status tipo
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { codigo, nome, cor, ordem } = body;

  if (!nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  try {
    const tipo = await db.statusManualTipo.update({
      where: { id },
      data: {
        ...(codigo !== undefined && { codigo: codigo.trim().toUpperCase() }),
        nome: nome.trim(),
        ...(cor !== undefined && { cor }),
        ...(ordem !== undefined && { ordem }),
      },
    });
    return NextResponse.json(tipo);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

// DELETE /api/status-tipos/[id] — desativar (soft delete)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db.statusManualTipo.update({
      where: { id },
      data: { ativo: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
