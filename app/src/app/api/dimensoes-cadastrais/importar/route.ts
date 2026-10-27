import { withAdvisoryAudit } from "@/lib/advisory-request";
import { structureImportRoute } from "@/lib/structure-import-route";
import { parseRegistrationWorkbook, validateRegistrationWorkbook, type RegistrationPreview } from "@/lib/registration-import";
import { registrationCodeAllocator } from "@/lib/registration-codes";
import type { RegistrationRow } from "@/lib/registration-import";

export const runtime = "nodejs";
const advisoryPOST = structureImportRoute({
  contract: "REGISTRATION", permission: "estrutura.cadastrais.import",
  parse: parseRegistrationWorkbook, validate: validateRegistrationWorkbook,
  locks: tenantId => [`registration-code:${tenantId}:cliente`, `registration-code:${tenantId}:fornecedor`],
  async apply(tx: any, preview: RegistrationPreview, tenantId: string) {
      const accounts = await tx.planoContas.findMany({ where: { ativo: true }, select: { id: true, codigo: true } });
      const accountIds = new Map<string, string>(accounts.map((row: { codigo: string; id: string }) => [row.codigo.trim().toLocaleUpperCase("pt-BR"), row.id]));
      const criados: { clientes: { linha: number; codigo: string; nome: string }[]; fornecedores: { linha: number; codigo: string; nome: string }[] } = { clientes: [], fornecedores: [] };
      const writeSection = async (model: "cliente" | "fornecedor", rows: RegistrationRow[]) => {
        const existing = rows.length ? await tx[model].findMany({ select: { id: true, codigo: true } }) : [];
        const ids = new Map<string, string>(existing.map((row: { codigo: string; id: string }) => [row.codigo.trim().toLocaleUpperCase("pt-BR"), row.id]));
        const nextCode = rows.some(row => row.acao === "novo") ? await registrationCodeAllocator(tx, tenantId, model) : null;
        for (const row of rows) {
          if (row.acao === "igual") continue;
          const contaPadraoId = row.codigoConta ? accountIds.get(row.codigoConta.trim().toLocaleUpperCase("pt-BR")) : null;
          if (row.codigoConta && !contaPadraoId) throw new Error("Conta validada não encontrada na confirmação.");
          const data = { nome: row.nome, tipoPessoa: row.tipoPessoa || null, nomeFantasia: row.nomeFantasia || null,
            documento: row.documento || null, email: row.email || null, telefone: row.telefone || null,
            endereco: row.endereco || null, contaPadraoId };
          const id = ids.get(row.codigo.trim().toLocaleUpperCase("pt-BR"));
          if (id) await tx[model].update({ where: { id }, data });
          else {
            if (row.acao !== "novo" || !nextCode) throw new Error("Cadastro alterado durante a confirmação.");
            const codigo = nextCode();
            await tx[model].create({ data: { codigo, ...data } });
            criados[model === "cliente" ? "clientes" : "fornecedores"].push({ linha: row.linha, codigo, nome: row.nome });
          }
        }
      };
      await writeSection("cliente", preview.clientes);
      await writeSection("fornecedor", preview.fornecedores);
      return { resumo: preview.resumo, criados };
  },
});

export const POST = withAdvisoryAudit("/api/dimensoes-cadastrais/importar", "POST", advisoryPOST);
