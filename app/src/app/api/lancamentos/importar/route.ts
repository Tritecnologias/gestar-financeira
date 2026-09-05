import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { prisma, getTenantPrisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/lancamento";

// ── POST /api/lancamentos/importar ────────────────────────────
// Importação em lote com verificação de duplicidade.
// Recebe um array de lançamentos e insere em massa, ignorando duplicados
// (mesmo dataLanc + descricao + valor + tipo já existente no tenant de destino).
export async function POST(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireEscrita());
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ error: e?.message ?? "Não autenticado" }, { status });
  }

  const body = await req.json();
  const { lancamentos, tenantId: requestedTenantId } = body;

  if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
    return NextResponse.json({ error: "Nenhum lançamento enviado" }, { status: 400 });
  }

  // Se admin_global especificou o tenant explicitamente, valida e direciona
  let targetTenantId = session.tenantId;
  let targetTenantNome = session.tenantNome;
  let targetDb = db;

  if (requestedTenantId && session.papel === "admin_global") {
    const validTenant = await prisma.tenant.findUnique({
      where: { id: requestedTenantId, ativo: true },
      select: { id: true, nome: true },
    });
    if (validTenant) {
      targetTenantId = validTenant.id;
      targetTenantNome = validTenant.nome;
      targetDb = getTenantPrisma(validTenant.id);
    }
  }

  let inseridos = 0;
  let duplicados = 0;
  let erros = 0;

  // Busca o MAX(seq) atual do tenant de destino uma única vez antes do lote.
  const resultado = await prisma.$queryRaw<{ maxseq: number }[]>`
    SELECT COALESCE(MAX(seq), 0) AS maxseq FROM lancamentos WHERE tenant_id = ${targetTenantId}
  `;
  let proximoSeq = Number(resultado[0]?.maxseq ?? 0) + 1;

  // Processar cada lançamento do lote
  for (const item of lancamentos) {
    try {
      const {
        dataLanc, descricao, valor, tipo, status,
        fornecedor, fornecedorId, centroCusto, referencia, contaId,
        dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
        statusManual, statusExtrato, valorPrevisto, banco,
        fantasiaPadrao, categoria, dre, cont, anotacao,
      } = item;

      // valor === 0 é válido; só rejeita ausente/inválido
      const valorNum = parseFloat(valor);
      if (!dataLanc || !descricao || valor === undefined || valor === null || Number.isNaN(valorNum) || !tipo) {
        erros++;
        continue;
      }

      const dataLancDate = parseDateOnly(dataLanc) ?? new Date();

      // Verificação de duplicidade no tenant de destino: mesmo dataLanc + descricao + valor + tipo
      const existing = await targetDb.lancamento.findFirst({
        where: {
          dataLanc: dataLancDate,
          descricao: descricao.trim(),
          valor: valorNum,
          tipo: tipo,
        },
        select: { id: true },
      });

      if (existing) {
        duplicados++;
        continue;
      }

      await targetDb.lancamento.create({
        data: {
          seq:              proximoSeq,
          dataLanc:         dataLancDate,
          dataEmissao:      parseDateOnly(dataEmissao),
          dataVencOriginal: parseDateOnly(dataVencOriginal),
          dataVencPlano:    parseDateOnly(dataVencPlano),
          dataEvento:       parseDateOnly(dataEvento),
          dataPagamento:    parseDateOnly(dataPagamento),
          descricao:        descricao.trim(),
          valor:            valorNum,
          valorPrevisto:    valorPrevisto ? parseFloat(valorPrevisto) : null,
          tipo,
          status:           status || "realizado",
          statusManual:     statusManual  || null,
          statusExtrato:    statusExtrato || null,
          banco:            banco         || null,
          fornecedor:       fornecedor    || null,
          fornecedorId:     fornecedorId  || null,
          fantasiaPadrao:   fantasiaPadrao|| null,
          centroCusto:      centroCusto   || null,
          referencia:       referencia    || null,
          contaId:          contaId       || null,
          categoria:        categoria     || null,
          dre:              dre           || null,
          cont:             cont          || null,
          anotacao:         anotacao      || null,
          criadoPor:        session.id,
        },
      });

      proximoSeq++;
      inseridos++;
    } catch (err: any) {
      console.error("Erro importando linha:", err?.message || err);
      erros++;
    }
  }

  return NextResponse.json({
    inseridos,
    duplicados,
    erros,
    tenantId: targetTenantId,
    tenantNome: targetTenantNome,
  });
}