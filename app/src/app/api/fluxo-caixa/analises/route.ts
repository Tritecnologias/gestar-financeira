import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/tenant";
import { dataCivil } from "@/lib/cash-flow";
import { segundaDaSemana, somarDias } from "@/lib/cash-flow-calendar.js";
import { montarAnalisesFluxoCaixa, type MedidaAnalise, type VisaoAnalise } from "@/lib/cash-flow-analytics";
import { obterResumoFluxoCaixa } from "@/lib/cash-flow-service";

const visoes: VisaoAnalise[] = ["DUAS_SEMANAS", "MENSAL"];
const medidas: MedidaAnalise[] = ["REALIZADO", "PREVISTO", "COMPARAR"];

export async function GET(req: NextRequest) {
  const access = await guardApi("fluxo.analises.view"); if (access) return access;
  let context: Awaited<ReturnType<typeof requireSession>>;
  try { context = await requireSession(); }
  catch { return NextResponse.json({ error: "Não autenticado" }, { status: 401 }); }
  const params = req.nextUrl.searchParams;
  const visao = params.get("visao") || "DUAS_SEMANAS";
  const medida = params.get("medida") || "REALIZADO";
  const referencia = params.get("dataReferencia") || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const periodo = params.get("periodo") || "";
  const categoriaId = params.get("categoriaId") || "";
  const contaId = params.get("contaId") || "";
  if (!visoes.includes(visao as VisaoAnalise) || !medidas.includes(medida as MedidaAnalise) || !dataCivil(referencia) ||
    (visao === "DUAS_SEMANAS" && (!dataCivil(periodo) || segundaDaSemana(periodo) !== periodo)) ||
    (visao === "MENSAL" && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) || !dataCivil(`${periodo}-01`)))) {
    return NextResponse.json({ error: "Visão, medida ou período inválido." }, { status: 400 });
  }
  const inicio = visao === "DUAS_SEMANAS" ? periodo : `${periodo}-01`;
  const fim = visao === "DUAS_SEMANAS" ? somarDias(inicio, 13) :
    new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)).toISOString().slice(0, 10);
  try {
    const tenantId = context.session.tenantId;
    const [categorias, contas] = await Promise.all([
      context.db.categoria.findMany({ where: { tenantId, ativo: true },
        select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
      context.db.planoContas.findMany({ where: { tenantId, ativo: true, categoria: { is: { tenantId, ativo: true } } },
        select: { id: true, codigo: true, descricao: true, categoriaId: true }, orderBy: { codigo: "asc" } }),
    ]);
    if (categoriaId && !categorias.some((item: { id: string }) => item.id === categoriaId))
      return NextResponse.json({ error: "Categoria N1 inexistente ou inativa." }, { status: 400 });
    if (contaId && !contas.some((item: { id: string; categoriaId: string | null }) =>
      item.id === contaId && (!categoriaId || item.categoriaId === categoriaId)))
      return NextResponse.json({ error: "Conta N2 incompatível com a Categoria N1." }, { status: 400 });
    const selecao: Prisma.LancamentoWhereInput | undefined = contaId
      ? { contaId }
      : categoriaId ? { conta: { is: { tenantId, categoriaId } } } : undefined;
    const resumo = await obterResumoFluxoCaixa(context.db, {
      tenantId, inicio, fim, dataReferencia: referencia, dataBase: "VENCIMENTO_PLANO",
    }, selecao);
    return NextResponse.json({ ...montarAnalisesFluxoCaixa(resumo, visao as VisaoAnalise, medida as MedidaAnalise),
      dimensoes: { categorias, contas } });
  } catch {
    return NextResponse.json({ error: "Não foi possível calcular as análises financeiras." }, { status: 500 });
  }
}
