import * as XLSX from "xlsx";

export type ImportIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
export type ImportRow = { linha: number; codigo: string; descricao: string; codigoArea?: string; acao?: "novo" | "atualizar" | "erro"; detalhes?: string[] };
export type ManagementWorkbook = { areas: ImportRow[]; centros: ImportRow[]; errors: ImportIssue[] };
export type ImportPreview = ManagementWorkbook & {
  resumo: { totalLido: number; totalNovo: number; totalAtualizado: number; totalInvalido: number;
    areas: { novos: number; atualizacoes: number; erros: number };
    centros: { novos: number; atualizacoes: number; erros: number } };
};

const AREA = "AREAS_NEGOCIO";
const CENTRO = "CENTROS_CUSTO";

export function parseManagementWorkbook(bytes: Uint8Array): ManagementWorkbook {
  const workbook = XLSX.read(bytes, { type: "array", cellText: true });
  const errors: ImportIssue[] = [];

  function sheet(name: string, columns: string[]): ImportRow[] {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) {
      errors.push({ aba: name, linha: 0, campo: "ABA", codigo: "", motivo: `Aba ${name} ausente.` });
      return [];
    }
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    const cells = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, defval: "", blankrows: true });
    const headers = (cells[0] || []).map(value => String(value).trim().toUpperCase());
    for (const column of columns) {
      if (!headers.includes(column)) errors.push({ aba: name, linha: range.s.r + 1, campo: column, codigo: "", motivo: `Coluna ${column} ausente.` });
      if (headers.filter(value => value === column).length > 1) errors.push({ aba: name, linha: range.s.r + 1, campo: column, codigo: "", motivo: `Coluna ${column} duplicada.` });
    }
    if (columns.some(column => headers.filter(value => value === column).length !== 1)) return [];
    return cells.slice(1).flatMap((cellsRow, index) => {
      const values = columns.map(column => String(cellsRow[headers.indexOf(column)] ?? "").trim());
      if (values.every(value => !value)) return [];
      return [{ linha: range.s.r + index + 2, codigo: values[0], descricao: values[1],
        ...(name === CENTRO ? { codigoArea: values[2] } : {}) }];
    });
  }

  const areas = sheet(AREA, ["CODIGO_AREA", "DESCRICAO_AREA"]);
  const centros = sheet(CENTRO, ["CODIGO_CC", "DESCRICAO_CC", "CODIGO_AREA"]);
  if (!errors.length && areas.length + centros.length === 0) {
    errors.push({ aba: AREA, linha: 0, campo: "ARQUIVO", codigo: "", motivo: "Arquivo sem registros para importar." });
  }
  return { areas, centros, errors };
}

export function validateManagementWorkbookInput(input: ManagementWorkbook): ImportIssue[] {
  const { areas, centros } = input;
  const errors = [...input.errors];
  const issue = (aba: string, row: ImportRow, campo: string, motivo: string) => {
    errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
  };

  for (const [aba, rows, codeField, descriptionField] of [
    [AREA, areas, "CODIGO_AREA", "DESCRICAO_AREA"],
    [CENTRO, centros, "CODIGO_CC", "DESCRICAO_CC"],
  ] as const) {
    const occurrences = new Map<string, number>();
    for (const row of rows) if (row.codigo) occurrences.set(row.codigo, (occurrences.get(row.codigo) || 0) + 1);
    for (const row of rows) {
      if (!row.codigo) issue(aba, row, codeField, "Código obrigatório.");
      if (!row.descricao) issue(aba, row, descriptionField, "Descrição obrigatória.");
      if (row.codigo && (occurrences.get(row.codigo) || 0) > 1) issue(aba, row, codeField, "Código duplicado no arquivo.");
    }
  }
  for (const row of centros) if (!row.codigoArea) issue(CENTRO, row, "CODIGO_AREA", "Área obrigatória.");
  return errors;
}

