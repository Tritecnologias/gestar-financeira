import { structureImportRoute } from "@/lib/structure-import-route";
import { parseFinancialWorkbook, validateFinancialWorkbook, type FinancialPreview } from "@/lib/financial-import";

export const runtime = "nodejs";
export const POST = structureImportRoute({
  contract: "FINANCIAL", permission: "estrutura.financeiras.import",
  parse: parseFinancialWorkbook, validate: validateFinancialWorkbook,
  locks: tenantId => [`financial-codes:${tenantId}`],
  async apply(tx: any, preview: FinancialPreview, tenantId: string) {

      const categoryCodes = preview.categorias.map(row => row.codigo);
      const accountCodes = preview.contas.map(row => row.codigo);
      const oldCategories = categoryCodes.length ? await tx.categoria.findMany({ where: { codigo: { in: categoryCodes } }, select: { id: true, codigo: true } }) : [];
      const oldAccounts = accountCodes.length ? await tx.planoContas.findMany({ where: { codigo: { in: accountCodes } }, select: { id: true, codigo: true } }) : [];
      const categoryIds = new Map<string, string>(oldCategories.map((row: any) => [row.codigo, row.id]));
      const accountIds = new Map<string, string>(oldAccounts.map((row: any) => [row.codigo, row.id]));

      for (const row of preview.categorias) {
        const id = categoryIds.get(row.codigo);
        if (id && row.acao === "atualizar") await tx.categoria.update({ where: { id }, data: { nome: row.descricao } });
        else {
          if (!id) {
            const created = await tx.categoria.create({ data: { codigo: row.codigo, nome: row.descricao } });
            categoryIds.set(row.codigo, created.id);
          }
        }
      }
      const referencedCodes = [...new Set(preview.contas.map(row => row.codigoCategoria!))];
      const missingCodes = referencedCodes.filter(code => !categoryIds.has(code));
      if (missingCodes.length) {
        const existing = await tx.categoria.findMany({ where: { codigo: { in: missingCodes }, ativo: true }, select: { id: true, codigo: true } });
        for (const row of existing) categoryIds.set(row.codigo, row.id);
      }
      for (const row of preview.contas) {
        if (row.acao === "igual") continue;
        const categoriaId = categoryIds.get(row.codigoCategoria!);
        if (!categoriaId) throw new Error("Categoria validada não encontrada na confirmação.");
        const id = accountIds.get(row.codigo);
        if (id) await tx.planoContas.update({ where: { id }, data: { descricao: row.descricao, categoriaId, tipo: row.tipo } });
        else await tx.planoContas.create({ data: { codigo: row.codigo, descricao: row.descricao, categoriaId, tipo: row.tipo } });
      }
      return { resumo: preview.resumo };
  },
});
