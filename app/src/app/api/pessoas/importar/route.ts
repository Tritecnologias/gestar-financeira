import { withAdvisoryAudit } from "@/lib/advisory-request";
import { structureImportRoute } from "@/lib/structure-import-route";
import { parsePeopleWorkbook, validatePeopleWorkbook, type PeopleImportPreview } from "@/lib/people-import";

export const runtime = "nodejs";
const advisoryPOST = structureImportRoute({
  contract: "PEOPLE", permission: "estrutura.pessoas.import",
  parse: parsePeopleWorkbook, validate: validatePeopleWorkbook,
  locks: tenantId => [`people-import:${tenantId}`],
  async apply(tx: any, preview: PeopleImportPreview, tenantId: string) {
      const codes = preview.pessoas.map(row => row.codigo);
      const ccCodes = [...new Set(preview.pessoas.map(row => row.codigoCC).filter(Boolean))];
      const [existing, centers] = await Promise.all([
        tx.pessoa.findMany({ where: { codigo: { in: codes } }, select: { id: true, codigo: true } }),
        ccCodes.length ? tx.centroCusto.findMany({ where: { codigo: { in: ccCodes }, ativo: true }, select: { codigo: true, nome: true } }) : [],
      ]);
      const ids = new Map<string, string>(existing.map((person: any) => [person.codigo, person.id]));
      const centerNames = new Map<string, string>(centers.map((center: any) => [center.codigo, center.nome]));
      for (const row of preview.pessoas) {
        const departamento = row.codigoCC ? centerNames.get(row.codigoCC) : "";
        if (row.codigoCC && !departamento) throw new Error("Centro de Custo validado não encontrado na confirmação.");
        const data = { nome: row.nome, cargo: row.cargo, departamento, email: row.email, telefone: row.telefone };
        const id = ids.get(row.codigo);
        if (id) await tx.pessoa.update({ where: { id }, data });
        else await tx.pessoa.create({ data: { codigo: row.codigo, ...data } });
      }
      return { resumo: preview.resumo };
  },
});

export const POST = withAdvisoryAudit("/api/pessoas/importar", "POST", advisoryPOST);
