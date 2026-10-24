/** Headers are evidence only when the controlled edge authenticates the request.
 * With no configured proxy token, all login requests share a conservative bucket.
 * Never infer trust from Host, X-Forwarded-For or a client-supplied IP address.
 */
export async function trustedClientIp(headers: Headers, token = process.env.TRUSTED_PROXY_TOKEN): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const supplied = headers.get("x-10s-proxy-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(supplied)) return null;
  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([token, supplied].map(value =>
    crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const left = new Uint8Array(expected);
  const right = new Uint8Array(actual);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (difference !== 0) return null;
  const ip = headers.get("x-real-ip")?.trim() ?? "";
  // Canonicalize equivalent addresses so formatting cannot create new buckets.
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every(part => part <= 255) ? parts.join(".") : null;
  }
  if (/^[a-fA-F0-9:]+$/.test(ip) && ip.includes(":")) {
    try { return new URL(`http://[${ip}]/`).hostname; } catch { return null; }
  }
  return null;
}
