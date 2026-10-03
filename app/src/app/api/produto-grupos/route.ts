import { NextRequest, NextResponse } from "next/server";
import { requireEscrita, requireSession } from "@/lib/tenant";
import { productApiError, productText, productTransaction } from "@/lib/product-catalog";

export async function GET() {
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produtoGrupo.findMany({ orderBy: { codigo: "asc" } }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar os Grupos.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    const codigo = productText(input.codigo, "Código do Grupo", true, 30)!;
    const nome = productText(input.nome, "Nome do Grupo", true)!;
    const item = await productTransaction(db, session.tenantId, tx => tx.produtoGrupo.create({ data: { codigo, nome } }));
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar o Grupo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
