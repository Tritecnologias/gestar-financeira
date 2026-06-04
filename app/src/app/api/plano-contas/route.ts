import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.planoContas.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { codigo, descricao, tipo, paiId } = await req.json();
  if (!descricao?.trim() || !tipo) return NextResponse.json({ error: "Descrição e tipo são obrigatórios" }, { status: 400 });
  const item = await db.planoContas.create({ data: { codigo: codigo?.trim() || null, descricao: descricao.trim(), tipo, paiId: paiId || null } });
  return NextResponse.json(item, { status: 201 });
}
