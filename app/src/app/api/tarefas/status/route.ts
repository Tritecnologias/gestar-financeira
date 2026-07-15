import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.tarefaStatus.findMany({ orderBy: [{ ordem: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { nome, cor } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const item = await db.tarefaStatus.create({ data: { nome: nome.trim(), cor: cor || "#3b82f6" } });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { items } = await req.json();
  // Bulk update
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.id) await db.tarefaStatus.update({ where: { id: item.id }, data: { nome: item.nome, cor: item.cor, ordem: item.ordem ?? 0 } });
    }
  }
  return NextResponse.json({ ok: true });
}
