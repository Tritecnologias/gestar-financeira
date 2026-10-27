import { withAdvisoryAudit } from "@/lib/advisory-request";
import { structureImportRoute } from "@/lib/structure-import-route";
import { parseManagementWorkbook, validateManagementWorkbook, type ImportPreview } from "@/lib/management-import";

export const runtime = "nodejs";
const advisoryPOST = structureImportRoute({
  contract: "MANAGEMENT", permission: "estrutura.empresa.import",
  parse: parseManagementWorkbook, validate: validateManagementWorkbook,
  locks: tenantId => [`management-import:${tenantId}`],
  async apply(tx: any, preview: ImportPreview, tenantId: string) {

      const areaCodes = preview.areas.map(row => row.codigo);
      const centerCodes = preview.centros.map(row => row.codigo);
      const oldAreas = areaCodes.length ? await tx.areaNegocio.findMany({ where: { codigo: { in: areaCodes } }, select: { id: true, codigo: true } }) : [];
      const oldCenters = centerCodes.length ? await tx.centroCusto.findMany({ where: { codigo: { in: centerCodes } }, select: { id: true, codigo: true } }) : [];
      const areaIds = new Map<string, string>(oldAreas.map((row: any) => [row.codigo, row.id]));
      const centerIds = new Map<string, string>(oldCenters.map((row: any) => [row.codigo, row.id]));

      for (const row of preview.areas) {
        const id = areaIds.get(row.codigo);
        if (id) await tx.areaNegocio.update({ where: { id }, data: { nome: row.descricao } });
        else {
          const created = await tx.areaNegocio.create({ data: { codigo: row.codigo, nome: row.descricao } });
          areaIds.set(row.codigo, created.id);
        }
      }
      const referencedCodes = [...new Set(preview.centros.map(row => row.codigoArea!))];
      const missingCodes = referencedCodes.filter(code => !areaIds.has(code));
      if (missingCodes.length) {
        const existing = await tx.areaNegocio.findMany({ where: { codigo: { in: missingCodes }, ativo: true }, select: { id: true, codigo: true } });
        for (const row of existing) areaIds.set(row.codigo, row.id);
      }
      for (const row of preview.centros) {
        const areaId = areaIds.get(row.codigoArea!);
        if (!areaId) throw new Error("Área validada não encontrada na confirmação.");
        const id = centerIds.get(row.codigo);
        if (id) await tx.centroCusto.update({ where: { id }, data: { nome: row.descricao, areaId } });
        else await tx.centroCusto.create({ data: { codigo: row.codigo, nome: row.descricao, areaId } });
      }
      return { resumo: preview.resumo };
  },
});

export const POST = withAdvisoryAudit("/api/estrutura-gerencial/importar", "POST", advisoryPOST);
