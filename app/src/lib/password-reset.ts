import type { Prisma, PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { writeAudit } from "./audit";
import { commitIdentityPassword } from "./account-password";
import { validIdentityPassword } from "./password-policy";
import { requireAdmissionDatabase } from "./admission-database";
import { getTransactionalSmtpConfig, sendEmailMessage, type EmailServiceConfig } from "./email-service";
import { PasswordResetError, RESET_INVALID, RESET_TTL_MS, RESET_UNAVAILABLE, passwordResetPolicy, resetRecipientAllowed, type ResetPolicy } from "./password-reset-policy";

type Tx = Prisma.TransactionClient;
export type ResetDelivery = { policy: ResetPolicy; email: EmailServiceConfig };
const identityFields = { id: true, email: true, status: true, senhaHash: true, platformAdmin: { select: { id: true, status: true } } } as const;
const failure = () => new PasswordResetError(RESET_INVALID, 400);
const tokenPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
const signature = (policy: ResetPolicy, id: string, identity: { id: string; email: string; senhaHash: string }, actor: { id: string; senhaHash: string }, expiresAt: string) =>
  createHmac("sha256", policy.secret).update(JSON.stringify(["dez/admin-password-reset/v1", policy.origin, id, identity.id,
    identity.email, identity.senhaHash, actor.id, actor.senhaHash, expiresAt])).digest("base64url");
const txOptions = { maxWait: 5000, timeout: 15000 };

async function lockIdentities(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT id FROM auth_identities WHERE id=${id} FOR UPDATE`;
}
async function instant(tx: Tx) {
  return (await tx.$queryRaw<{ instant: Date }[]>`SELECT date_trunc('milliseconds',transaction_timestamp()) AS instant`)[0].instant;
}
async function ended(tx: Tx, id: string) {
  return await tx.auditEvent.count({ where: { resourceType: "PasswordResetAuthorization", resourceId: id,
    action: { in: ["PASSWORD_RESET_REVOKED", "PASSWORD_RESET_CONSUMED", "PASSWORD_RESET_EMAIL_FAILED"] } } }) > 0;
}

export function getResetDelivery(): ResetDelivery | null {
  const policy = passwordResetPolicy();
  const email = policy && getTransactionalSmtpConfig(policy.origin);
  return policy && email ? { policy, email } : null;
}
export async function resetAvailable(db: PrismaClient, delivery = getResetDelivery()) {
  if (!delivery) return false;
  try {
    await requireAdmissionDatabase(db as unknown as Tx);
    return delivery.email.adapter.provider === "smtp" && await delivery.email.adapter.verify?.() === true;
  } catch { return false; }
}

/** Raw proof exists only in memory and in the registered recipient's email, never in a DTO/audit. */
export async function issuePasswordReset(db: PrismaClient, actorId: string, identityId: string, adminPassword: string, delivery: ResetDelivery) {
  if (!await resetAvailable(db, delivery)) throw new PasswordResetError(RESET_UNAVAILABLE, 503);
  const prepared = await db.$transaction(async tx => {
    await requireAdmissionDatabase(tx);
    await lockIdentities(tx, [actorId, identityId]);
    const actor = await tx.authIdentity.findUnique({ where: { id: actorId }, select: identityFields });
    if (!actor || actor.status !== "ACTIVE" || actor.platformAdmin?.status !== "ACTIVE") throw new PasswordResetError("Acesso negado.", 403);
    const now = await instant(tx), since = new Date(now.getTime() - RESET_TTL_MS);
    if (await tx.auditEvent.count({ where: { actorIdentityId: actorId, action: "PASSWORD_RESET_AUTH_DENIED", occurredAt: { gte: since } } }) >= 5)
      throw new PasswordResetError("Muitas tentativas. Aguarde 15 minutos.", 429);
    if (!await bcrypt.compare(adminPassword, actor.senhaHash)) {
      await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "PASSWORD_RESET_AUTH_DENIED",
        resourceType: "AuthIdentity", resourceId: identityId, result: "DENIED" });
      return { denied: true as const };
    }
    const identity = await tx.authIdentity.findUnique({ where: { id: identityId }, select: identityFields });
    if (!identity || identity.status !== "ACTIVE") throw new PasswordResetError("Conta indisponível para redefinição.", 409);
    if (!resetRecipientAllowed(identity.email, delivery.policy)) throw new PasswordResetError("Destinatário não autorizado para este ambiente.", 403);
    const recent = await tx.auditEvent.findMany({ where: { action: "PASSWORD_RESET_ISSUED", resourceType: "AuthIdentity", resourceId: identityId, occurredAt: { gte: since } } });
    if (recent.length >= 3 || recent.some(e => now.getTime() - e.occurredAt.getTime() < 60_000) ||
        await tx.auditEvent.count({ where: { actorIdentityId: actorId, action: "PASSWORD_RESET_ISSUED", occurredAt: { gte: since } } }) >= 10)
      throw new PasswordResetError("Aguarde antes de solicitar outro reset. Limite: 3 solicitações em 15 minutos e intervalo de 60 segundos.", 429);
    for (const previous of recent) if (!await ended(tx, previous.id)) await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN",
      action: "PASSWORD_RESET_REVOKED", resourceType: "PasswordResetAuthorization", resourceId: previous.id, reason: "Substituída por nova solicitação" });
    const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
    const grant = await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "PASSWORD_RESET_ISSUED",
      resourceType: "AuthIdentity", resourceId: identityId, metadata: { expiresAt, origin: delivery.policy.origin } });
    const token = grant.id + "." + signature(delivery.policy, grant.id, identity, actor, expiresAt);
    return { denied: false as const, id: grant.id, to: identity.email, token, expiresAt };
  }, txOptions);
  if (prepared.denied) throw new PasswordResetError("Confirme a sua senha de administrador.", 403);
  const link = new URL("/redefinir-senha", delivery.policy.origin); link.hash = "token=" + prepared.token;
  const expiry = new Date(prepared.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const text = `O Administrador da Plataforma autorizou a redefinição da sua senha na DEZ Soluções.\n\nDefina sua nova senha: ${link}\n\nO link é pessoal, de uso único e expira em ${expiry} (horário de Brasília).\nSua senha atual continua válida até a conclusão. Se não solicitou a alteração, ignore este e-mail e contate o suporte.\n\nDEZ Soluções`;
  const sent = await sendEmailMessage(delivery.email, { to: prepared.to, subject: "Redefinição de senha — DEZ Soluções", text,
    html: `<p>O Administrador da Plataforma autorizou a redefinição da sua senha na DEZ Soluções.</p><p><a href="${link}">Definir nova senha</a></p><p>Link pessoal e de uso único. Expira em ${expiry} (horário de Brasília).</p><p>Sua senha atual continua válida até a conclusão. Se não solicitou a alteração, ignore este e-mail e contate o suporte.</p>` });
  // No positive delivery event => unusable proof, including SMTP ambiguity or a crash here.
  await db.$transaction(async tx => {
    await requireAdmissionDatabase(tx);
    await lockIdentities(tx, [identityId]);
    await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN",
      action: sent.status === "SENT" && sent.provider === "smtp" ? "PASSWORD_RESET_EMAIL_SENT" : "PASSWORD_RESET_EMAIL_FAILED",
      resourceType: "PasswordResetAuthorization", resourceId: prepared.id,
      result: sent.status === "SENT" && sent.provider === "smtp" ? "SUCCESS" : "FAILURE" });
  }, txOptions);
  if (sent.status !== "SENT" || sent.provider !== "smtp") throw new PasswordResetError("Não foi possível enviar o e-mail. Nenhuma senha foi alterada. Tente novamente após o intervalo de segurança.", 503);
  return { message: "Link enviado ao e-mail cadastrado. A senha será alterada somente quando o usuário concluir a redefinição.", expiresAt: prepared.expiresAt };
}

export function validateResetInput(input: Record<string, unknown>) {
  if (Object.keys(input).some(key => !["token", "newPassword", "confirmation"].includes(key)) ||
      typeof input.token !== "string" || !tokenPattern.test(input.token)) throw failure();
  if (!validIdentityPassword(input.newPassword)) throw new PasswordResetError("Use uma senha com pelo menos 12 caracteres.");
  // bcrypt's byte limit applies to new reset credentials; existing login credentials stay untouched.
  if (bcrypt.truncates(input.newPassword)) throw new PasswordResetError("A senha é muito longa. Use uma senha menor.");
  if (input.newPassword !== input.confirmation) throw new PasswordResetError("A confirmação deve ser igual à nova senha.");
  return { token: input.token, newPassword: input.newPassword };
}

export async function consumePasswordReset(db: PrismaClient, policy: ResetPolicy, input: { token: string; newPassword: string }) {
  const match = tokenPattern.exec(input.token); if (!match) throw failure();
  return db.$transaction(async tx => {
    await requireAdmissionDatabase(tx);
    const grant = await tx.auditEvent.findUnique({ where: { id: match[1] } });
    if (!grant || grant.action !== "PASSWORD_RESET_ISSUED" || grant.accessMode !== "PLATFORM_ADMIN" || grant.result !== "SUCCESS" ||
        grant.resourceType !== "AuthIdentity" || !grant.resourceId || !grant.actorIdentityId || !grant.platformAdminId) throw failure();
    await lockIdentities(tx, [grant.resourceId, grant.actorIdentityId]);
    const identity = await tx.authIdentity.findUnique({ where: { id: grant.resourceId }, select: identityFields });
    const actor = await tx.authIdentity.findUnique({ where: { id: grant.actorIdentityId }, select: identityFields });
    const meta = grant.metadata as Record<string, unknown> | null, now = await instant(tx);
    if (!identity || identity.status !== "ACTIVE" || !actor || actor.status !== "ACTIVE" ||
        actor.platformAdmin?.status !== "ACTIVE" || actor.platformAdmin.id !== grant.platformAdminId ||
        !meta || Array.isArray(meta) || Object.keys(meta).sort().join() !== "expiresAt,origin" ||
        meta.origin !== policy.origin || typeof meta.expiresAt !== "string") throw failure();
    const expiry = Date.parse(meta.expiresAt);
    if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== meta.expiresAt || expiry <= now.getTime() ||
        expiry > grant.occurredAt.getTime() + RESET_TTL_MS + 1000 || !resetRecipientAllowed(identity.email, policy) ||
        !timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(policy, grant.id, identity, actor, meta.expiresAt))) ||
        await ended(tx, grant.id) || !await tx.auditEvent.count({ where: { resourceType: "PasswordResetAuthorization", resourceId: grant.id, action: "PASSWORD_RESET_EMAIL_SENT", result: "SUCCESS" } })) throw failure();
    const nextHash = await bcrypt.hash(input.newPassword, 12);
    await commitIdentityPassword(tx, identity, nextHash);
    await writeAudit(tx, { actorIdentityId: identity.id, accessMode: "SYSTEM", action: "PASSWORD_RESET_CONSUMED",
      resourceType: "PasswordResetAuthorization", resourceId: grant.id });
    return { message: "Senha alterada com sucesso. Entre novamente com a nova senha." };
  }, txOptions);
}
