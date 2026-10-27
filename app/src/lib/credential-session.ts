import { createHmac, timingSafeEqual } from "node:crypto";

// Only an opaque, keyed stamp enters the encrypted JWT. Never expose the stored
// bcrypt hash in a token/session/response. Changing a credential invalidates it.
export function credentialStamp(id: string, storedHash: string, secret: string) {
  if (!secret) throw new Error("AUTH_SECRET_REQUIRED");
  return createHmac("sha256", secret).update("10s-credential-session/v1\0").update(id).update("\0").update(storedHash).digest("hex");
}
export function matchesCredentialStamp(stamp: unknown, id: string, storedHash: string, secret: string) {
  if (typeof stamp !== "string" || !/^[0-9a-f]{64}$/.test(stamp)) return false;
  return timingSafeEqual(Buffer.from(stamp, "hex"), Buffer.from(credentialStamp(id, storedHash, secret), "hex"));
}
