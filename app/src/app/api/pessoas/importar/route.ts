import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { parsePeopleWorkbook, validatePeopleWorkbook, type PeopleImportPreview } from "@/lib/people-import";

class InvalidPeopleImport extends Error {
  constructor(readonly preview: PeopleImportPreview) { super("A planilha contém erros bloqueantes."); }
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.pessoas.import"); if (access) return access;
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
  try { parsed = parsePeopleWorkbook(new Uint8Array(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Não foi possível ler o arquivo XLSX." }, { status: 400 }); }

  if (mode === "preview") return NextResponse.json({ preview: await validatePeopleWorkbook(parsed, db) });

  try {
    const resumo = await db.$transaction(async (tx: any) => {
      // O client estendido aplica o escopo do tenant inclusive nas consultas da transação.
      const preview = await validatePeopleWorkbook(parsed, tx);
      if (preview.errors.length) throw new InvalidPeopleImport(preview);
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
      return preview.resumo;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json({ ok: true, resumo });
  } catch (error: any) {
    if (error instanceof InvalidPeopleImport) return NextResponse.json({ error: error.message, preview: error.preview }, { status: 422 });
    if (error?.code === "P2002" || error?.code === "P2034") {
      return NextResponse.json({ error: "Os dados mudaram durante a importação. Revise a prévia e tente novamente." }, { status: 409 });
    }
    console.error("Falha na importação de Pessoas", error);
    return NextResponse.json({ error: "Falha ao gravar Pessoas. Nenhum registro foi importado." }, { status: 500 });
  }
}
