type AreaValidation =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

// `db` deve ser o client escopado retornado por requireSession/requireEscrita.
export async function validateActiveArea(db: any, areaId: unknown): Promise<AreaValidation> {
  const id = typeof areaId === "string" ? areaId.trim() : "";
  if (!id) {
    return { ok: false, status: 400, error: "Selecione uma Área de Negócio para o Centro de Custo." };
  }

  const area = await db.areaNegocio.findFirst({ where: { id, ativo: true }, select: { id: true } });
  if (!area) {
    return { ok: false, status: 422, error: "Área de Negócio não encontrada ou inativa neste tenant." };
  }

  return { ok: true, id: area.id };
}
