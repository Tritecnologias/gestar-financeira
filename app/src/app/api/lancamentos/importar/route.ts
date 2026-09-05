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
  const detalhesErros: string[] = [];

  // Valida usuário criador para não violar FK caso session.id não exista
  let validCriadoPor: string | null = null;
  if (session?.id) {
    const userExists = await prisma.usuario.findUnique({
      where: { id: session.id },
      select: { id: true },
    });
    if (userExists) validCriadoPor = userExists.id;
  }

  // Busca o MAX(seq) atual do tenant de destino uma única vez antes do lote.
  const resultado = await prisma.$queryRaw<{ maxseq: number }[]>`
    SELECT COALESCE(MAX(seq), 0) AS maxseq FROM lancamentos WHERE tenant_id = ${targetTenantId}::uuid
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

      // Data de lançamento obrigatória
      const dataLancDate = parseDateOnly(dataLanc);
      if (!dataLancDate) {
        erros++;
        detalhesErros.push(`Data de lançamento inválida: "${dataLanc}"`);
        continue;
      }

      // Descrição obrigatória
      if (!descricao || !String(descricao).trim()) {
        erros++;
        detalhesErros.push("Descrição não informada");
        continue;
      }

      // Normaliza valor (deve ser maior que zero devido ao CHECK constraint)
      let valorNum = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
      if (isNaN(valorNum) || valorNum <= 0) {
        const prevNum = valorPrevisto != null ? (typeof valorPrevisto === "number" ? valorPrevisto : parseFloat(String(valorPrevisto).replace(",", "."))) : NaN;
        if (!isNaN(prevNum) && prevNum > 0) {
          valorNum = prevNum;
        }
      }

      if (isNaN(valorNum) || valorNum <= 0) {
        erros++;
        detalhesErros.push(`Valor inválido (deve ser > 0): "${valor ?? valorPrevisto}"`);
        continue;
      }

      // Normaliza tipo ('ENTRADA' | 'SAIDA')
      let tipoNormalizado = String(tipo || "SAIDA").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      tipoNormalizado = tipoNormalizado.includes("ENTRADA") ? "ENTRADA" : "SAIDA";

      // Normaliza status ('realizado' | 'previsto' | 'cancelado')
      let statusNormalizado = String(status || "realizado").toLowerCase().trim();
      if (!["realizado", "previsto", "cancelado"].includes(statusNormalizado)) {
        if (statusNormalizado.includes("prev") || statusNormalizado.includes("pend")) {
          statusNormalizado = "previsto";
        } else if (statusNormalizado.includes("canc")) {
          statusNormalizado = "cancelado";
        } else {
          statusNormalizado = "realizado";
        }
      }

      const dataVencOrigDate = parseDateOnly(dataVencOriginal);

      // Verificação de duplicidade no tenant de destino
      const dupWhere: any = {
        dataLanc: dataLancDate,
        descricao: descricao.trim(),
        valor: valorNum,
        tipo: tipoNormalizado,
      };
      if (dataVencOrigDate) {
        dupWhere.dataVencOriginal = dataVencOrigDate;
      }

      const existing = await targetDb.lancamento.findFirst({
        where: dupWhere,
        select: { id: true },
      });

      if (existing) {
        duplicados++;
        continue;
      }

      const valorPrevNum = valorPrevisto != null ? (typeof valorPrevisto === "number" ? valorPrevisto : parseFloat(String(valorPrevisto).replace(",", "."))) : null;

      await targetDb.lancamento.create({
        data: {
          seq:              proximoSeq,
          dataLanc:         dataLancDate,
          dataEmissao:      parseDateOnly(dataEmissao),
          dataVencOriginal: dataVencOrigDate,
          dataVencPlano:    parseDateOnly(dataVencPlano),
          dataEvento:       parseDateOnly(dataEvento),
          dataPagamento:    parseDateOnly(dataPagamento),
          descricao:        descricao.trim(),
          valor:            valorNum,
          valorPrevisto:    valorPrevNum && !isNaN(valorPrevNum) ? valorPrevNum : null,
          tipo:             tipoNormalizado,
          status:           statusNormalizado,
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
          criadoPor:        validCriadoPor,
        },
      });

      proximoSeq++;
      inseridos++;
    } catch (err: any) {
      console.error("Erro importando linha:", err?.message || err);
      detalhesErros.push(err?.message || "Erro desconhecido ao gravar linha");
      erros++;
    }
  }

  return NextResponse.json({
    inseridos,
    duplicados,
    erros,
    detalhesErros: detalhesErros.slice(0, 10),
    tenantId: targetTenantId,
    tenantNome: targetTenantNome,
  });
}