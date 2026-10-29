import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { experimentOrigin, experimentStatus } from "@/lib/experiment-policy";

export const EXPERIMENT_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Vary": "Cookie, Origin" };
export function experimentEnabled() {
  const origin = experimentOrigin();
  if (!origin) throw Object.assign(new Error("Não encontrado."), { status: 404 });
  return origin;
}
export async function experimentAdmin() {
  experimentEnabled();
  const actor = await requirePlatformAdmin();
  if (!actor.identityId) throw Object.assign(new Error("Identidade administrativa necessária."), { status: 403 });
  return actor as typeof actor & { identityId: string };
}
export function experimentSameOrigin(req: Request) {
  if (req.headers.get("origin") !== experimentEnabled()) throw Object.assign(new Error("Origem inválida."), { status: 403 });
}
export const experimentToken = () => randomBytes(32).toString("base64url");
export const experimentHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function experimentBody(req: Request) {
  const text = await req.text();
  if (text.length > 2048) throw Object.assign(new Error("Requisição inválida."), { status: 413 });
  try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); return value; }
  catch { throw Object.assign(new Error("Requisição inválida."), { status: 400 }); }
}
export async function validExperiment(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await prisma.experimentInvitation.findUnique({ where: { tokenHash: experimentHash(token) } });
  return row && experimentStatus(row) === "ACTIVE" ? row : null;
}
export function experimentError(error: unknown) {
  const e = error as { status?: number; message?: string };
  return { status: e.status ?? 500, message: e.status ? e.message : "Não foi possível concluir. Tente novamente." };
}
