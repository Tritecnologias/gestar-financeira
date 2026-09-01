import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// ── POST /api/lancamentos/importar ────────────────────────────
// Importação em lote com verificação de duplicidade.
// Recebe um array de lançamentos e insere em massa, ignorando duplicados
// (mesmo dataLanc + descricao + valor + tipo já existente no tenant).
export async function POST(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireEscrita());
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ error: e?.message ?? "Não autenticado" }, { status });
  }

  const body = await req.json();
  const { lancamentos } = body;

  if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
    return NextResponse.json({ error: "Nenhum lançamento enviado" }, { status: 400 });
  }

  const d = (v?: string) => v ? new Date(v) : null;
  let inseridos = 0;
  let duplicados = 0;
  let erros = 0;

  // Busca o MAX(seq) atual do tenant uma única vez antes do lote.
  // Cada inserção incrementa o contador em memória, evitando uma query
  // por linha e garantindo sequência contínua dentro do lote.
  const resultado = await prisma.$queryRaw<{ maxseq: number }[]>`
    SELECT COALESCE(MAX(seq), 0) AS maxseq FROM lancamentos WHERE tenant_id = ${session.tenantId}
  `;
  let proximoSeq = (resultado[0].maxseq ?? 0) + 1;

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

      // Verificação de duplicidade: mesmo dataLanc + descricao + valor + tipo
      const dataLancDate = new Date(dataLanc);

      const existing = await db.lancamento.findFirst({
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

      await db.lancamento.create({
        data: {
          seq:              proximoSeq,
          dataLanc:         dataLancDate,
          dataEmissao:      d(dataEmissao),
          dataVencOriginal: d(dataVencOriginal),
          dataVencPlano:    d(dataVencPlano),
          dataEvento:       d(dataEvento),
          dataPagamento:    d(dataPagamento),
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
    } catch {
      erros++;
    }
  }

  return NextResponse.json({ inseridos, duplicados, erros });
}