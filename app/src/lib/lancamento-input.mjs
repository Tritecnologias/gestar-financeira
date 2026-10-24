/** Shared, lossless input contract for operational APIs and the official workbook. */
export function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function amountInput(value, label = "Valor", required = false) {
  if (value == null || value === "" || (typeof value === "string" && !value.trim())) {
    if (required) invalid(`${label} é obrigatório.`);
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") invalid(`${label} inválido.`);
  let normalized = String(value).trim();
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(normalized)) normalized = normalized.replaceAll(".", "").replace(",", ".");
  else normalized = normalized.replace(",", ".");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(normalized)) invalid(`${label} inválido. Use valor não negativo com até duas casas decimais.`);
  const [integer, fraction = ""] = normalized.split(".");
  return `${BigInt(integer)}.${fraction.padEnd(2, "0")}`;
}

export function dateInput(value, label = "Data", required = false) {
  if (value == null || value === "" || (typeof value === "string" && !value.trim())) {
    if (required) invalid(`${label} é obrigatória.`);
    return null;
  }
  if (typeof value !== "string") invalid(`${label} inválida.`);
  let iso = value.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(iso);
  if (br) iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < "0001-01-01") invalid(`${label} inválida.`);
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) invalid(`${label} inválida.`);
  return date;
}

export function textInput(value, label, required = false, max = 255) {
  if (value == null || value === "") {
    if (required) invalid(`${label} é obrigatório.`);
    return null;
  }
  if (typeof value !== "string") invalid(`${label} inválido.`);
  const text = value.trim();
  if ((required && !text) || text.length > max) invalid(`${label} inválido (máximo ${max} caracteres).`);
  return text || null;
}

const dates = ["dataLanc", "dataEmissao", "dataVencOriginal", "dataVencPlano", "dataEvento", "dataPagamento"];
const texts = ["descricao", "fornecedor", "fantasiaPadrao", "banco", "centroCusto", "referencia", "anotacao", "statusManual", "statusExtrato", "categoria", "contaId", "clienteId", "fornecedorId"];
export function normalizeLancamento(input, create = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("Envie um lançamento válido.");
  if (Object.hasOwn(input, "dre") || Object.hasOwn(input, "cont")) invalid("DRE e CONT. são campos de somente leitura.");
  /** @type {Record<string, any>} */
  const data = {};
  for (const key of dates) if (Object.hasOwn(input, key) || (create && key === "dataLanc")) data[key] = dateInput(input[key], key);
  for (const key of ["valor", "valorPrevisto"]) if (Object.hasOwn(input, key) || (create && key === "valor")) data[key] = amountInput(input[key], key);
  for (const key of texts) if (Object.hasOwn(input, key) || (create && key === "descricao")) data[key] = textInput(input[key], key, false, ["descricao", "anotacao"].includes(key) ? 10000 : 255);
  if (Object.hasOwn(input, "tipo") || create) {
    const direction = textInput(input.tipo, "Direção");
    if (direction !== null && !["ENTRADA", "SAIDA"].includes(direction)) invalid("Direção inválida.");
    data.tipo = direction;
  }
  if (Object.hasOwn(input, "status") || create) {
    const status = input.status === undefined && create ? "realizado" : input.status;
    if (!["realizado", "previsto", "cancelado"].includes(status)) invalid("Status Base inválido.");
    data.status = status;
  }

  if (create) data.cont = "1";
  return data;
}

/** Automatic Status Base, DRE/CONT and metadata cannot make an empty draft meaningful. */
export function hasMeaningfulBusinessValue(input) {
  return [...dates, ...texts, "tipo", "valor", "valorPrevisto"].some(key => {
    const value = input?.[key];
    return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
  });
}
export function assertMeaningfulLancamento(input, editing = false) {
  if (!hasMeaningfulBusinessValue(input)) invalid(editing
    ? "Um lançamento precisa manter ao menos um campo preenchido."
    : "Preencha ao menos um campo para criar o lançamento.");
}
