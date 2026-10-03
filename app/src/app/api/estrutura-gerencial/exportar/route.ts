import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createManagementStructureWorkbook, MANAGEMENT_STRUCTURE_FILENAME } from "@/lib/management-import-template";

export async function GET() {
  let db: Awaited<ReturnType<typeof requireSession>>["db"];
  try { ({ db } = await requireSession()); }
  catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  const [areas, centers] = await Promise.all([
    db.areaNegocio.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
    db.centroCusto.findMany({ where: { ativo: true }, select: { codigo: true, nome: true, areaId: true }, orderBy: { codigo: "asc" } }),
  ]);
  const areaCodes = new Map(areas.map(area => [area.id, area.codigo]));
  const exportCenters = centers.map(center => ({
    codigo: center.codigo,
    nome: center.nome,
    codigoArea: center.areaId ? areaCodes.get(center.areaId) : undefined,
  }));
  if (exportCenters.some(center => !center.codigoArea)) {
    return NextResponse.json({ error: "Há Centro de Custo ativo sem Área de Negócio ativa no tenant. Corrija o vínculo antes de baixar a estrutura." }, { status: 409 });
  }

  const workbook = createManagementStructureWorkbook(
    areas.map(area => ({ codigo: area.codigo, nome: area.nome })),
    exportCenters.map(center => ({ codigo: center.codigo, nome: center.nome, codigoArea: center.codigoArea! })),
  );
  return new NextResponse(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${MANAGEMENT_STRUCTURE_FILENAME}"`,
    "Cache-Control": "private, no-store",
  } });
}
