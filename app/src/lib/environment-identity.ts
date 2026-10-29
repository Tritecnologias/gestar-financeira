/** Trusted runtime configuration only; request headers, browser host and branch names cannot enable HOMOLOG branding. */
export function homologIdentity(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEPLOYMENT_PROFILE === "production") return false;
  try {
    const origin = new URL(env.APP_PUBLIC_URL || "").origin, authOrigin = new URL(env.NEXTAUTH_URL || "").origin;
    const db = new URL(env.DATABASE_URL || "");
    return origin === "https://homolog.dezsolucoes.com.br" && authOrigin === origin &&
      db.hostname === "0f5rvkjqjdt9fez1ajiascyk" && db.pathname === "/gestar_homolog_pg18";
  } catch { return false; }
}
export function environmentIconPaths(isHomolog: boolean) {
  const version = isHomolog ? "homolog-yellow-1" : "dez-blue-1";
  return { svg: `/favicon.svg?v=${version}`, ico: `/favicon.ico?v=${version}` };
}
