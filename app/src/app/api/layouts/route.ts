import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// GET /api/layouts — lista layouts do usuário logado
export async function GET(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // ⚡ tenantId injetado automaticamente; filtramos apenas pelo usuário
  const layouts = await db.layoutColunas.findMany({
    where: { usuarioId: session.id },
    orderBy: [{ isDefault: "desc" }, { criadoEm: "asc" }],
    select: { id: true, nome: true, colunas: true, isDefault: true, criadoEm: true },
  });

  return NextResponse.json(layouts);
}

// POST /api/layouts — salvar novo layout
export async function POST(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { nome, colunas, isDefault } = body;

  if (!nome?.trim() || !Array.isArray(colunas)) {
    return NextResponse.json({ error: "Nome e colunas são obrigatórios" }, { status: 400 });
  }

  if (isDefault) {
    // ⚡ updateMany já injeta tenantId no WHERE via Extension
    await db.layoutColunas.updateMany({
      where: { usuarioId: session.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  // ⚡ tenantId injetado automaticamente no create
  const layout = await db.layoutColunas.create({
    data: { usuarioId: session.id, nome: nome.trim(), colunas, isDefault: isDefault ?? false },
  });

  return NextResponse.json(layout, { status: 201 });
}
