import type { AuditInput } from "@/lib/audit";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type EmailServiceConfig, getEmailServiceConfig, getInvitationPublicUrl, sendInvitationEmail } from "@/lib/email-service";
import { invitationUrl } from "@/lib/email-template";

type Actor = Pick<AuditInput, "actorIdentityId" | "actorMembershipId" | "platformAdminId" | "supportGrantId" | "accessMode">;

export const INVITATION_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "Vary": "Cookie, Origin",
};

export type InvitationDelivery = { channel: "MANUAL_SHARE"; publicUrl: URL } |
  { channel: "EMAIL"; email: EmailServiceConfig };

export function invitationDelivery(requestUrl: URL, channel: unknown): InvitationDelivery {
  if (channel !== undefined && channel !== "MANUAL_SHARE" && channel !== "EMAIL") {
    throw Object.assign(new Error("Canal de convite inválido."), { status: 400 });
  }
  const email = channel === "MANUAL_SHARE" ? null : getEmailServiceConfig(requestUrl);
  if (channel === "EMAIL" && !email) throw Object.assign(new Error("Envio por e-mail indisponível. Use o compartilhamento manual."), { status: 503 });
  // Older callers keep email when configured; the UI explicitly requests MANUAL_SHARE.
  if (email) return { channel: "EMAIL", email };
  const publicUrl = getInvitationPublicUrl(requestUrl);
  if (!publicUrl) throw Object.assign(new Error("Endereço público da aplicação não configurado para convites."), { status: 503 });
  return { channel: "MANUAL_SHARE", publicUrl };
}

export async function issueInvitationDelivery(config: InvitationDelivery, input: {
  id: string; tenantId: string; to: string; name: string; role: string; profileName: string;
  tenantName: string; token: string; expiresAt: Date; actor: Actor; replacesId?: string;
}) {
  if (input.replacesId) await writeAudit(prisma, { tenantId: input.tenantId, ...input.actor,
    action: "INVITE_REISSUED", resourceType: "AccessInvite", resourceId: input.id,
    metadata: { previousInviteId: input.replacesId, channel: config.channel } });
  if (config.channel === "EMAIL") return deliverAndAuditInvitation(config.email, input);
  await writeAudit(prisma, { tenantId: input.tenantId, ...input.actor,
    action: "INVITE_MANUAL_LINK_ISSUED", resourceType: "AccessInvite", resourceId: input.id,
    metadata: { channel: "MANUAL_SHARE" } });
  // Deliberate one-time disclosure to the freshly authorized creator, never a GET/history DTO.
  return { delivery: { status: "MANUAL_SHARE", provider: null }, share: {
    id: input.id, name: input.name, email: input.to, tenantName: input.tenantName,
    role: input.role, profileName: input.profileName, expiresAt: input.expiresAt,
    link: invitationUrl(config.publicUrl, input.token),
  } };
}

export async function deliverAndAuditInvitation(config: EmailServiceConfig, input: {
  id: string; tenantId: string; to: string; tenantName: string; token: string; expiresAt: Date; actor: Actor;
}) {
  const delivery = await sendInvitationEmail(config, input);
  await writeAudit(prisma, { tenantId: input.tenantId, ...input.actor,
    action: delivery.status === "FAILED" ? "INVITE_EMAIL_FAILED" :
      delivery.status === "SIMULATED" ? "INVITE_EMAIL_SIMULATED" : "INVITE_EMAIL_SENT",
    resourceType: "AccessInvite", resourceId: input.id,
    result: delivery.status === "FAILED" ? "FAILURE" : "SUCCESS",
    metadata: { provider: delivery.provider, deliveryStatus: delivery.status } });
  return { delivery, ...(delivery.status === "SIMULATED" && config.dev
    ? { devLink: invitationUrl(config.publicUrl, input.token) } : {}) };
}
