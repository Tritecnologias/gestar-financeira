import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, nome } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  try {
    const item = await db.centroCusto.update({ where: { id }, data: { codigo: codigo?.trim(), nome: nome.trim() } });
    return NextResponse.json(item);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    await db.centroCusto.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
