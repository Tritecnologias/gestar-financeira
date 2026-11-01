import { createAdmissionIdentity } from "@/lib/admissions";
import { admissionBody, admissionJson, admissionProof, admissionRequest, admissionRouteId, admissionUser, type AdmissionRouteContext } from "@/lib/admission-http";

export const POST = admissionRequest("ADMISSION_IDENTITY", async (req: Request, context: AdmissionRouteContext) => {
  const id = await admissionRouteId(context), body = await admissionBody(req, ["password"]);
  return admissionJson(await createAdmissionIdentity(id, await admissionProof(id), await admissionUser(), body.password));
});
