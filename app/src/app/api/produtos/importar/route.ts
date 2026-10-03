import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { nextProductCode, productPrice, productTransaction, validateProductClassification } from "@/lib/product-catalog";
import { parseProductWorkbook, validateProductWorkbook, type ProductPreview } from "@/lib/product-import";

class InvalidProductImport extends Error {
  constructor(readonly preview: ProductPreview) { super("A planilha contém erros bloqueantes. Nenhum cadastro foi gravado."); }
}

export async function POST(req: NextRequest) {
  let context: Awaited<ReturnType<typeof requireEscrita>>;
  try { context = await requireEscrita(); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 }); }
  const { db, session } = context;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envie um arquivo .xlsx válido." }, { status: 400 }); }
  const file = form.get("file"), mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Selecione um arquivo .xlsx válido." }, { status: 400 });
  if (file.size > 10_000_000) return NextResponse.json({ error: "O arquivo deve ter até 10 MB." }, { status: 413 });
  if (mode !== "preview" && mode !== "confirm") return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
  let parsed;
  try { parsed = parseProductWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Não foi possível ler o arquivo XLSX." }, { status: 400 }); }
  if (mode === "preview") return NextResponse.json({ preview: await validateProductWorkbook(parsed, db, session.tenantId) });

  try {
    const summary = await productTransaction(db, session.tenantId, async tx => {
      const preview = await validateProductWorkbook(parsed, tx, session.tenantId);
      if (preview.errors.length) throw new InvalidProductImport(preview);
      const types = await tx.produtoTipo.findMany({ where: { tenantId: session.tenantId, ativo: true } });
      const typeByKey = new Map<string, any>(types.map((row: any) => [`${row.grupo}\u0000${row.codigo}`, row]));
      for (const row of preview.tipos) {
        if (row.acao === "igual") continue;
        const key = `${row.grupo}\u0000${row.codigo}`, current = typeByKey.get(key);
        if (current) await tx.produtoTipo.update({ where: { id: current.id }, data: { nome: row.nome } });
        else typeByKey.set(key, await tx.produtoTipo.create({ data: { grupo: row.grupo, codigo: row.codigo, nome: row.nome } }));
      }
      const typeByCode = new Map<string, any[]>();
      for (const type of typeByKey.values()) typeByCode.set(type.codigo, [...(typeByCode.get(type.codigo) || []), type]);
      const lines = await tx.produtoLinha.findMany({ where: { tenantId: session.tenantId, ativo: true } });
      const lineByKey = new Map<string, any>(lines.map((row: any) => [`${row.tipoId}\u0000${row.codigo}`, row]));
      for (const row of preview.linhas) {
        if (row.acao === "igual") continue;
        const parents = typeByCode.get(row.codigoTipo) || [];
        if (parents.length !== 1) throw new Error("Tipo validado não pôde ser resolvido para a Linha.");
        const parent = parents[0], key = `${parent.id}\u0000${row.codigo}`, current = lineByKey.get(key);
        if (current) await tx.produtoLinha.update({ where: { id: current.id }, data: { nome: row.nome } });
        else lineByKey.set(key, await tx.produtoLinha.create({ data: { tipoId: parent.id, codigo: row.codigo, nome: row.nome } }));
      }
      const existingItems = await tx.produto.findMany({ where: { tenantId: session.tenantId }, select: { id: true, codigo: true } });
      const itemByCode = new Map<string, string>(existingItems.map((row: any) => [row.codigo, row.id]));
      let nextCode: bigint | null = null;
      if (preview.itens.some(row => row.acao === "novo")) nextCode = BigInt((await nextProductCode(tx, session.tenantId)).slice(1));
      for (const row of preview.itens) {
        if (row.acao === "igual") continue;
        const type = typeByKey.get(`${row.grupo}\u0000${row.codigoTipo}`);
        const line = row.codigoLinha ? lineByKey.get(`${type.id}\u0000${row.codigoLinha}`) : null;
        await validateProductClassification(tx, session.tenantId, row.grupo, type.id, line?.id || null);
        const data = { nome: row.nome, tipo: row.grupo, tipoId: type.id, linhaId: line?.id || null, descricao: row.descricao || null, unidade: row.unidade || null,
          precoVenda: productPrice(row.precoVenda.replace(",", "."), "Preço de venda"), precoCusto: productPrice(row.precoCusto.replace(",", "."), "Preço de custo"), observacoes: row.observacoes || null };
        if (row.acao === "novo") {
          const codigo = `I${nextCode!.toString().padStart(4, "0")}`;
          if (codigo.length > 30) throw new Error("A sequência de códigos atingiu o limite.");
          await tx.produto.create({ data: { ...data, codigo } }); nextCode! += BigInt(1);
        } else {
          const id = itemByCode.get(row.codigo);
          if (!id) throw new Error("Item validado não encontrado na confirmação.");
          await tx.produto.update({ where: { id }, data });
        }
      }
      return preview.resumo;
    });
    return NextResponse.json({ ok: true, resumo: summary });
  } catch (error: any) {
    if (error instanceof InvalidProductImport) return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    if (error?.code === "P2002" || error?.code === "P2034") return NextResponse.json({ error: "Os dados mudaram durante a importação. Revise a prévia e tente novamente." }, { status: 409 });
    console.error("Falha na importação de Produtos e Serviços", error);
    return NextResponse.json({ error: "Falha ao gravar Produtos e Serviços. Nenhum registro foi importado." }, { status: 500 });
  }
}
