import { verifyAdmissionChallenge } from "@/lib/admissions";
import { admissionBody, admissionJson, admissionProof, admissionRequest, admissionRouteId, withAdmissionProof, type AdmissionRouteContext } from "@/lib/admission-http";
import { admissionFailure, validAdmissionId } from "@/lib/admission-policy";

export const POST = admissionRequest("ADMISSION_EMAIL_VERIFY", async (req: Request, context: AdmissionRouteContext) => {
  const id = await admissionRouteId(context), body = await admissionBody(req, ["challengeId", "token"]);
  if (!validAdmissionId(body.challengeId)) throw admissionFailure();
  const proof = await verifyAdmissionChallenge(id, body.challengeId, body.token, await admissionProof(id));
  return withAdmissionProof(admissionJson({ emailVerified: true }), proof);
});
