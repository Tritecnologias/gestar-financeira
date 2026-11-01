import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { writeAudit } from "./audit";
import { commitIdentityPassword } from "./account-password";
import { matchesCredentialStamp } from "./credential-session";
import { temporaryPasswordState } from "./password-reset-state";
import { requireAdmissionDatabase } from "./admission-database";
import { PasswordResetError, RESET_TTL_MS, RESET_RATE_WINDOW_MS, RESET_UNAVAILABLE, passwordResetPolicy, resetRecipientAllowed, type ResetPolicy } from "./password-reset-policy";

type Tx = Prisma.TransactionClient;
const identityFields = { id: true, email: true, status: true, senhaHash: true, platformAdmin: { select: { id: true, status: true } } } as const;
export async function resetAvailable(db: PrismaClient, policy = passwordResetPolicy()) {
  if (!policy) return false;
  try { await requireAdmissionDatabase(db as unknown as Tx); return true; } catch { return false; }
}

/** 192 random bits. Plaintext exists only in this call and its single no-store
 * response. No recovery/read-back endpoint, email, persisted secret or retry. */
export async function issuePasswordReset(db: PrismaClient, actorId: string, identityId: string,
  adminPassword: string, policy: ResetPolicy, actorStamp: string) {
  if (!await resetAvailable(db, policy)) throw new PasswordResetError(RESET_UNAVAILABLE, 503);
  const result = await db.$transaction(async tx => {
    await requireAdmissionDatabase(tx);
    for (const id of [...new Set([actorId, identityId])].sort())
      await tx.$queryRaw`SELECT id FROM auth_identities WHERE id=${id} FOR UPDATE`;
    const actor = await tx.authIdentity.findUnique({ where: { id: actorId }, select: identityFields });
    if (!actor || actor.status !== "ACTIVE" || actor.platformAdmin?.status !== "ACTIVE" ||
        !matchesCredentialStamp(actorStamp, actor.id, actor.senhaHash, policy.secret) || await temporaryPasswordState(tx, actor.id))
      throw new PasswordResetError("Acesso negado. Entre novamente com sua senha definitiva.", 403);
    const now = (await tx.$queryRaw<{ instant: Date }[]>`SELECT date_trunc('milliseconds',transaction_timestamp()) AS instant`)[0].instant;
    const since = new Date(now.getTime() - RESET_RATE_WINDOW_MS);
    if (await tx.auditEvent.count({ where: { actorIdentityId: actorId, action: "PASSWORD_RESET_AUTH_DENIED", occurredAt: { gte: since } } }) >= 5)
      throw new PasswordResetError("Muitas tentativas. Aguarde 15 minutos.", 429);
    if (!await bcrypt.compare(adminPassword, actor.senhaHash)) {
      await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "PASSWORD_RESET_AUTH_DENIED",
        resourceType: "AuthIdentity", resourceId: identityId, result: "DENIED" });
      return { denied: true as const };
    }
    const identity = await tx.authIdentity.findUnique({ where: { id: identityId }, select: identityFields });
    if (!identity || identity.status !== "ACTIVE") throw new PasswordResetError("Conta indisponível para redefinição.", 409);
    if (!resetRecipientAllowed(identity.email, policy)) throw new PasswordResetError("Identidade não autorizada para este ambiente.", 403);
    const recent = await tx.auditEvent.findMany({ where: { action: "PASSWORD_TEMPORARY_ISSUED", resourceType: "AuthIdentity", resourceId: identityId, occurredAt: { gte: since } } });
    if (recent.length >= 3 || recent.some(e => now.getTime() - e.occurredAt.getTime() < 60_000) ||
        await tx.auditEvent.count({ where: { actorIdentityId: actorId, action: "PASSWORD_TEMPORARY_ISSUED", occurredAt: { gte: since } } }) >= 10)
      throw new PasswordResetError("Aguarde antes de solicitar outro reset. Limite: 3 solicitações em 15 minutos e intervalo de 60 segundos.", 429);
    const previous = await temporaryPasswordState(tx, identityId);
    if (previous) await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "PASSWORD_TEMPORARY_REPLACED",
      resourceType: "TemporaryPassword", resourceId: previous.id });
    const temporaryPassword = "D9!" + randomBytes(24).toString("base64url") + "a";
    await commitIdentityPassword(tx, identity, await bcrypt.hash(temporaryPassword, 12));
    const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
    await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "PASSWORD_TEMPORARY_ISSUED",
      resourceType: "AuthIdentity", resourceId: identityId, metadata: { expiresAt } });
    return { denied: false as const, temporaryPassword, expiresAt };
  }, { maxWait: 5000, timeout: 15000 });
  if (result.denied) throw new PasswordResetError("Confirme a sua senha de administrador.", 403);
  return { message: "Senha provisória gerada. As sessões anteriores foram encerradas.",
    temporaryPassword: result.temporaryPassword, expiresAt: result.expiresAt };
}
