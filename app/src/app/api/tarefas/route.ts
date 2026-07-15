import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.tarefa.findMany({ orderBy: [{ seq: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { nome } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const item = await db.tarefa.create({
    data: {
      nome: nome.trim(),
      status: "A Fazer!",
      colunas: [
        { nome: "O QUE", tipo: "Texto", ordem: 0 },
        { nome: "DESCRIÇÃO", tipo: "Texto", ordem: 1 },
        { nome: "STATUS", tipo: "Lista", ordem: 2 },
      ],
      linhas: [],
    },
  });
  return NextResponse.json(item, { status: 201 });
}
