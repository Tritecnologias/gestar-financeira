import { inspectAdmission } from "@/lib/admissions";
import { admissionJson, admissionProof, admissionRequest, admissionRouteId, admissionUser, type AdmissionRouteContext } from "@/lib/admission-http";

export const GET = admissionRequest("ADMISSION_STATE", async (_req: Request, context: AdmissionRouteContext) => {
  const id = await admissionRouteId(context);
  return admissionJson(await inspectAdmission(id, await admissionProof(id), await admissionUser()));
});
