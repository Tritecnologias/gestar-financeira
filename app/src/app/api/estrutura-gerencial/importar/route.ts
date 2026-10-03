import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { parseManagementWorkbook, validateManagementWorkbook, type ImportPreview } from "@/lib/management-import";

class InvalidImport extends Error {
  constructor(readonly preview: ImportPreview) { super("A estrutura contém erros bloqueantes."); }
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireEscrita()); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 }); }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Selecione um arquivo .xlsx válido." }, { status: 400 });
  }
  if (file.size > 10_000_000) return NextResponse.json({ error: "O arquivo deve ter até 10 MB." }, { status: 413 });
  if (mode !== "preview" && mode !== "confirm") return NextResponse.json({ error: "Operação inválida." }, { status: 400 });

  let parsed;
  try { parsed = parseManagementWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Não foi possível ler o arquivo XLSX." }, { status: 400 }); }

  if (mode === "preview") {
    return NextResponse.json({ preview: await validateManagementWorkbook(parsed, db) });
  }

  try {
    // O client estendido conserva o filtro de tenant dentro da transação.
    // Revalidar e gravar no mesmo snapshot impede confirmação com preview obsoleto.
    const result = await db.$transaction(async (tx: any) => {
      const preview = await validateManagementWorkbook(parsed, tx);
      if (preview.errors.length) throw new InvalidImport(preview);

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
      return preview.resumo;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json({ ok: true, resumo: result });
  } catch (error: any) {
    if (error instanceof InvalidImport) return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    if (error?.code === "P2002" || error?.code === "P2034") {
      return NextResponse.json({ error: "Os dados mudaram durante a importação. Revise a prévia e tente novamente." }, { status: 409 });
    }
    console.error("Falha na importação da estrutura gerencial", error);
    return NextResponse.json({ error: "Falha ao gravar a estrutura gerencial. Nenhum registro foi importado." }, { status: 500 });
  }
}
