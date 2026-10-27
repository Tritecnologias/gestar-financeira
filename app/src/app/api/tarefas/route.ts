import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

async function advisoryGET() {
  const access = await guardApi("acao.tarefas.view"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.tarefa.findMany({ orderBy: [{ seq: "asc" }] });
  return NextResponse.json(items);
}

async function advisoryPOST(req: NextRequest) {
  const access = await guardApi("acao.tarefas.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { nome } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const item = await db.tarefa.create({
    data: {
      nome: nome.trim(),
      status: "A Fazer!",
      colunas: [
        { nome: "O QUE", tipo: "Texto", ordem: 0 },
        { nome: "DESCRIÇÃO", tipo: "Texto", ordem: 1 },
        { nome: "STATUS", tipo: "Lista", ordem: 2 },
      ],
      linhas: [],
    },
  });
  return NextResponse.json(item, { status: 201 });
}

export const GET = withAdvisoryAudit("/api/tarefas", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/tarefas", "POST", advisoryPOST);
