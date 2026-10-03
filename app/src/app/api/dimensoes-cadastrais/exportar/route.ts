import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createRegistrationWorkbook, REGISTRATION_FILENAME, type ExportRegistration } from "@/lib/registration-import-template";

export async function GET() {
  let db: Awaited<ReturnType<typeof requireSession>>["db"];
  let tenantId: string;
  try { const context = await requireSession(); db = context.db; tenantId = context.session.tenantId; }
  catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  const relation = { contaPadrao: { select: { tenantId: true, codigo: true, ativo: true, categoria: { select: { tenantId: true, codigo: true, ativo: true } } } } } as const;
  const [clients, suppliers] = await Promise.all([
    db.cliente.findMany({ where: { ativo: true }, include: relation, orderBy: { codigo: "asc" } }),
    db.fornecedor.findMany({ where: { ativo: true }, include: relation, orderBy: { codigo: "asc" } }),
  ]);
  const invalid = [...clients, ...suppliers].find(row => row.contaPadraoId &&
    (!row.contaPadrao?.ativo || row.contaPadrao.tenantId !== tenantId || !row.contaPadrao.codigo ||
      !row.contaPadrao.categoria?.ativo || row.contaPadrao.categoria.tenantId !== tenantId));
  if (invalid) return NextResponse.json({ error: `O cadastro ${invalid.codigo} possui Conta padrão sem código ou Categoria ativa válida. Revise-o antes de baixar.` }, { status: 409 });

  const exported = (rows: typeof clients | typeof suppliers): ExportRegistration[] => rows.map(row => ({
    codigo: row.codigo, tipoPessoa: row.tipoPessoa || "", nome: row.nome, nomeFantasia: row.nomeFantasia || "",
    documento: row.documento || "", email: row.email || "", telefone: row.telefone || "", endereco: row.endereco || "",
    codigoCategoria: row.contaPadrao?.categoria?.codigo || "", codigoConta: row.contaPadrao?.codigo || "",
  }));
  const workbook = createRegistrationWorkbook(exported(clients), exported(suppliers));
  return new NextResponse(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${REGISTRATION_FILENAME}"`,
    "Cache-Control": "private, no-store",
  } });
}
