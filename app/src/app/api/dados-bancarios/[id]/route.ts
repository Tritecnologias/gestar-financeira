import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { banco, agencia, conta, tipo, titular } = await req.json();
  try {
    const item = await db.dadoBancario.update({ where: { id }, data: { banco: banco?.trim(), agencia: agencia || null, conta: conta || null, tipo: tipo || null, titular: titular || null } });
    return NextResponse.json(item);
  } catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try { await db.dadoBancario.update({ where: { id }, data: { ativo: false } }); return NextResponse.json({ ok: true }); }
  catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}
