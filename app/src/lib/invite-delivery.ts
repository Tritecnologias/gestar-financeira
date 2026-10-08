import type { AuditInput } from "@/lib/audit";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type EmailServiceConfig, sendInvitationEmail } from "@/lib/email-service";
import { invitationUrl } from "@/lib/email-template";

type Actor = Pick<AuditInput, "actorIdentityId" | "actorMembershipId" | "platformAdminId" | "supportGrantId" | "accessMode">;

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
