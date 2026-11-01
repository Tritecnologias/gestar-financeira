import { Prisma, type Admission } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/email";
import { PASSWORD_POLICY_MESSAGE, validIdentityPassword } from "@/lib/password-policy";
import { admissionEmail, admissionFailure, requireAdmissionOrigin, retryableAdmissionTransaction } from "@/lib/admission-policy";
import { admissionHash, matchesAdmissionToken, newAdmissionToken, type AdmissionProof } from "@/lib/admission-crypto";
import { deliverAdmissionChallenge } from "@/lib/admission-delivery";

type Tx = Prisma.TransactionClient;
export type AdmissionUser = { id: string; authMode: "identity"; loginNonce: string } | null;
const minutes = (n: number) => n * 60000;
const denied = () => admissionFailure();

async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  requireAdmissionOrigin();
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) {
      if (attempt >= 3 || !retryableAdmissionTransaction(error)) throw error;
      // Restart every read and authority check; never reuse a partial transaction result.
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}
async function now(tx: Tx) {
  return (await tx.$queryRaw<{ instant: Date }[]>`SELECT date_trunc('milliseconds',clock_timestamp()) AS instant`)[0].instant;
}
async function admin(tx: Tx, identityId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT a.id FROM platform_admins a JOIN auth_identities i ON i.id=a.identity_id
    WHERE a.identity_id=${identityId} AND a.status='ACTIVE' AND i.status='ACTIVE' FOR SHARE OF a,i`;
  if (!rows.length) throw admissionFailure("Acesso negado.", 403);
  return rows[0].id;
}
async function invitation(tx: Tx, id: string, active = true) {
  await tx.$queryRaw`SELECT id FROM experiment_invitations WHERE id=${id} FOR UPDATE`;
  const row = await tx.experimentInvitation.findUnique({ where: { id } });
  const instant = await now(tx);
  if (!row || (active && (!row.interestAt || row.revokedAt || row.expiresAt <= instant))) throw denied();
  return row;
}
async function lockedAdmission(tx: Tx, id: string, active = true) {
  const reference = await tx.admission.findUnique({ where: { id }, select: { experimentInvitationId: true } });
  if (!reference?.experimentInvitationId) throw denied();
  const origin = await invitation(tx, reference.experimentInvitationId, active);
  await tx.$queryRaw`SELECT id FROM admissions WHERE id=${id} FOR UPDATE`;
  const row = await tx.admission.findUniqueOrThrow({ where: { id } });
  const instant = await now(tx);
  if (row.source !== "AUTHORIZED_INVITE" || row.sourceReference !== origin.id ||
      (active && (row.status !== "AUTHORIZED" || row.expiresAt <= instant))) throw denied();
  return { row, origin, instant };
}
function adminView(row: Admission) {
  return { id: row.id, email: row.authorizedEmail, status: row.status, expiresAt: row.expiresAt, emailVerified: !!row.emailVerifiedAt };
}

type PreparedMail = { admissionId: string; challengeId: string; to: string; token: string; expiresAt: Date };
async function emailLock(tx: Tx, email: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"admission-mail:" + email},0))`;
}
/** Caller holds the recipient lock, then invitation/admission locks. Counts survive process restarts. */
async function prepareChallenge(tx: Tx, row: Admission): Promise<PreparedMail | null> {
  const instant = await now(tx);
  if (row.status !== "AUTHORIZED" || row.expiresAt <= instant) throw denied();
  const recent = await tx.admissionChallenge.findMany({ where: {
    OR: [{ admissionId: row.id }, { recipientEmail: row.authorizedEmail }],
    issuedAt: { gt: new Date(instant.getTime() - minutes(15)) },
  }, select: { issuedAt: true }, orderBy: { issuedAt: "desc" }, take: 3 });
  if (recent.length >= 3 || (recent[0] && instant.getTime() - recent[0].issuedAt.getTime() < minutes(1))) return null;
  const purpose = row.emailVerifiedAt ? "RESUME" : "EMAIL_VERIFICATION";
  const previous = await tx.admissionChallenge.findFirst({ where: { admissionId: row.id, purpose }, orderBy: { generation: "desc" }, select: { generation: true } });
  const revoked = await tx.admissionChallenge.updateMany({ where: { admissionId: row.id, status: "PENDING" }, data: { status: "REVOKED", revokedAt: instant } });
  if (revoked.count) await writeAudit(tx, { accessMode: "SYSTEM", action: "ADMISSION_CHALLENGE_REVOKED", resourceType: "Admission", resourceId: row.id, metadata: { count: revoked.count } });
  const token = newAdmissionToken();
  const challenge = await tx.admissionChallenge.create({ data: {
    admissionId: row.id, recipientEmail: row.authorizedEmail, purpose, generation: (previous?.generation ?? 0) + 1,
    tokenHash: admissionHash(token), issuedAt: instant,
    expiresAt: new Date(Math.min(row.expiresAt.getTime(), instant.getTime() + minutes(purpose === "EMAIL_VERIFICATION" ? 15 : 30))),
  } });
  await writeAudit(tx, { accessMode: "SYSTEM", action: "ADMISSION_CHALLENGE_ISSUED", resourceType: "AdmissionChallenge", resourceId: challenge.id,
    metadata: { admissionId: row.id, purpose, generation: challenge.generation } });
  return { admissionId: row.id, challengeId: challenge.id, to: row.authorizedEmail, token, expiresAt: challenge.expiresAt };
}
async function deliver(prepared: PreparedMail | null) {
  if (!prepared) return "DEFERRED" as const;
  const delivery = await deliverAdmissionChallenge(prepared);
  await transaction(async tx => {
    await lockedAdmission(tx, prepared.admissionId, false);
    await tx.admissionChallenge.update({ where: { id: prepared.challengeId }, data: { deliveryStatus: delivery.status } });
    await writeAudit(tx, { accessMode: "SYSTEM", action: "ADMISSION_DELIVERY_" + delivery.status,
      resourceType: "AdmissionChallenge", resourceId: prepared.challengeId,
      result: delivery.status === "FAILED" ? "FAILURE" : "SUCCESS", metadata: { admissionId: prepared.admissionId, provider: delivery.provider } });
  });
  return delivery.status;
}

