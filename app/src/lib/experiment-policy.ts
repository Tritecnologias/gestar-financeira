// Pure policy: a production database can never enable this LOCAL/HOMOLOG pilot.
export function experimentOrigin(env: Record<string, string | undefined> = process.env): string | null {
  if (env.SPECIAL_INVITATIONS_ENABLED !== "true") return null;
  try {
    const origin = new URL(env.APP_PUBLIC_URL || "").origin;
    const db = new URL(env.DATABASE_URL || "");
    if (origin === "https://homolog.dezsolucoes.com.br" && db.hostname === "0f5rvkjqjdt9fez1ajiascyk" && db.pathname === "/gestar_homolog_pg18") return origin;
    if (origin === "http://localhost:3020" && db.pathname === "/special_invite_lab" &&
      ["127.0.0.1", "localhost", "dez-local-pg18-postgres-1"].includes(db.hostname)) return origin;
  } catch { /* fail closed */ }
  return null;
}
export function experimentStatus(row: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  return row.revokedAt ? "REVOKED" : row.expiresAt <= now ? "EXPIRED" : "ACTIVE";
}
export function experimentInput(body: { recipientName?: unknown; hours?: unknown }) {
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim().replace(/\s+/g, " ") : "";
  const hours = body.hours === undefined ? 72 : body.hours;
  if (!recipientName || recipientName.length > 160 || /[\u0000-\u001f\u007f]/.test(recipientName) ||
    typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error("Informe o nome (até 160 caracteres) e validade de 1 a 168 horas.");
  return { recipientName, hours };
}
