import { guardApi } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { createPeopleWorkbook, PEOPLE_FILENAME } from "@/lib/people-import-template";

export async function GET() {
  const access = await guardApi("estrutura.pessoas.export"); if (access) return access;
  let db: Awaited<ReturnType<typeof requireSession>>["db"];
  try { ({ db } = await requireSession()); }
  catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  const [people, centers] = await Promise.all([
    db.pessoa.findMany({ where: { ativo: true }, select: { codigo: true, nome: true, cargo: true, departamento: true, email: true, telefone: true }, orderBy: { codigo: "asc" } }),
    db.centroCusto.findMany({ where: { ativo: true }, select: { codigo: true, nome: true } }),
  ]);
  const centersByName = new Map<string, string[]>();
  for (const center of centers) {
    const name = center.nome.trim();
    centersByName.set(name, [...(centersByName.get(name) || []), center.codigo]);
  }
  const invalid = people.find(person => person.departamento?.trim() && centersByName.get(person.departamento.trim())?.length !== 1);
  if (invalid) {
    return NextResponse.json({ error: `A Pessoa ${invalid.codigo} possui Centro de Custo legado sem correspondência única com um centro ativo. Revise esse cadastro antes de baixar.` }, { status: 409 });
  }

  const workbook = createPeopleWorkbook(people.map(person => ({
    codigo: person.codigo,
    nome: person.nome,
    cargo: person.cargo || "",
    codigoCC: person.departamento?.trim() ? centersByName.get(person.departamento.trim())![0] : "",
    email: person.email || "",
    telefone: person.telefone || "",
  })));
  return new NextResponse(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${PEOPLE_FILENAME}"`,
    "Cache-Control": "private, no-store",
  } });
}
