import { guardApi } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createFinancialStructureWorkbook, FINANCIAL_STRUCTURE_FILENAME } from "@/lib/financial-import-template";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";

export async function GET() {
  const access = await guardApi("estrutura.financeiras.export"); if (access) return access;
  let db: Awaited<ReturnType<typeof requireSession>>["db"];
  try { ({ db } = await requireSession()); }
  catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  const [categories, accounts] = await Promise.all([
    db.categoria.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
    db.planoContas.findMany({ where: { ativo: true }, select: { codigo: true, descricao: true, tipo: true, categoriaId: true }, orderBy: { codigo: "asc" } }),
  ]);
  const codeById = new Map(categories.map(cat => [cat.id, cat.codigo]));
  if (accounts.some(account => !account.codigo || !account.categoriaId || !codeById.has(account.categoriaId) || !FINANCIAL_ACCOUNT_TYPES.includes(account.tipo as typeof FINANCIAL_ACCOUNT_TYPES[number]))) {
    return NextResponse.json({ error: "Há Conta ativa sem código, Categoria ativa ou tipo válido. Classifique o legado antes de baixar a estrutura." }, { status: 409 });
  }
  const accountCodes = accounts.map(account => account.codigo);
  if (new Set(accountCodes).size !== accountCodes.length) return NextResponse.json({ error: "Há códigos de Conta duplicados no tenant. Corrija-os antes de baixar a estrutura." }, { status: 409 });
  if (accountCodes.length) {
    const allWithActiveCodes = await db.planoContas.findMany({ where: { codigo: { in: accountCodes as string[] } }, select: { codigo: true } });
    if (allWithActiveCodes.length !== accounts.length) return NextResponse.json({ error: "Há código de Conta ativa também usado por cadastro inativo. Resolva a duplicidade antes de baixar a estrutura." }, { status: 409 });
  }
  const workbook = createFinancialStructureWorkbook(categories.map(cat => ({ codigo: cat.codigo, nome: cat.nome })),
    accounts.map(account => ({ codigo: account.codigo!, descricao: account.descricao, codigoCategoria: codeById.get(account.categoriaId!)!, tipo: account.tipo })));
  return new NextResponse(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${FINANCIAL_STRUCTURE_FILENAME}"`,
    "Cache-Control": "private, no-store",
  } });
}
