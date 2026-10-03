import { NextRequest, NextResponse } from "next/server";
import { requireEscrita, requireSession } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction } from "@/lib/product-catalog";

export async function GET() {
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produtoLinha.findMany({ orderBy: [{ codigo: "asc" }], include: { tipo: { select: { id: true, codigo: true, nome: true, grupo: true, ativo: true } } } }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar as Linhas.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    const tipoId = productText(input.tipoId, "Tipo", true, 80)!;
    const codigo = productText(input.codigo, "Código da Linha", true, 30)!;
    const nome = productText(input.nome, "Nome da Linha", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const type = await tx.produtoTipo.findFirst({ where: { id: tipoId, tenantId: session.tenantId, ativo: true } });
      if (!type) throw productError("Tipo inexistente, inativo ou de outro tenant.");
      return tx.produtoLinha.create({ data: { tipoId, codigo, nome } });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
