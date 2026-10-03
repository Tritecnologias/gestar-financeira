import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { profileData, validateDefaultAccount } from "@/lib/registration-profile";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any, tenantId: string;
  try { const context = await requireSession(); db = context.db; tenantId = context.session.tenantId; } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    const data = profileData(await req.json(), "update");
    await validateDefaultAccount(db, tenantId, data);
    const item = await db.fornecedor.update({ where: { id }, data });
    return NextResponse.json({ ...item, display: `${item.codigo} – ${item.nome}` });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    if (e.code === "P2003") return NextResponse.json({ error: "Conta padrão inválida ou de outro tenant" }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    await db.fornecedor.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
