import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { nextProductCode, productTransaction, reserveProductCode, validateProductClassification } from "@/lib/product-catalog";
import { parseProductWorkbook, validateProductWorkbook, type ProductPreview } from "@/lib/product-import";

class InvalidProductImport extends Error {
  constructor(readonly preview: ProductPreview) { super("A planilha contém erros bloqueantes. Nenhum cadastro foi gravado."); }
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.portfolio.import"); if (access) return access;
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
      const groups = await tx.produtoGrupo.findMany({ where: { tenantId: session.tenantId, ativo: true } });
      const groupByCode = new Map<string, any>(groups.map((row: any) => [row.codigo, row]));
      for (const row of preview.grupos) {
        if (row.acao === "igual") continue;
        const current = groupByCode.get(row.codigo);
        if (current) await tx.produtoGrupo.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const codigo = await reserveProductCode(tx, session.tenantId, "grupo");
          groupByCode.set(`@${row.linha}`, await tx.produtoGrupo.create({ data: { codigo, nome: row.nome } }));
        }
      }
      const types = await tx.produtoTipo.findMany({ where: { tenantId: session.tenantId, ativo: true, grupoId: { not: null } } });
      const groupById = new Map<string, any>([...groupByCode.values()].map((row: any) => [row.id, row]));
      const typeByKey = new Map<string, any>(types.map((row: any) => [`${groupById.get(row.grupoId)?.codigo}\u0000${row.codigo}`, row]));
      for (const row of preview.tipos) {
        if (row.acao === "igual") continue;
        const key = `${row.grupo}\u0000${row.codigo || `@${row.linha}`}`, current = typeByKey.get(key);
        if (current) await tx.produtoTipo.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const group = groupByCode.get(row.grupo);
          const codigo = await reserveProductCode(tx, session.tenantId, "tipo", group);
          typeByKey.set(key, await tx.produtoTipo.create({ data: { grupoId: group.id, codigo, nome: row.nome } }));
        }
      }
      const lines = await tx.produtoLinha.findMany({ where: { tenantId: session.tenantId, ativo: true } });
      const lineByKey = new Map<string, any>(lines.map((row: any) => [`${row.tipoId}\u0000${row.codigo}`, row]));
      for (const row of preview.linhas) {
        if (row.acao === "igual") continue;
        const parent = typeByKey.get(`${row.grupo}\u0000${row.codigoTipo}`);
        if (!parent) throw new Error("Tipo validado não pôde ser resolvido para a Linha.");
        const key = `${parent.id}\u0000${row.codigo || `@${row.linha}`}`, current = lineByKey.get(key);
        if (current) await tx.produtoLinha.update({ where: { id: current.id }, data: { nome: row.nome } });
        else {
          const codigo = await reserveProductCode(tx, session.tenantId, "linha", parent);
          lineByKey.set(key, await tx.produtoLinha.create({ data: { tipoId: parent.id, codigo, nome: row.nome } }));
        }
      }
      const existingItems = await tx.produto.findMany({ where: { tenantId: session.tenantId }, select: { id: true, codigo: true } });
      const itemByCode = new Map<string, string>(existingItems.map((row: any) => [row.codigo, row.id]));
      for (const row of preview.itens) {
        if (row.acao === "igual") continue;
        const type = typeByKey.get(`${row.grupo}\u0000${row.codigoTipo}`);
        const line = row.codigoLinha ? lineByKey.get(`${type.id}\u0000${row.codigoLinha}`) : null;
        const groupId = groupByCode.get(row.grupo).id;
        await validateProductClassification(tx, session.tenantId, groupId, type.id, line?.id || null);
        const data = { nome: row.nome, tipo: null, grupoId: groupId, tipoId: type.id, linhaId: line?.id || null, descricao: row.descricao || null, unidade: row.unidade || null, observacoes: row.observacoes || null };
        if (row.acao === "novo") {
          const codigo = await nextProductCode(tx, session.tenantId);
          await tx.produto.create({ data: { ...data, codigo } });
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
