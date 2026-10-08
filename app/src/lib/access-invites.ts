import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const INVITE_HOURS = Math.min(168, Math.max(1, Number(process.env.ACCESS_INVITE_HOURS) || 72));
export const INVITE_UNAVAILABLE = "Convite inválido, expirado ou já utilizado.";

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validInviteToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function inviteExpiresAt() {
  return new Date(Date.now() + INVITE_HOURS * 60 * 60 * 1000);
}

// Fragmento não é enviado ao servidor nos GETs e não deve ir para logs.
export function devInviteLink(origin: string, token: string) {
  return `${origin}/ativar-acesso#token=${token}`;
}

// Sem provedor de email, emissão fica estritamente no sandbox DEV local.
export function canIssueDevInvite(requestUrl: URL) {
  try {
    const database = new URL(process.env.DATABASE_URL || "");
    return database.hostname === "127.0.0.1" && database.port === "55432" &&
      database.pathname === "/gestar_vf_dev" &&
      ["127.0.0.1", "localhost"].includes(requestUrl.hostname);
  } catch { return false; }
}

export async function expireInvite(id: string, tenantId: string) {
  await prisma.$transaction(async tx => {
    const changed = await tx.accessInvite.updateMany({
      where: { id, tenantId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (changed.count) await writeAudit(tx, { tenantId, accessMode: "SYSTEM", action: "INVITE_EXPIRED",
      resourceType: "AccessInvite", resourceId: id });
  });
}
