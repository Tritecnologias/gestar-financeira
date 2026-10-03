import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createProductStructureWorkbook, PRODUCT_STRUCTURE_FILENAME } from "@/lib/product-import-template";

export async function GET() {
  try {
    const { db, session } = await requireSession();
    const [groups, allTypes, lines, items] = await Promise.all([
      db.produtoGrupo.findMany({ where: { tenantId: session.tenantId, ativo: true }, orderBy: { codigo: "asc" } }),
      db.produtoTipo.findMany({ where: { tenantId: session.tenantId, grupoId: { not: null } }, orderBy: [{ codigo: "asc" }] }),
      db.produtoLinha.findMany({ where: { tenantId: session.tenantId, ativo: true }, orderBy: { codigo: "asc" } }),
      db.produto.findMany({ where: { tenantId: session.tenantId, ativo: true, grupoId: { not: null } }, orderBy: { codigo: "asc" } }),
    ]);
    const types = allTypes.filter(type => type.ativo);
    const groupById = new Map(groups.map(group => [group.id, group]));
    const typeById = new Map(types.map(type => [type.id, type]));
    const allTypeById = new Map(allTypes.map(type => [type.id, type]));
    const structuredLines = lines.filter(line => typeById.has(line.tipoId));
    const lineById = new Map(structuredLines.map(line => [line.id, line]));
    if (types.some(type => !groupById.has(type.grupoId!))) {
      return NextResponse.json({ error: "Há Tipo ativo vinculado a Grupo inativo. Ajuste a estrutura antes de exportar." }, { status: 409 });
    }
    if (lines.some(line => { const type = allTypeById.get(line.tipoId); return type && (!type.ativo || !groupById.has(type.grupoId!)); })) {
      return NextResponse.json({ error: "Há Linha ativa com Tipo ou Grupo inativo. Ajuste a classificação antes de exportar." }, { status: 409 });
    }
    if (items.some(item => !item.tipoId || !typeById.has(item.tipoId) || typeById.get(item.tipoId)!.grupoId !== item.grupoId || !groupById.has(item.grupoId!) || (item.linhaId && (!lineById.has(item.linhaId) || lineById.get(item.linhaId)!.tipoId !== item.tipoId)))) {
      return NextResponse.json({ error: "Há Item ativo sem classificação válida. Classifique o legado antes de baixar a estrutura para manutenção." }, { status: 409 });
    }
    const workbook = createProductStructureWorkbook(
      groups.map(group => ({ codigo: group.codigo, nome: group.nome })),
      types.map(type => ({ codigoGrupo: groupById.get(type.grupoId!)!.codigo, codigo: type.codigo, nome: type.nome })),
      structuredLines.map(line => ({ codigoGrupo: groupById.get(typeById.get(line.tipoId)!.grupoId!)!.codigo, codigoTipo: typeById.get(line.tipoId)!.codigo, codigo: line.codigo, nome: line.nome })),
      items.map(item => ({ codigo: item.codigo, nome: item.nome, codigoGrupo: groupById.get(item.grupoId!)!.codigo, codigoTipo: typeById.get(item.tipoId!)!.codigo, codigoLinha: item.linhaId ? lineById.get(item.linhaId)!.codigo : "", descricao: item.descricao || "", unidade: item.unidade || "", precoVenda: item.precoVenda?.toString() || "", precoCusto: item.precoCusto?.toString() || "", observacoes: item.observacoes || "" })),
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
