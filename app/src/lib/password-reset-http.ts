import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAccessRequest } from "./access-request-context";
import { ExperimentAbuseBudget } from "./experiment-abuse-budget";
import { trustedClientIp } from "./trusted-proxy";
import { readExperimentBody } from "./experiment-request-body";
import { PasswordResetError, RESET_HEADERS, RESET_UNAVAILABLE, passwordResetPolicy, type ResetPolicy } from "./password-reset-policy";

const state = globalThis as typeof globalThis & { __resetBudget?: ExperimentAbuseBudget };
const budget = state.__resetBudget ??= new ExperimentAbuseBudget();
export const resetJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: RESET_HEADERS });
export function resetRequest<A extends unknown[]>(flow: string, handle: (req: Request, policy: ResetPolicy, ...args: A) => Promise<NextResponse>) {
  return withAccessRequest(flow, async (req: Request, ...args: A) => {
    try {
      const policy = passwordResetPolicy();
      if (!policy) throw new PasswordResetError(RESET_UNAVAILABLE, 503);
      if (req.headers.get("origin") !== policy.origin || req.headers.get("sec-fetch-site") === "cross-site") throw new PasswordResetError("Solicitação não permitida.", 403);
      const ip = await trustedClientIp(req.headers);
      if (!budget.request(ip ? createHash("sha256").update(ip).digest("hex") : null)) throw new PasswordResetError("Muitas tentativas. Aguarde alguns minutos.", 429);
      return await handle(req, policy, ...args);
    } catch (error) {
      const status = error instanceof PasswordResetError ? error.status : [400, 401, 403, 413, 415].includes((error as { status?: number })?.status || 0) ? (error as { status: number }).status : 503;
      const response = resetJson({ error: error instanceof PasswordResetError ? error.message : status === 503 ? "Não foi possível confirmar o reset. Nenhuma nova tentativa foi iniciada automaticamente." : "Solicitação não permitida." }, status);
      if (status === 429) response.headers.set("Retry-After", "900");
      return response;
    }
  });
}
export async function resetBody(req: Request, fields: string[]) {
  const body = await readExperimentBody(req);
  if (Object.keys(body).some(key => !fields.includes(key))) throw new PasswordResetError("Solicitação inválida.");
  return body;
}
