import { requirePlatformAdmin } from "@/lib/tenant";
import { accountDatabase } from "@/lib/account-db";
import { issuePasswordReset } from "@/lib/password-reset";
import { PasswordResetError } from "@/lib/password-reset-policy";
import { sessionCredentialStamp } from "@/lib/auth";
import { resetBody, resetJson, resetRequest } from "@/lib/password-reset-http";

export const POST = resetRequest("account.password.reset.issue", async (req, policy, context: { params: Promise<{ id: string }> }) => {
  const actor = await requirePlatformAdmin();
  if (!actor.identityId) throw new PasswordResetError("Identidade administrativa necessária.", 403);
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new PasswordResetError("Conta inválida.");
  const body = await resetBody(req, ["confirm", "adminPassword"]);
  if (body.confirm !== true || typeof body.adminPassword !== "string" || !body.adminPassword || body.adminPassword.length > 200)
    throw new PasswordResetError("Confirme a ação com a sua senha de administrador.");
  const stamp = await sessionCredentialStamp(actor.identityId);
  return resetJson(await issuePasswordReset(accountDatabase(), actor.identityId, id, body.adminPassword, policy, stamp));
});
