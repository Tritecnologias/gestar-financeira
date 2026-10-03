import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createProductStructureWorkbook, PRODUCT_STRUCTURE_FILENAME } from "@/lib/product-import-template";

export async function GET() {
  try {
    const { db, session } = await requireSession();
    const [types, lines, items] = await Promise.all([
      db.produtoTipo.findMany({ where: { tenantId: session.tenantId, ativo: true }, orderBy: [{ grupo: "asc" }, { codigo: "asc" }] }),
      db.produtoLinha.findMany({ where: { tenantId: session.tenantId, ativo: true }, orderBy: { codigo: "asc" } }),
      db.produto.findMany({ where: { tenantId: session.tenantId, ativo: true }, orderBy: { codigo: "asc" } }),
    ]);
    const typeById = new Map(types.map(type => [type.id, type]));
    const lineById = new Map(lines.map(line => [line.id, line]));
    const ambiguousTypeCodes = new Set<string>();
    const counts = new Map<string, number>();
    for (const type of types) counts.set(type.codigo, (counts.get(type.codigo) || 0) + 1);
    for (const [code, count] of counts) if (count > 1) ambiguousTypeCodes.add(code);
    if (lines.some(line => !typeById.has(line.tipoId) || ambiguousTypeCodes.has(typeById.get(line.tipoId)!.codigo))) {
      return NextResponse.json({ error: "Há Linha cujo CODIGO_TIPO é ambíguo entre Grupos ou cujo Tipo não está ativo. Ajuste a classificação antes de exportar." }, { status: 409 });
    }
    if (items.some(item => !item.tipoId || !item.tipo || !typeById.has(item.tipoId) || typeById.get(item.tipoId)!.grupo !== item.tipo || (item.linhaId && (!lineById.has(item.linhaId) || lineById.get(item.linhaId)!.tipoId !== item.tipoId)))) {
      return NextResponse.json({ error: "Há Item ativo sem classificação válida. Classifique o legado antes de baixar a estrutura para manutenção." }, { status: 409 });
    }
    const workbook = createProductStructureWorkbook(
      types.map(type => ({ grupo: type.grupo, codigo: type.codigo, nome: type.nome })),
      lines.map(line => ({ codigoTipo: typeById.get(line.tipoId)!.codigo, codigo: line.codigo, nome: line.nome })),
      items.map(item => ({ codigo: item.codigo, nome: item.nome, grupo: item.tipo!, codigoTipo: typeById.get(item.tipoId!)!.codigo, codigoLinha: item.linhaId ? lineById.get(item.linhaId)!.codigo : "", descricao: item.descricao || "", unidade: item.unidade || "", precoVenda: item.precoVenda?.toString() || "", precoCusto: item.precoCusto?.toString() || "", observacoes: item.observacoes || "" })),
    );
    return new NextResponse(workbook, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${PRODUCT_STRUCTURE_FILENAME}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.status === 401 ? "Não autorizado" : "Não foi possível baixar a estrutura deste tenant." }, { status: error?.status === 401 ? 401 : 500 });
  }
}
