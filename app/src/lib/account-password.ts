import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validIdentityPassword, PASSWORD_POLICY_MESSAGE } from "./password-policy";
import { writeAudit } from "./audit";

type Change = { currentPassword: string; newPassword: string; confirmation: string };
export function validatePasswordChange(input: unknown): { value: Change } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Preencha os campos de senha." };
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["currentPassword", "newPassword", "confirmation"].includes(key))) {
    return { error: "Solicitação inválida. Altere somente a senha da sua conta." };
  }
  if (typeof body.currentPassword !== "string" || !body.currentPassword || body.currentPassword.length > 200) return { error: "Informe sua senha atual." };
  if (!validIdentityPassword(body.newPassword)) return { error: PASSWORD_POLICY_MESSAGE };
  if (body.newPassword !== body.confirmation) return { error: "A confirmação deve ser igual à nova senha." };
  return { value: body as Change };
}

// The actor ID comes exclusively from the validated session, never from input.
export async function changeOwnPassword(db: PrismaClient, identityId: string, input: Change) {
  return db.$transaction(async tx => {
    // Serialize changes and failed-attempt accounting for this identity only.
    await tx.$queryRaw`SELECT id FROM auth_identities WHERE id=${identityId} FOR UPDATE`;
    const identity = await tx.authIdentity.findUnique({ where: { id: identityId }, select: { id: true, status: true, senhaHash: true } });
    if (!identity || identity.status !== "ACTIVE") return { ok: false, status: 401, error: "Entre novamente para alterar sua senha." };
    const recent = await tx.auditEvent.count({ where: { actorIdentityId: identityId, action: "PASSWORD_CHANGE_DENIED",
      occurredAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } });
    if (recent >= 5) return { ok: false, status: 429, error: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." };
    if (!await bcrypt.compare(input.currentPassword, identity.senhaHash)) {
      await writeAudit(tx, { actorIdentityId: identityId, accessMode: "SYSTEM", action: "PASSWORD_CHANGE_DENIED",
        resourceType: "AuthIdentity", resourceId: identityId, result: "DENIED" });
      return { ok: false, status: 400, error: "A senha atual está incorreta." };
    }
    const nextHash = await bcrypt.hash(input.newPassword, 12);
    const changed = await tx.authIdentity.updateMany({ where: { id: identityId, status: "ACTIVE", senhaHash: identity.senhaHash }, data: { senhaHash: nextHash } });
    if (changed.count !== 1) throw Object.assign(new Error("Sua conta foi alterada. Entre novamente e tente outra vez."), { status: 409 });
    await writeAudit(tx, { actorIdentityId: identityId, accessMode: "SYSTEM", action: "PASSWORD_CHANGED",
      resourceType: "AuthIdentity", resourceId: identityId });
    return { ok: true, status: 200 };
  }, { maxWait: 5000, timeout: 15000 });
}
