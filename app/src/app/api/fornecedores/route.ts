import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { defaultAccountRelation, profileData, validateDefaultAccount } from "@/lib/registration-profile";

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
    include: defaultAccountRelation,
  });

  return NextResponse.json(fornecedores.map((f: any) => ({ ...f, display: `${f.codigo} – ${f.nome}` })));
}

// POST /api/fornecedores — criar novo
export async function POST(req: NextRequest) {
  let db: any, tenantId: string;
  try {
    const context = await requireEscrita();
    db = context.db; tenantId = context.session.tenantId;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 });
  }

  try {
    const data = profileData(await req.json(), "create");
    await validateDefaultAccount(db, tenantId, data);
    const fornecedor = await db.fornecedor.create({ data });
    return NextResponse.json({ ...fornecedor, display: `${fornecedor.codigo} – ${fornecedor.nome}` }, { status: 201 });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2003") return NextResponse.json({ error: "Conta padrão inválida ou de outro tenant" }, { status: 400 });
    throw e;
  }
}