export async function validateManagementWorkbook(input: ManagementWorkbook, db: any): Promise<ImportPreview> {
  const areas = input.areas.map(row => ({ ...row }));
  const centros = input.centros.map(row => ({ ...row }));
  const errors = validateManagementWorkbookInput(input);
  const issue = (aba: string, row: ImportRow, campo: string, motivo: string) => {
    errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
  };

  const areaCodes = [...new Set([...areas.map(row => row.codigo), ...centros.map(row => row.codigoArea || "")].filter(Boolean))];
  const centerCodes = [...new Set(centros.map(row => row.codigo).filter(Boolean))];
  const existingAreas = areaCodes.length ? await db.areaNegocio.findMany({ where: { codigo: { in: areaCodes } }, select: { id: true, codigo: true, nome: true, ativo: true } }) : [];
  const existingCenters = centerCodes.length ? await db.centroCusto.findMany({ where: { codigo: { in: centerCodes } }, select: { id: true, codigo: true, nome: true, areaId: true, ativo: true } }) : [];
  const oldAreaIds = [...new Set(existingCenters.map((row: any) => row.areaId).filter(Boolean))];
  const oldAreas = oldAreaIds.length ? await db.areaNegocio.findMany({ where: { id: { in: oldAreaIds } }, select: { id: true, codigo: true } }) : [];
  const oldAreaCodes = new Map<string, string>(oldAreas.map((row: any) => [row.id, row.codigo]));
  const areasByCode = new Map<string, { id: string; nome: string; ativo: boolean }>(existingAreas.map((row: any) => [row.codigo, row]));
  const centersByCode = new Map<string, { id: string; nome: string; areaId: string | null; ativo: boolean }>(existingCenters.map((row: any) => [row.codigo, row]));

  for (const row of areas) {
    const existing = areasByCode.get(row.codigo);
    if (existing && !existing.ativo) issue(AREA, row, "CODIGO_AREA", "Código já existe inativo; não será reativado.");
  }
  for (const row of centros) {
    const existing = centersByCode.get(row.codigo);
    if (existing && !existing.ativo) issue(CENTRO, row, "CODIGO_CC", "Código já existe inativo; não será reativado.");
    if (row.codigoArea) {
      const fromFile = areas.filter(area => area.codigo === row.codigoArea);
      if (fromFile.length) {
        if (fromFile.some(area => errors.some(error => error.aba === AREA && error.linha === area.linha))) {
          issue(CENTRO, row, "CODIGO_AREA", "Área inválida na aba AREAS_NEGOCIO.");
        }
      } else if (!areasByCode.get(row.codigoArea)?.ativo) {
        issue(CENTRO, row, "CODIGO_AREA", "Área não encontrada ou inativa neste tenant.");
      }
    }
  }

  for (const row of areas) {
    const old = areasByCode.get(row.codigo);
    row.acao = errors.some(error => error.aba === AREA && error.linha === row.linha)
      ? "erro" : old ? "atualizar" : "novo";
    if (row.acao === "atualizar") row.detalhes = old!.nome === row.descricao ? ["Sem mudança de descrição"] : [`Descrição: ${old!.nome} → ${row.descricao}`];
  }
  for (const row of centros) {
    const old = centersByCode.get(row.codigo);
    row.acao = errors.some(error => error.aba === CENTRO && error.linha === row.linha)
      ? "erro" : old ? "atualizar" : "novo";
    if (row.acao === "atualizar") {
      const currentArea = old!.areaId ? oldAreaCodes.get(old!.areaId) || "Área atual indisponível" : "Sem Área";
      row.detalhes = [];
      if (old!.nome !== row.descricao) row.detalhes.push(`Descrição: ${old!.nome} → ${row.descricao}`);
      if (currentArea !== row.codigoArea) row.detalhes.push(`Área: ${currentArea} → ${row.codigoArea}`);
      if (!row.detalhes.length) row.detalhes.push("Sem mudança de descrição ou Área");
    }
  }
  const tally = (rows: ImportRow[]) => ({ novos: rows.filter(row => row.acao === "novo").length,
    atualizacoes: rows.filter(row => row.acao === "atualizar").length,
    erros: rows.filter(row => row.acao === "erro").length });
  const areaSummary = tally(areas), centerSummary = tally(centros);
  return { areas, centros, errors, resumo: {
    totalLido: areas.length + centros.length,
    totalNovo: areaSummary.novos + centerSummary.novos,
    totalAtualizado: areaSummary.atualizacoes + centerSummary.atualizacoes,
    totalInvalido: areaSummary.erros + centerSummary.erros,
    areas: areaSummary, centros: centerSummary,
  } };
}
