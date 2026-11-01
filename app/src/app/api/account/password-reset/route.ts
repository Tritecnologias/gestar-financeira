import { accountDatabase } from "@/lib/account-db";
import { consumePasswordReset, validateResetInput } from "@/lib/password-reset";
import { resetBody, resetJson, resetRequest } from "@/lib/password-reset-http";

export const POST = resetRequest("account.password.reset.consume", async (req, policy) => {
  const input = validateResetInput(await resetBody(req, ["token", "newPassword", "confirmation"]));
  const response = resetJson(await consumePasswordReset(accountDatabase(), policy, input));
  for (const cookie of ["authjs.session-token", "tenant_context", "support_context", "advisory_context"])
    response.cookies.set(cookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
});