export async function authorizeAdmission(invitationId: string, actorIdentityId: string, emailValue: unknown, hoursValue: unknown) {
  const email = admissionEmail(emailValue), hours = hoursValue === undefined ? 72 : hoursValue;
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 168) throw admissionFailure("Validade de 1 a 168 horas necessária.", 400);
  const result = await transaction(async tx => {
    const adminId = await admin(tx, actorIdentityId);
    await emailLock(tx, email);
    const origin = await invitation(tx, invitationId), instant = await now(tx);
    const existing = await tx.admission.findUnique({ where: { experimentInvitationId: invitationId } });
    if (existing) {
      if (existing.authorizedEmail !== email || existing.status !== "AUTHORIZED" || existing.expiresAt <= instant) throw denied();
      // A repeated administrative acceptance never resends mail, changes email or extends expiry.
      return { view: adminView(existing), created: false, mail: null as PreparedMail | null };
    }
    const row = await tx.admission.create({ data: { source: "AUTHORIZED_INVITE", sourceReference: origin.id,
      experimentInvitationId: origin.id, authorizedEmail: email, authorizedByAdminId: adminId,
      authorizedByIdentityId: actorIdentityId, authorizedAt: instant,
      expiresAt: new Date(Math.min(origin.expiresAt.getTime(), instant.getTime() + hours * 3600000)) } });
    await writeAudit(tx, { actorIdentityId, platformAdminId: adminId, accessMode: "PLATFORM_ADMIN",
      action: "ADMISSION_AUTHORIZED", resourceType: "Admission", resourceId: row.id, metadata: { invitationId: origin.id } });
    return { view: adminView(row), created: true, mail: await prepareChallenge(tx, row) };
  });
  return { ...result.view, created: result.created, delivery: result.created ? await deliver(result.mail) : "UNCHANGED" };
}

export async function inspectAdministrativeAdmission(invitationId: string, actorIdentityId: string) {
  return transaction(async tx => {
    await admin(tx, actorIdentityId); await invitation(tx, invitationId, false);
    const row = await tx.admission.findUnique({ where: { experimentInvitationId: invitationId } });
    return row ? adminView(row) : null;
  });
}

export async function cancelAdmission(invitationId: string, actorIdentityId: string, reasonValue: unknown) {
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  if (reason.length < 3 || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason)) throw admissionFailure("Informe um motivo de 3 a 200 caracteres.", 400);
  return transaction(async tx => {
    const adminId = await admin(tx, actorIdentityId); await invitation(tx, invitationId, false);
    const existing = await tx.admission.findUnique({ where: { experimentInvitationId: invitationId } });
    if (!existing) throw denied();
    const { row, instant } = await lockedAdmission(tx, existing.id, false);
    if (row.status === "CANCELLED") return adminView(row);
    if (row.status !== "AUTHORIZED") throw denied();
    await tx.admissionChallenge.updateMany({ where: { admissionId: row.id, status: "PENDING" }, data: { status: "REVOKED", revokedAt: instant } });
    const cancelled = await tx.admission.update({ where: { id: row.id, status: "AUTHORIZED" }, data: {
      status: "CANCELLED", cancelledAt: instant, cancelledByAdminId: adminId, cancelledByIdentityId: actorIdentityId, cancellationReason: reason } });
    await writeAudit(tx, { actorIdentityId, platformAdminId: adminId, accessMode: "PLATFORM_ADMIN",
      action: "ADMISSION_CANCELLED", resourceType: "Admission", resourceId: row.id });
    return adminView(cancelled);
  });
}

