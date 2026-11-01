import { cookies } from "next/headers";
import { provisionAdmission } from "@/lib/admissions";
import { tenantContextCookieOptions } from "@/lib/access-policy";
import { admissionBody, admissionJson, admissionProof, admissionRequest, admissionRouteId, admissionUser, type AdmissionRouteContext } from "@/lib/admission-http";

export const POST = admissionRequest("ADMISSION_PROVISION", async (req: Request, context: AdmissionRouteContext) => {
  const id = await admissionRouteId(context), body = await admissionBody(req, ["nome"]), user = await admissionUser();
  const result = await provisionAdmission(id, await admissionProof(id), user, body.nome, !!(await cookies()).get("tenant_context")?.value);
  const response = admissionJson(result, result.created ? 201 : 200);
  response.cookies.set("tenant_context", `${user!.id}:${user!.loginNonce}:${result.tenantId}`, tenantContextCookieOptions());
  for (const name of ["advisory_context", "support_context"]) response.cookies.set(name, "", { ...tenantContextCookieOptions(), maxAge: 0 });
  return response;
});
