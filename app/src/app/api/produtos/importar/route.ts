import { withAdvisoryAudit } from "@/lib/advisory-request";
import { structureImportRoute } from "@/lib/structure-import-route";
import { parseProductWorkbook, validateProductWorkbook, type ProductPreview } from "@/lib/product-import";
import { nextProductCode, reserveProductCode, validateProductClassification } from "@/lib/product-catalog";

export const runtime = "nodejs";
const advisoryPOST = structureImportRoute({
  contract: "PRODUCT", permission: "estrutura.portfolio.import",
  parse: parseProductWorkbook, validate: validateProductWorkbook,
  locks: tenantId => [`product-catalog:${tenantId}`],
  async apply(tx: any, preview: ProductPreview, tenantId: string) {
      const groups = await tx.produtoGrupo.findMany({ where: { tenantId: tenantId, ativo: true } });
      const groupByCode = new Map<string, any>(groups.map((row: any) => [row.codigo, row]));
      for (const row of preview.grupos) {
        if (row.acao === "igual") continue;
        const current = groupByCode.get(row.codigo);
        if (current) await tx.produtoGrupo.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const codigo = await reserveProductCode(tx, tenantId, "grupo");
          groupByCode.set(`@${row.linha}`, await tx.produtoGrupo.create({ data: { codigo, nome: row.nome } }));
        }
      }
      const types = await tx.produtoTipo.findMany({ where: { tenantId: tenantId, ativo: true, grupoId: { not: null } } });
      const groupById = new Map<string, any>([...groupByCode.values()].map((row: any) => [row.id, row]));
      const typeByKey = new Map<string, any>(types.map((row: any) => [`${groupById.get(row.grupoId)?.codigo}\u0000${row.codigo}`, row]));
      for (const row of preview.tipos) {
        if (row.acao === "igual") continue;
        const key = `${row.grupo}\u0000${row.codigo || `@${row.linha}`}`, current = typeByKey.get(key);
        if (current) await tx.produtoTipo.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const group = groupByCode.get(row.grupo);
          const codigo = await reserveProductCode(tx, tenantId, "tipo", group);
          typeByKey.set(key, await tx.produtoTipo.create({ data: { grupoId: group.id, codigo, nome: row.nome } }));
        }
      }
      const lines = await tx.produtoLinha.findMany({ where: { tenantId: tenantId, ativo: true } });
      const lineByKey = new Map<string, any>(lines.map((row: any) => [`${row.tipoId}\u0000${row.codigo}`, row]));
      for (const row of preview.linhas) {
        if (row.acao === "igual") continue;
        const parent = typeByKey.get(`${row.grupo}\u0000${row.codigoTipo}`);
        if (!parent) throw new Error("Tipo validado não pôde ser resolvido para a Linha.");
        const key = `${parent.id}\u0000${row.codigo || `@${row.linha}`}`, current = lineByKey.get(key);
        if (current) await tx.produtoLinha.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const codigo = await reserveProductCode(tx, tenantId, "linha", parent);
          lineByKey.set(key, await tx.produtoLinha.create({ data: { tipoId: parent.id, codigo, nome: row.nome } }));
        }
      }
      const existingItems = await tx.produto.findMany({ where: { tenantId: tenantId }, select: { id: true, codigo: true } });
      const itemByCode = new Map<string, string>(existingItems.map((row: any) => [row.codigo, row.id]));
      for (const row of preview.itens) {
        if (row.acao === "igual") continue;
        const type = typeByKey.get(`${row.grupo}\u0000${row.codigoTipo}`);
        const line = row.codigoLinha ? lineByKey.get(`${type.id}\u0000${row.codigoLinha}`) : null;
        const groupId = groupByCode.get(row.grupo).id;
        await validateProductClassification(tx, tenantId, groupId, type.id, line?.id || null);
        const data = { nome: row.nome, tipo: null, grupoId: groupId, tipoId: type.id, linhaId: line?.id || null, descricao: row.descricao || null, unidade: row.unidade || null, observacoes: row.observacoes || null };
        if (row.acao === "novo") {
          const codigo = await nextProductCode(tx, tenantId);
          await tx.produto.create({ data: { ...data, codigo } });
        } else {
          const id = itemByCode.get(row.codigo);
          if (!id) throw new Error("Item validado não encontrado na confirmação.");
          await tx.produto.update({ where: { id }, data });
        }
      }
      return { resumo: preview.resumo };
  },
});

export const POST = withAdvisoryAudit("/api/produtos/importar", "POST", advisoryPOST);