/** Same response for absent, cancelled, expired, throttled and temporarily undeliverable grants. */
export async function requestAdmissionLink(emailValue: unknown, id?: string) {
  requireAdmissionOrigin();
  let email: string;
  try { email = admissionEmail(emailValue); } catch { return; }
  let mail: PreparedMail | null;
  try {
    mail = await transaction(async tx => {
      await emailLock(tx, email);
      const instant = await now(tx);
      const candidates = await tx.admission.findMany({ where: { authorizedEmail: email, status: "AUTHORIZED", expiresAt: { gt: instant },
        experimentInvitation: { revokedAt: null, expiresAt: { gt: instant }, interestAt: { not: null } }, ...(id ? { id } : {}) },
        select: { id: true }, take: 2 });
      // Never silently choose among distinct authorizations belonging to the same identity.
      // An interrupted page and every original email carry their non-secret stable reference.
      if (candidates.length !== 1) return null;
      const { row } = await lockedAdmission(tx, candidates[0].id);
      if (row.authorizedEmail !== email) throw denied();
      return prepareChallenge(tx, row);
    });
  } catch (error) {
    if ((error as { status?: number }).status === 409) return;
    throw error;
  }
  if (mail) await deliver(mail);
}

async function assertProof(tx: Tx, row: Admission, proof: AdmissionProof | null, instant: Date) {
  if (!proof || proof.admissionId !== row.id || proof.until <= instant.getTime() || !row.emailVerifiedAt ||
      proof.verificationId !== row.verifiedChallengeId) throw admissionFailure("Confirme o e-mail para continuar.", 401);
  const verified = await tx.admissionChallenge.findFirst({ where: { id: proof.verificationId, admissionId: row.id,
    purpose: "EMAIL_VERIFICATION", recipientEmail: row.authorizedEmail, status: "CONSUMED", consumedAt: row.emailVerifiedAt } });
  const access = await tx.admissionChallenge.findFirst({ where: { id: proof.accessId, admissionId: row.id,
    recipientEmail: row.authorizedEmail, status: "CONSUMED" } });
  if (!verified || !access || !access.consumedAt || (access.purpose === "EMAIL_VERIFICATION" && access.id !== verified.id) ||
      proof.until > Math.min(row.expiresAt.getTime(), access.consumedAt.getTime() + minutes(30)))
    throw admissionFailure("Confirme o e-mail para continuar.", 401);
}

