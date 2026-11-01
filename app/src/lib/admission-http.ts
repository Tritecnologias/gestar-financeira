import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenant";
import { withAccessRequest } from "@/lib/access-request-context";
import { readExperimentBody } from "@/lib/experiment-request-body";
import { ExperimentAbuseBudget } from "@/lib/experiment-abuse-budget";
import { trustedClientIp } from "@/lib/trusted-proxy";
import { admissionHash, openAdmissionProof, sealAdmissionProof, type AdmissionProof } from "@/lib/admission-crypto";
import { ADMISSION_HEADERS, admissionFailure, requireAdmissionOrigin, validAdmissionId } from "@/lib/admission-policy";
import type { AdmissionUser } from "@/lib/admissions";

const state = globalThis as typeof globalThis & { __admissionBudget?: ExperimentAbuseBudget };
const budget = state.__admissionBudget ??= new ExperimentAbuseBudget();
export type AdmissionRouteContext = { params: Promise<{ id: string }> };
export const admissionJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: ADMISSION_HEADERS });

export function admissionRequest<A extends unknown[]>(flow: string, handler: (req: Request, ...args: A) => Promise<Response>) {
  return withAccessRequest(flow, async (req: Request, ...args: A) => {
    try {
      const origin = requireAdmissionOrigin();
      if ((req.method !== "GET" && req.headers.get("origin") !== origin) || req.headers.get("sec-fetch-site") === "cross-site")
        throw admissionFailure("Origem inválida.", 403);
      const ip = await trustedClientIp(req.headers);
      if (!budget.request(ip ? admissionHash(ip) : null)) throw admissionFailure("Muitas tentativas. Aguarde alguns minutos.", 429);
      return await handler(req, ...args);
    } catch (error) {
      const e = error as { status?: number; message?: string };
      const status = e.status && e.status >= 400 && e.status < 500 ? e.status : 503;
      const response = admissionJson({ error: status === 503 ? "Não foi possível concluir agora. Tente novamente." : e.message }, status);
      if (status === 429) response.headers.set("Retry-After", "300");
      return response;
    }
  });
}
export async function admissionRouteId(context: AdmissionRouteContext) {
  const { id } = await context.params;
  if (!validAdmissionId(id)) throw admissionFailure("Não encontrado.", 404);
  if (!budget.token(admissionHash(id))) throw admissionFailure("Muitas tentativas. Aguarde alguns minutos.", 429);
  return id;
}
export async function admissionBody(req: Request, fields: string[]) {
  const body = await readExperimentBody(req);
  if (Object.keys(body).some(key => !fields.includes(key))) throw admissionFailure("Requisição inválida.", 400);
  return body;
}
export async function admissionAdmin() {
  const actor = await requirePlatformAdmin();
  if (!actor.identityId) throw admissionFailure("Identidade administrativa necessária.", 403);
  return actor.identityId;
}
export async function admissionUser(): Promise<AdmissionUser> {
  const cookieStore = await cookies();
  if (cookieStore.get("support_context")?.value || cookieStore.get("advisory_context")?.value)
    throw admissionFailure("Saia do contexto de suporte ou assessoria para continuar a adesão.", 403);
  const user = (await auth())?.user as { id?: string; authMode?: string; loginNonce?: string } | undefined;
  if (!user) return null;
  if (user.authMode !== "identity" || !user.id || !user.loginNonce) throw admissionFailure("Entre com sua identidade para continuar.", 401);
  return { id: user.id, authMode: "identity", loginNonce: user.loginNonce };
}
const cookieName = (id: string) => "dez-admission-" + id;
export async function admissionProof(id: string) {
  return openAdmissionProof((await cookies()).get(cookieName(id))?.value || "", process.env.ADMISSION_SESSION_KEY!, id);
}
export function withAdmissionProof(response: NextResponse, proof: AdmissionProof) {
  response.cookies.set(cookieName(proof.admissionId), sealAdmissionProof(proof, process.env.ADMISSION_SESSION_KEY!), {
    httpOnly: true, sameSite: "strict", secure: requireAdmissionOrigin().startsWith("https:"),
    path: "/api/admissions/" + proof.admissionId, expires: new Date(proof.until),
  });
  return response;
}
