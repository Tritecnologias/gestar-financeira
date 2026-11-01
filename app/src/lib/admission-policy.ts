/** A.2.2 is a LOCAL candidate. No flag alone can enable it on a remote database. */
export function admissionOrigin(env: Record<string, string | undefined> = process.env): string | null {
  try {
    const database = new URL(env.DATABASE_URL || "");
    if (env.ADMISSION_LAB_ENABLED !== "true" || env.DEPLOYMENT_PROFILE !== "local" ||
        env.ACCESS_AUTH_MODE === "legacy" || env.EMAIL_PROVIDER !== "mock" ||
        env.APP_PUBLIC_URL !== "http://localhost:3020" || env.NEXTAUTH_URL !== env.APP_PUBLIC_URL ||
        !["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "5432" ||
        database.pathname !== "/special_invite_lab" || database.username !== "a2_runtime" ||
        database.search || !/^[a-f0-9]{64}$/.test(env.ADMISSION_SESSION_KEY || "") ||
        !/^[a-f0-9]{64}$/.test(env.ADMISSION_LAB_MAIL_KEY || "") ||
        env.ADMISSION_LAB_MAIL_DIR !== "/tmp/a2-mail") return null;
    return env.APP_PUBLIC_URL;
  } catch { return null; }
}

export const ADMISSION_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Vary": "Cookie, Origin",
};
export const ADMISSION_UNAVAILABLE = "Adesão indisponível. Solicite um novo link para o e-mail autorizado.";
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
export function admissionEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  // The LOCAL transport must never receive a real recipient, even by administrative mistake.
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.invalid$/.test(email))
    throw admissionFailure("Use um e-mail sintético @example.invalid neste laboratório.", 400);
  return email;
}
