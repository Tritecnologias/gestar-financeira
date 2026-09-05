// ── Formatadores de moeda e data (portados do protótipo) ──────

/**
 * Formata um número como moeda BRL
 * Ex: 12500 → "R$ 12.500,00"
 */
export function fmt(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return (
    "R$ " +
    num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Formata uma data ISO (YYYY-MM-DD) para DD/MM/YYYY
 * Ex: "2026-05-01" → "01/05/2026"
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  if (typeof dateStr === "string") {
    const s = dateStr.trim().slice(0, 10);
    const parts = s.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const [ano, mes, dia] = parts;
      return `${dia}/${mes}/${ano}`;
    }
  }
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Formata uma data para o formato de input (YYYY-MM-DD)
 * Ex: Date → "2026-05-01"
 */
export function toInputDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") return date.trim().slice(0, 10);
  return date.toISOString().split("T")[0];
}

/**
 * Retorna a data atual no formato YYYY-MM-DD (para inputs)
 */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Converte Decimal do Prisma para number
 */
export function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return parseFloat(String(val));
}

/** Alias de fmt — formata como moeda BRL */
export const formatCurrency = fmt;
