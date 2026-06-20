import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, nome } = await req.json();
  try {
    const item = await db.areaNegocio.update({ where: { id }, data: { codigo: codigo?.trim(), nome: nome?.trim() } });
    return NextResponse.json(item);
  } catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try { await db.areaNegocio.update({ where: { id }, data: { ativo: false } }); return NextResponse.json({ ok: true }); }
  catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}
