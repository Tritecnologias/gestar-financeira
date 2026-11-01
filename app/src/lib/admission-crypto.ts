import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newAdmissionToken = () => randomBytes(32).toString("base64url");
export const validAdmissionToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const admissionHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function matchesAdmissionToken(token: unknown, hash: string) {
  return validAdmissionToken(token) && /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(admissionHash(token), "hex"), Buffer.from(hash, "hex"));
}

// Separate AEAD domains for a restricted browser proof and the synthetic mail sink.
export function sealAdmissionValue(value: unknown, key: string, domain: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("ADMISSION_KEY_REQUIRED");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from(domain));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function openAdmissionValue(value: string, key: string, domain: string): unknown {
  try {
    if (!/^[a-f0-9]{64}$/.test(key) || !/^[A-Za-z0-9_-]{40,6000}$/.test(value)) return null;
    const bytes = Buffer.from(value, "base64url"), decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(domain)); decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
  } catch { return null; }
}

export type AdmissionProof = { admissionId: string; verificationId: string; accessId: string; until: number };
const sessionDomain = "dez/admission/restricted-session/v1";
export const sealAdmissionProof = (proof: AdmissionProof, key: string) => sealAdmissionValue(proof, key, sessionDomain);
export function openAdmissionProof(value: string, key: string, admissionId: string, now = Date.now()): AdmissionProof | null {
  const proof = openAdmissionValue(value, key, sessionDomain) as AdmissionProof | null;
  return proof && proof.admissionId === admissionId && typeof proof.verificationId === "string" &&
    typeof proof.accessId === "string" && Number.isSafeInteger(proof.until) && proof.until > now ? proof : null;
}
