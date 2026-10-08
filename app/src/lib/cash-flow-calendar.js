/** @param {string} data */
function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const dataUTC = new Date(`${data}T00:00:00.000Z`);
  return !Number.isNaN(dataUTC.getTime()) && dataUTC.toISOString().slice(0, 10) === data;
}

/** @param {string} data @param {number} quantidade */
export function somarDias(data, quantidade) {
  if (!dataValida(data)) throw new Error("Data inválida.");
  const resultado = new Date(`${data}T00:00:00.000Z`);
  resultado.setUTCDate(resultado.getUTCDate() + quantidade);
  return resultado.toISOString().slice(0, 10);
}

/** @param {string} data */
export function segundaDaSemana(data) {
  if (!dataValida(data)) throw new Error("Data inválida.");
  const semana = new Date(`${data}T00:00:00.000Z`).getUTCDay();
  return somarDias(data, semana === 0 ? -6 : 1 - semana);
}
