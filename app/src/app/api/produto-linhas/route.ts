import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita, requireSession } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction, reserveProductCode } from "@/lib/product-catalog";

export async function GET() {
  const access = await guardApi("estrutura.portfolio.view"); if (access) return access;
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produtoLinha.findMany({ orderBy: [{ codigo: "asc" }], include: { tipo: { select: { id: true, codigo: true, nome: true, grupoId: true, ativo: true } } } }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar as Linhas.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.portfolio.create"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    const tipoId = productText(input.tipoId, "Tipo", true, 80)!;
    if (input.codigo) throw productError("Código da Linha é gerado automaticamente.");
    const nome = productText(input.nome, "Nome da Linha", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const type = await tx.produtoTipo.findFirst({ where: { id: tipoId, tenantId: session.tenantId, ativo: true } });
      if (!type || !type.grupoId) throw productError("Tipo inexistente, inativo ou de outro tenant.");
      const group = await tx.produtoGrupo.findFirst({ where: { id: type.grupoId, tenantId: session.tenantId, ativo: true } });
      if (!group) throw productError("Grupo do Tipo está inativo ou de outro tenant.");
      const codigo = await reserveProductCode(tx, session.tenantId, "linha", type);
      return tx.produtoLinha.create({ data: { tipoId, codigo, nome } });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
