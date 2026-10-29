// Trusted server configuration only. A productive release needs a separate explicit approval.
export function experimentOrigin(env: Record<string, string | undefined> = process.env): string | null {
  if (env.SPECIAL_INVITATIONS_ENABLED !== "true") return null;
  try {
    const origin = new URL(env.APP_PUBLIC_URL || "").origin;
    const db = new URL(env.DATABASE_URL || "");
    if (origin === "https://app.dezsolucoes.com.br" && env.NEXTAUTH_URL === origin &&
      db.hostname === "ik7d1n0035vis9y5rprjpgmn" && db.pathname === "/gestar_prod_pg18" &&
      env.DEPLOYMENT_PROFILE === "production" && env.SPECIAL_INVITATIONS_PRODUCTION_APPROVED === "true") {
      const keys = JSON.parse(env.SPECIAL_INVITATION_LINK_KEYS || "null"), active = env.SPECIAL_INVITATION_LINK_KEY_ID || "";
      if (/^[A-Za-z0-9_-]{1,32}$/.test(active) && keys && !Array.isArray(keys) && typeof keys === "object" && Object.hasOwn(keys, active) &&
        Object.entries(keys).every(([id, key]) => /^[A-Za-z0-9_-]{1,32}$/.test(id) && typeof key === "string" && /^[0-9a-f]{64}$/.test(key))) return origin;
      return null;
    }
    if (env.DEPLOYMENT_PROFILE === "production") return null;
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
