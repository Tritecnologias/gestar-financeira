import { guardApi } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  const access = await guardApi("estrutura.pessoas.view"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); }
  catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  // Códigos de registros inativos continuam reservados pela chave única do tenant.
  const pessoas: { codigo: string }[] = await db.pessoa.findMany({ select: { codigo: true } });
  const numeros = pessoas.map(p => parseInt(p.codigo, 10)).filter(n => !isNaN(n));
  const proximo = numeros.length ? Math.max(...numeros) + 1 : 1;
  return NextResponse.json({ codigo: String(proximo).padStart(3, "0") });
}
