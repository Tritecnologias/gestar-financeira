import { requestAdmissionLink } from "@/lib/admissions";
import { admissionBody, admissionJson, admissionRequest } from "@/lib/admission-http";
import { RESUME_MESSAGE, validAdmissionId } from "@/lib/admission-policy";

export const POST = admissionRequest("ADMISSION_LINK_REQUEST", async (req: Request) => {
  const body = await admissionBody(req, ["email", "admissionId"]);
  // Malformed/unknown references receive the same answer and never fall back to a different grant.
  if (body.admissionId === undefined || validAdmissionId(body.admissionId)) await requestAdmissionLink(body.email, body.admissionId);
  return admissionJson({ message: RESUME_MESSAGE });
});
