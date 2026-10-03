import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { parseFinancialWorkbook, validateFinancialWorkbook, type FinancialPreview } from "@/lib/financial-import";

class InvalidImport extends Error {
  constructor(readonly preview: FinancialPreview) { super("A estrutura contém erros bloqueantes."); }
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireEscrita()); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 }); }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Selecione um arquivo .xlsx válido." }, { status: 400 });
  if (file.size > 10_000_000) return NextResponse.json({ error: "O arquivo deve ter até 10 MB." }, { status: 413 });
  if (mode !== "preview" && mode !== "confirm") return NextResponse.json({ error: "Operação inválida." }, { status: 400 });

  let parsed;
  try { parsed = parseFinancialWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Não foi possível ler o arquivo XLSX." }, { status: 400 }); }
  if (mode === "preview") return NextResponse.json({ preview: await validateFinancialWorkbook(parsed, db) });

  try {
    const result = await db.$transaction(async (tx: any) => {
      const preview = await validateFinancialWorkbook(parsed, tx);
      if (preview.errors.length) throw new InvalidImport(preview);

      const categoryCodes = preview.categorias.map(row => row.codigo);
      const accountCodes = preview.contas.map(row => row.codigo);
      const oldCategories = categoryCodes.length ? await tx.categoria.findMany({ where: { codigo: { in: categoryCodes } }, select: { id: true, codigo: true } }) : [];
      const oldAccounts = accountCodes.length ? await tx.planoContas.findMany({ where: { codigo: { in: accountCodes } }, select: { id: true, codigo: true } }) : [];
      const categoryIds = new Map<string, string>(oldCategories.map((row: any) => [row.codigo, row.id]));
      const accountIds = new Map<string, string>(oldAccounts.map((row: any) => [row.codigo, row.id]));

      for (const row of preview.categorias) {
        const id = categoryIds.get(row.codigo);
        if (id) await tx.categoria.update({ where: { id }, data: { nome: row.descricao } });
        else {
          const created = await tx.categoria.create({ data: { codigo: row.codigo, nome: row.descricao } });
          categoryIds.set(row.codigo, created.id);
        }
      }
      const referencedCodes = [...new Set(preview.contas.map(row => row.codigoCategoria!))];
      const missingCodes = referencedCodes.filter(code => !categoryIds.has(code));
      if (missingCodes.length) {
        const existing = await tx.categoria.findMany({ where: { codigo: { in: missingCodes }, ativo: true }, select: { id: true, codigo: true } });
        for (const row of existing) categoryIds.set(row.codigo, row.id);
      }
      for (const row of preview.contas) {
        const categoriaId = categoryIds.get(row.codigoCategoria!);
        if (!categoriaId) throw new Error("Categoria validada não encontrada na confirmação.");
        const id = accountIds.get(row.codigo);
        if (id) await tx.planoContas.update({ where: { id }, data: { descricao: row.descricao, categoriaId, tipo: row.tipo } });
        else await tx.planoContas.create({ data: { codigo: row.codigo, descricao: row.descricao, categoriaId, tipo: row.tipo } });
      }
      return preview.resumo;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json({ ok: true, resumo: result });
  } catch (error: any) {
    if (error instanceof InvalidImport) return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    if (error?.code === "P2002" || error?.code === "P2034") return NextResponse.json({ error: "Os dados mudaram durante a importação. Revise a prévia e tente novamente." }, { status: 409 });
    console.error("Falha na importação da estrutura financeira", error);
    return NextResponse.json({ error: "Falha ao gravar a estrutura financeira. Nenhum registro foi importado." }, { status: 500 });
  }
}
