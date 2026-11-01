import { authorizeAdmission, cancelAdmission, inspectAdministrativeAdmission } from "@/lib/admissions";
import { admissionAdmin, admissionBody, admissionJson, admissionRequest, admissionRouteId, type AdmissionRouteContext } from "@/lib/admission-http";

export const GET = admissionRequest("ADMISSION_ADMIN_READ", async (_req: Request, context: AdmissionRouteContext) => {
  const actor = await admissionAdmin(), id = await admissionRouteId(context);
  return admissionJson({ admission: await inspectAdministrativeAdmission(id, actor) });
});
export const POST = admissionRequest("ADMISSION_AUTHORIZE", async (req: Request, context: AdmissionRouteContext) => {
  const actor = await admissionAdmin(), id = await admissionRouteId(context);
  const body = await admissionBody(req, ["email", "hours"]);
  const result = await authorizeAdmission(id, actor, body.email, body.hours);
  return admissionJson(result, result.created ? 201 : 200);
});
export const DELETE = admissionRequest("ADMISSION_CANCEL", async (req: Request, context: AdmissionRouteContext) => {
  const actor = await admissionAdmin(), id = await admissionRouteId(context), body = await admissionBody(req, ["reason"]);
  return admissionJson(await cancelAdmission(id, actor, body.reason));
});
