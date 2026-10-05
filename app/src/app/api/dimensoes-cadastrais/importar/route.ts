import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { parseRegistrationWorkbook, validateRegistrationWorkbook, type RegistrationPreview, type RegistrationRow } from "@/lib/registration-import";
import { registrationCodeAllocator, registrationTransaction, type RegistrationKind } from "@/lib/registration-codes";

class InvalidRegistrationImport extends Error {
  constructor(readonly preview: RegistrationPreview) { super("A planilha contém erros bloqueantes. Nenhum cadastro foi gravado."); }
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.cadastrais.import"); if (access) return access;
  let db: Awaited<ReturnType<typeof requireEscrita>>["db"];
  let tenantId: string;
  try { const context = await requireEscrita(); db = context.db; tenantId = context.session.tenantId; }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 }); }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Selecione um arquivo .xlsx válido." }, { status: 400 });
  if (file.size > 10_000_000) return NextResponse.json({ error: "O arquivo deve ter até 10 MB." }, { status: 413 });
  if (mode !== "preview" && mode !== "confirm") return NextResponse.json({ error: "Operação inválida." }, { status: 400 });

  let parsed;
  try { parsed = parseRegistrationWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Não foi possível ler o arquivo XLSX." }, { status: 400 }); }
  if (mode === "preview") return NextResponse.json({ preview: await validateRegistrationWorkbook(parsed, db, tenantId) });

  try {
    const kinds: RegistrationKind[] = [
      ...(parsed.clientes.some(row => !row.codigo) ? ["cliente" as const] : []),
      ...(parsed.fornecedores.some(row => !row.codigo) ? ["fornecedor" as const] : []),
    ];
    const result = await registrationTransaction(db, tenantId, kinds, async tx => {
      const preview = await validateRegistrationWorkbook(parsed, tx, tenantId);
      if (preview.errors.length) throw new InvalidRegistrationImport(preview);
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
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    if (error instanceof InvalidRegistrationImport) return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    if (error?.code === "P2002" || error?.code === "P2034") return NextResponse.json({ error: "Os dados mudaram durante a importação. Revise a prévia e tente novamente." }, { status: 409 });
    console.error("Falha na importação dos cadastros", error);
    return NextResponse.json({ error: "Falha ao gravar cadastros. Nenhum registro foi importado." }, { status: 500 });
  }
}
