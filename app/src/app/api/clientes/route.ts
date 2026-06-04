import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.cliente.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { codigo, nome, email, telefone, documento, endereco } = await req.json();
  if (!codigo?.trim() || !nome?.trim()) return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  try {
    const item = await db.cliente.create({
      data: { codigo: codigo.trim().toUpperCase(), nome: nome.trim(), email: email || null, telefone: telefone || null, documento: documento || null, endereco: endereco || null },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