export async function verifyAdmissionChallenge(id: string, challengeId: string, token: unknown, currentProof: AdmissionProof | null) {
  const result = await transaction(async tx => {
    const { row, instant } = await lockedAdmission(tx, id);
    await tx.$queryRaw`SELECT id FROM admission_challenges WHERE id=${challengeId} AND admission_id=${id} FOR UPDATE`;
    const challenge = await tx.admissionChallenge.findFirst({ where: { id: challengeId, admissionId: id, recipientEmail: row.authorizedEmail } });
    if (!challenge) return { rejected: true as const };
    if (challenge.status === "CONSUMED" && currentProof?.accessId === challenge.id) {
      await assertProof(tx, row, currentProof, instant);
      return { proof: currentProof }; // Only the already-established browser proof permits a harmless replay.
    }
    const eligible = challenge.status === "PENDING" && challenge.expiresAt > instant && challenge.attemptCount < challenge.maxAttempts;
    if (!eligible || !matchesAdmissionToken(token, challenge.tokenHash)) {
      if (challenge.status === "PENDING") {
        const count = Math.min(challenge.maxAttempts, challenge.attemptCount + 1);
        await tx.admissionChallenge.update({ where: { id: challenge.id }, data: { attemptCount: count, lastAttemptAt: instant,
          ...(!eligible || count === challenge.maxAttempts ? { status: "REVOKED", revokedAt: instant } : {}) } });
      }
      await writeAudit(tx, { accessMode: "SYSTEM", action: "ADMISSION_CHALLENGE_DENIED", resourceType: "AdmissionChallenge", resourceId: challenge.id, result: "DENIED" });
      // Return, do not throw: rejected attempts and terminal revocation must commit.
      return { rejected: true as const };
    }
    if ((challenge.purpose === "RESUME" && !row.verifiedChallengeId) ||
        (challenge.purpose === "EMAIL_VERIFICATION" && row.verifiedChallengeId)) return { rejected: true as const };
    if (challenge.purpose === "RESUME" && !await tx.admissionChallenge.findFirst({ where: {
      id: row.verifiedChallengeId!, admissionId: id, recipientEmail: row.authorizedEmail,
      purpose: "EMAIL_VERIFICATION", status: "CONSUMED", consumedAt: row.emailVerifiedAt!,
    }, select: { id: true } })) return { rejected: true as const };
    await tx.admissionChallenge.update({ where: { id: challenge.id, status: "PENDING" }, data: {
      status: "CONSUMED", consumedAt: instant, lastAttemptAt: instant, attemptCount: challenge.attemptCount + 1 } });
    if (challenge.purpose === "EMAIL_VERIFICATION") {
      const changed = await tx.admission.updateMany({ where: { id, status: "AUTHORIZED", verifiedChallengeId: null },
        data: { verifiedChallengeId: challenge.id, emailVerifiedAt: instant } });
      if (changed.count !== 1) throw denied();
    }
    await writeAudit(tx, { accessMode: "SYSTEM", action: challenge.purpose === "RESUME" ? "ADMISSION_RESUMED" : "ADMISSION_EMAIL_VERIFIED",
      resourceType: "Admission", resourceId: id, metadata: { challengeId: challenge.id, generation: challenge.generation } });
    return { proof: { admissionId: id, verificationId: row.verifiedChallengeId ?? challenge.id, accessId: challenge.id,
      until: Math.min(row.expiresAt.getTime(), instant.getTime() + minutes(30)) } };
  });
  if (result.rejected || !result.proof) throw denied();
  return result.proof;
}

/** No tenant, OWNER, terms or enterprise session can be created by this service. */
export async function inspectAdmission(id: string, proof: AdmissionProof | null, user: AdmissionUser) {
  return transaction(async tx => {
    const { row, instant } = await lockedAdmission(tx, id); await assertProof(tx, row, proof, instant);
    const identity = await tx.authIdentity.findUnique({ where: { email: normalizeEmail(row.authorizedEmail) }, select: { id: true, status: true } });
    if (identity && identity.status !== "ACTIVE") throw admissionFailure("Conta indisponível. Solicite atendimento para recuperar seu acesso.", 403);
    const ready = !!identity && user?.id === identity.id;
    return { id: row.id, email: row.authorizedEmail, emailVerified: true, expiresAt: row.expiresAt,
      state: ready ? "IDENTITY_VERIFIED" : identity ? "LOGIN_REQUIRED" : "CREATE_IDENTITY",
      ...(ready ? { identityId: identity.id } : {}), nextPhase: "A.2.3", canProvision: false };
  });
}

export async function createAdmissionIdentity(id: string, proof: AdmissionProof | null, user: AdmissionUser, password: unknown) {
  // Prove authority before spending bcrypt work; recheck all evidence under locks afterwards.
  const initial = await inspectAdmission(id, proof, user);
  if (initial.state !== "CREATE_IDENTITY") return { created: false, email: initial.email };
  if (user) throw admissionFailure("Saia da conta atual antes de criar uma identidade.", 409);
  if (!validIdentityPassword(password)) throw admissionFailure(PASSWORD_POLICY_MESSAGE, 400);
  const hash = await bcrypt.hash(password, 12);
  return transaction(async tx => {
    const { row, origin, instant } = await lockedAdmission(tx, id); await assertProof(tx, row, proof, instant);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"identity-email:" + row.authorizedEmail},0))`;
    const existing = await tx.authIdentity.findUnique({ where: { email: row.authorizedEmail }, select: { id: true, status: true } });
    if (existing) {
      if (existing.status !== "ACTIVE") throw admissionFailure("Conta indisponível.", 403);
      return { created: false, email: row.authorizedEmail }; // Never update an existing password or profile.
    }
    const identity = await tx.authIdentity.create({ data: { email: row.authorizedEmail, nome: origin.recipientName, senhaHash: hash, status: "ACTIVE" } });
    await writeAudit(tx, { actorIdentityId: identity.id, accessMode: "SYSTEM", action: "IDENTITY_ACTIVATED", resourceType: "AuthIdentity", resourceId: identity.id,
      metadata: { admissionId: row.id } });
    return { created: true, email: row.authorizedEmail };
  });
}
