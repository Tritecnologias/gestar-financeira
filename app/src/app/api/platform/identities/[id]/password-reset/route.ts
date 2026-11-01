import { requirePlatformAdmin } from "@/lib/tenant";
import { accountDatabase } from "@/lib/account-db";
import { getResetDelivery, issuePasswordReset } from "@/lib/password-reset";
import { PasswordResetError, RESET_UNAVAILABLE } from "@/lib/password-reset-policy";
import { resetBody, resetJson, resetRequest } from "@/lib/password-reset-http";

export const POST = resetRequest("account.password.reset.issue", async (req, _policy, context: { params: Promise<{ id: string }> }) => {
  const actor = await requirePlatformAdmin();
  if (!actor.identityId) throw new PasswordResetError("Identidade administrativa necessária.", 403);
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new PasswordResetError("Conta inválida.");
  const body = await resetBody(req, ["confirm", "adminPassword"]);
  if (body.confirm !== true || typeof body.adminPassword !== "string" || !body.adminPassword || body.adminPassword.length > 200)
    throw new PasswordResetError("Confirme a ação com a sua senha de administrador.");
  const delivery = getResetDelivery();
  if (!delivery) throw new PasswordResetError(RESET_UNAVAILABLE, 503);
  return resetJson(await issuePasswordReset(accountDatabase(), actor.identityId, id, body.adminPassword, delivery));
});
