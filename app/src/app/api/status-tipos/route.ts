import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// GET /api/status-tipos — lista status manuais do tenant
export async function GET(req: NextRequest) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // ⚡ tenantId injetado automaticamente via Extension
  const tipos = await db.statusManualTipo.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });

  return NextResponse.json(tipos);
}

// POST /api/status-tipos — criar novo
export async function POST(req: NextRequest) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { codigo, nome, cor, ordem } = body;

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  }

  try {
    // ⚡ tenantId injetado automaticamente no create via Extension
    const tipo = await db.statusManualTipo.create({
      data: {
        codigo: codigo.trim().toUpperCase(),
        nome: nome.trim(),
        cor: cor ?? "#94a3b8",
        ordem: ordem ?? 0,
      },
    });
    return NextResponse.json(tipo, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
