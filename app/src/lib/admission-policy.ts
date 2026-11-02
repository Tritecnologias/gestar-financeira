/** Runtime configuration is the first gate; every Admission transaction also attests the database. */
export function admissionOrigin(env: Record<string, string | undefined> = process.env): string | null {
  try {
    const database = new URL(env.DATABASE_URL || "");
    const profile = env.DEPLOYMENT_PROFILE;
    if (profile === "homolog" || profile === "production") {
      const target = profile === "homolog"
        ? { flag: "ADMISSION_HOMOLOG_ENABLED", other: "ADMISSION_PRODUCTION_ENABLED", origin: "https://homolog.dezsolucoes.com.br", host: "0f5rvkjqjdt9fez1ajiascyk", database: "gestar_homolog_pg18", role: "pg18_homolog_runtime" }
        : { flag: "ADMISSION_PRODUCTION_ENABLED", other: "ADMISSION_HOMOLOG_ENABLED", origin: "https://app.dezsolucoes.com.br", host: "ik7d1n0035vis9y5rprjpgmn", database: "gestar_prod_pg18", role: "pg18_prod_runtime" };
      const mock = env.EMAIL_PROVIDER === "mock";
      if (env[target.flag] !== "true" || env[target.other] === "true" || env.ADMISSION_LAB_ENABLED === "true" ||
          env.ACCESS_AUTH_MODE !== "identity" || (!mock && env.EMAIL_PROVIDER !== "disabled" && !(profile === "production" && env.EMAIL_PROVIDER === "smtp")) ||
          env.APP_PUBLIC_URL !== target.origin || env.NEXTAUTH_URL !== env.APP_PUBLIC_URL ||
          !["postgres:", "postgresql:"].includes(database.protocol) || database.hostname !== target.host ||
          database.port !== "5432" || database.pathname !== "/" + target.database || database.username !== target.role ||
          !database.password || database.hash || !["", "?schema=public"].includes(database.search) ||
          !/^[a-f0-9]{64}$/.test(env.ADMISSION_SESSION_KEY || "") ||
          (mock && (!/^[a-f0-9]{64}$/.test(env.ADMISSION_LAB_MAIL_KEY || "") ||
            env.ADMISSION_SESSION_KEY === env.ADMISSION_LAB_MAIL_KEY ||
            env.ADMISSION_LAB_MAIL_DIR !== "/var/lib/10s/backups/admission-mail"))) return null;
      return env.APP_PUBLIC_URL;
    }
    if (env.ADMISSION_LAB_ENABLED !== "true" || profile !== "local" ||
        env.ADMISSION_HOMOLOG_ENABLED === "true" || env.ADMISSION_PRODUCTION_ENABLED === "true" ||
        env.ACCESS_AUTH_MODE === "legacy" || !["mock", "disabled"].includes(env.EMAIL_PROVIDER || "") ||
        env.APP_PUBLIC_URL !== "http://localhost:3020" || env.NEXTAUTH_URL !== env.APP_PUBLIC_URL ||
        !["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "5432" ||
        database.pathname !== "/special_invite_lab" || database.username !== "a2_runtime" ||
        !["postgres:", "postgresql:"].includes(database.protocol) || database.hash || database.search ||
        !/^[a-f0-9]{64}$/.test(env.ADMISSION_SESSION_KEY || "") ||
        (env.EMAIL_PROVIDER === "mock" && (!/^[a-f0-9]{64}$/.test(env.ADMISSION_LAB_MAIL_KEY || "") ||
          env.ADMISSION_SESSION_KEY === env.ADMISSION_LAB_MAIL_KEY ||
          env.ADMISSION_LAB_MAIL_DIR !== "/tmp/a2-mail"))) return null;
    return env.APP_PUBLIC_URL;
  } catch { return null; }
}

export const ADMISSION_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Vary": "Cookie, Origin",
};
export const ADMISSION_UNAVAILABLE = "Adesão indisponível. Retome no navegador em que iniciou ou fale com quem enviou o convite.";
export const RESUME_MESSAGE = "Se houver uma autorização válida para esse e-mail, você receberá um link para continuar.";
export const validAdmissionId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function admissionFailure(message = ADMISSION_UNAVAILABLE, status = 409) { return Object.assign(new Error(message), { status }); }
export function retryableAdmissionTransaction(error: unknown) {
  const e = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
  const sqlState = e?.meta?.driverAdapterError?.cause?.originalCode ?? e?.meta?.code;
  return ["P2034", "P2002"].includes(e?.code || "") || (e?.code === "P2010" && ["40001", "40P01"].includes(sqlState || ""));
}
export function requireAdmissionOrigin() {
  const origin = admissionOrigin();
  if (!origin) throw admissionFailure("Não encontrado.", 404);
  return origin;
}
export function admissionEmail(value: unknown, env: Record<string, string | undefined> = process.env) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  // The existing SMTP adapter is selectable only by an authorized production configuration.
  // Mock always remains synthetic, including when rehearsing the production configuration.
  const smtp = env.DEPLOYMENT_PROFILE === "production" && env.EMAIL_PROVIDER === "smtp" && admissionOrigin(env) !== null;
  if (smtp) {
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))
      throw admissionFailure("Informe um e-mail válido.", 400);
  } else if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.invalid$/.test(email))
    throw admissionFailure("Use um e-mail sintético @example.invalid neste laboratório.", 400);
  return email;
}

/** Private credentials authorize an email identifier, not mailbox possession.
 * No delivery adapter participates. Non-production remains synthetic-only. */
export function invitationEmail(value: unknown, env: Record<string, string | undefined> = process.env) {
  if (env.DEPLOYMENT_PROFILE !== "production" || !admissionOrigin(env)) return admissionEmail(value, env);
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))
    throw admissionFailure("Informe um e-mail válido.", 400);
  return email;
}
