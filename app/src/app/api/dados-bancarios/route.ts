import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.dadoBancario.findMany({ where: { ativo: true }, orderBy: [{ banco: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { banco, agencia, conta, tipo, titular } = await req.json();
  if (!banco?.trim()) return NextResponse.json({ error: "Banco é obrigatório" }, { status: 400 });
  const item = await db.dadoBancario.create({ data: { banco: banco.trim(), agencia: agencia || null, conta: conta || null, tipo: tipo || null, titular: titular || null } });
  return NextResponse.json(item, { status: 201 });
}
