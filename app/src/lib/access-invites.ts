import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

// Chamado sob o advisory lock por tenant/e-mail nas operações de emissão.
export async function assertInviteRateLimit(tx: Prisma.TransactionClient, tenantId: string, email: string) {
  const recent = await tx.accessInvite.count({ where: { tenantId, email,
    createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } });
  if (recent >= 3) throw Object.assign(new Error("Limite de convites atingido. Aguarde 15 minutos para reenviar."), { status: 429 });
}

// O modo simulado e a exibição do link bruto ficam estritamente no sandbox DEV local.
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
