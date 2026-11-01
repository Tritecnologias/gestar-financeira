export const RESET_TTL_MS = 15 * 60_000;
export const RESET_UNAVAILABLE = "Reset de senha indisponível. O envio de e-mail transacional ainda não está habilitado ou disponível.";
export const RESET_INVALID = "Link inválido, expirado ou já utilizado. Entre em contato com o Administrador da Plataforma.";
export const RESET_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export class PasswordResetError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type ResetPolicy = { origin: string; secret: string; profile: "local" | "homolog" | "production"; recipients: string[] };

/** Runtime only. Readiness is explicit; credentials alone never enable a release. */
export function passwordResetPolicy(env: Record<string, string | undefined> = process.env): ResetPolicy | null {
  if (env.PASSWORD_RESET_ENABLED !== "true" || env.TRANSACTIONAL_EMAIL_READY !== "true" ||
      (env.TRANSACTIONAL_EMAIL_PROVIDER ?? env.EMAIL_PROVIDER) !== "smtp" || env.ACCESS_AUTH_MODE !== "identity") return null;
  try {
    const origin = env.APP_PUBLIC_URL || "", url = new URL(origin), db = new URL(env.DATABASE_URL || "");
    const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET || "";
    if (url.origin !== origin || env.NEXTAUTH_URL !== origin || secret.length < 32 ||
        !["postgres:", "postgresql:"].includes(db.protocol) || (db.port && db.port !== "5432")) return null;
    const profile = env.DEPLOYMENT_PROFILE;
    let recipients: string[] = [];
    if (profile === "local") {
      if (origin !== "http://localhost:3020" || !["127.0.0.1", "localhost"].includes(db.hostname) ||
          db.pathname !== "/special_invite_lab" || db.username !== "a2_runtime" ||
          !["127.0.0.1", "localhost"].includes(env.SMTP_HOST || "")) return null;
    } else if (profile === "homolog" || profile === "production") {
      const homolog = profile === "homolog";
      if (origin !== (homolog ? "https://homolog.dezsolucoes.com.br" : "https://app.dezsolucoes.com.br") ||
          db.hostname !== (homolog ? "0f5rvkjqjdt9fez1ajiascyk" : "ik7d1n0035vis9y5rprjpgmn") ||
          db.pathname !== (homolog ? "/gestar_homolog_pg18" : "/gestar_prod_pg18") ||
          db.username !== (homolog ? "pg18_homolog_runtime" : "pg18_prod_runtime")) return null;
      if (homolog) {
        recipients = (env.PASSWORD_RESET_TEST_RECIPIENTS || "").split(",").map(v => v.trim().toLowerCase());
        if (recipients.length > 10 || recipients.some(v => !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(v))) return null;
      }
    } else return null;
    return { origin, secret, profile, recipients };
  } catch { return null; }
}

export function resetRecipientAllowed(email: string, policy: ResetPolicy) {
  if (email.length > 254 || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email)) return false;
  return policy.profile === "local" ? email.toLowerCase().endsWith("@example.invalid") :
    policy.profile === "homolog" ? policy.recipients.includes(email.toLowerCase()) : true;
}

export function supportWhatsAppUrl(env: Record<string, string | undefined> = process.env) {
  const number = env.SUPPORT_WHATSAPP_NUMBER || "";
  return env.SUPPORT_WHATSAPP_ENABLED === "true" && /^[1-9][0-9]{7,14}$/.test(number) ? `https://wa.me/${number}` : null;
}
