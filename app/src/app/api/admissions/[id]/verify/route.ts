import { redeemSpecialAdmission, verifyAdmissionChallenge } from "@/lib/admissions";
import { admissionBody, admissionJson, admissionProof, admissionUser, admissionRequest, admissionRouteId, withAdmissionProof, type AdmissionRouteContext } from "@/lib/admission-http";
import { admissionFailure, validAdmissionId } from "@/lib/admission-policy";

export const POST = admissionRequest("ADMISSION_VERIFY", async (req: Request, context: AdmissionRouteContext) => {
  const id = await admissionRouteId(context), body = await admissionBody(req, ["challengeId", "token", "invitationToken"]);
  if (Object.hasOwn(body, "invitationToken")) {
    if (Object.keys(body).length !== 1) throw admissionFailure("Requisição inválida.", 400);
    const proof = await redeemSpecialAdmission(id, body.invitationToken, await admissionProof(id), await admissionUser());
    const response = admissionJson({ authorizationVerified: true, emailVerified: false });
    return proof ? withAdmissionProof(response, proof) : response;
  }
  if (!validAdmissionId(body.challengeId)) throw admissionFailure();
  const proof = await verifyAdmissionChallenge(id, body.challengeId, body.token, await admissionProof(id));
  return withAdmissionProof(admissionJson({ emailVerified: true }), proof);
});
