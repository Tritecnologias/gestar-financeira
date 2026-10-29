import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function unavailable(): never { throw Object.assign(new Error("Recuperação do link indisponível. Solicite a verificação da custódia da chave."), { status: 503 }); }
function keyRing(env: Record<string, string | undefined>) {
  try {
    const active = env.SPECIAL_INVITATION_LINK_KEY_ID || "";
    const keys = JSON.parse(env.SPECIAL_INVITATION_LINK_KEYS || "null");
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(active) || !keys || typeof keys !== "object" || Array.isArray(keys) ||
      !Object.hasOwn(keys, active) || Object.entries(keys).some(([id, key]) => !/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof key !== "string" || !/^[0-9a-f]{64}$/.test(key))) return unavailable();
    return { active, keys: keys as Record<string, string> };
  } catch { return unavailable(); }
}
function aad(id: string, hash: string) { return Buffer.from(`dez-experiment-link:v1:${id}:${hash}`, "utf8"); }
export function experimentTokenMatches(token: string, hash: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token) && /^[0-9a-f]{64}$/.test(hash) && timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(hash, "hex"));
}
export function sealExperimentToken(token: string, id: string, hash: string, env: Record<string, string | undefined> = process.env) {
  if (!experimentTokenMatches(token, hash)) return unavailable();
  const ring = keyRing(env), iv = randomBytes(12), key = Buffer.from(ring.keys[ring.active], "hex");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad(id, hash));
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return ["v1", ring.active, iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
  } finally { key.fill(0); }
}
export function openExperimentToken(envelope: string, id: string, hash: string, env: Record<string, string | undefined> = process.env) {
  const ring = keyRing(env);
  try {
    const parts = envelope.split(".");
    if (parts.length !== 5 || parts[0] !== "v1" || !Object.hasOwn(ring.keys, parts[1]) || !parts.slice(1).every(part => /^[A-Za-z0-9_-]+$/.test(part))) return unavailable();
    const iv = Buffer.from(parts[2], "base64url"), tag = Buffer.from(parts[4], "base64url"), encrypted = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length !== 43) return unavailable();
    const key = Buffer.from(ring.keys[parts[1]], "hex");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAAD(aad(id, hash)); decipher.setAuthTag(tag);
      const token = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      if (!experimentTokenMatches(token, hash)) return unavailable();
      return token;
    } finally { key.fill(0); }
  } catch { return unavailable(); }
}
export function tokenFromOriginalExperimentLink(link: unknown, origin: string): string | null {
  if (typeof link !== "string" || link.length > 1024) return null;
  try {
    const url = new URL(link);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get("convite") || "";
    return url.origin === origin && url.pathname === "/experimentacao" && !url.username && !url.password && !url.search &&
      [...fragment.keys()].length === 1 && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch { return null; }
}
