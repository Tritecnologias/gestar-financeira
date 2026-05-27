import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// GET /api/fornecedores — lista todos do tenant
export async function GET(req: NextRequest) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ativo = searchParams.get("ativo");

  // ⚡ tenantId injetado automaticamente via Extension
  const fornecedores = await db.fornecedor.findMany({
    where: { ...(ativo !== null ? { ativo: ativo !== "false" } : {}) },
    orderBy: [{ codigo: "asc" }],
  });

  return NextResponse.json(fornecedores.map((f: any) => ({ ...f, display: `${f.codigo} – ${f.nome}` })));
}

// POST /api/fornecedores — criar novo
export async function POST(req: NextRequest) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { codigo, nome } = body;

  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  }

  try {
    // ⚡ tenantId injetado automaticamente no create via Extension
    const fornecedor = await db.fornecedor.create({
      data: { codigo: codigo.trim().toUpperCase(), nome: nome.trim() },
    });
    return NextResponse.json({ ...fornecedor, display: `${fornecedor.codigo} – ${fornecedor.nome}` }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
