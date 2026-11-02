/** Browser-safe helpers. Do not log or persist their inputs/outputs. */
export function parseInvitationLink(value: string, origin: string): string | null {
  try {
    if (!value.trim() || value.length > 2048) return null;
    const base = new URL(origin), url = new URL(value.trim(), base.origin);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get("token");
    if (url.origin !== base.origin || url.username || url.password || url.pathname !== "/ativar-acesso" ||
      url.search || !["https:", "http:"].includes(url.protocol) ||
      [...fragment.keys()].some(key => key !== "token") || fragment.getAll("token").length !== 1 ||
      !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return `${base.origin}/ativar-acesso#token=${token}`;
  } catch { return null; }
}

/** Navigation only: each destination still validates its own authorization on the server.
 * Keep parseInvitationLink strict for operational invitation creation/sharing.
 */
export function parseFirstAccessLink(value: string, origin: string): string | null {
  const operational = parseInvitationLink(value, origin);
  if (operational) return operational;
  try {
    if (!value.trim() || value.length > 2048) return null;
    const base = new URL(origin), url = new URL(value.trim(), base.origin);
    if (url.origin !== base.origin || url.username || url.password || url.search || !["https:", "http:"].includes(url.protocol)) return null;
    const fragment = new URLSearchParams(url.hash.slice(1)), entries = [...fragment];
    const token = (s: string | null) => !!s && /^[A-Za-z0-9_-]{43}$/.test(s);
    const id = (s: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    if (url.pathname === "/experimentacao" && entries.length === 1 && token(fragment.get("convite")))
      return `${base.origin}/experimentacao#convite=${fragment.get("convite")}`;
    if (url.pathname === "/adesao" && entries.length === 3 && ["id", "challenge", "token"].every(key => fragment.getAll(key).length === 1) &&
      id(fragment.get("id")) && id(fragment.get("challenge")) && token(fragment.get("token")))
      return `${base.origin}/adesao#${new URLSearchParams({ id: fragment.get("id")!, challenge: fragment.get("challenge")!, token: fragment.get("token")! })}`;
    return null;
  } catch { return null; }
}

export function invitationWhatsAppUrl(input: { name: string; tenantName: string; link: string }, origin: string): string | null {
  const link = parseInvitationLink(input.link, origin);
  if (!link) return null;
  const text = `Olá, ${input.name}. Você recebeu um convite para acessar a plataforma DEZ Soluções na empresa ${input.tenantName}.\n\n` +
    `Acesse o link abaixo para ativar seu acesso. Se ainda não tiver conta, você criará sua própria senha:\n\n${link}\n\n` +
    "Este convite é pessoal, de uso único e possui prazo de validade.";
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
