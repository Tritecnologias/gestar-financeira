import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homologIdentity } from "./environment-identity";

export async function environmentFavicon(format: "svg" | "ico", request?: Request) {
  // Existing in-app identity marks keep their approved blue artwork.
  // Only the browser favicon moves to green/navy; HOMOLOG always stays yellow.
  const legacyMark = request && new URL(request.url).searchParams.get("v") === "dez-blue-1";
  const name = homologIdentity() ? "homolog-yellow" : legacyMark ? "dez-blue" : "dez-green-navy";
  const bytes = await readFile(join(process.cwd(), "public", "brand", `${name}.${format}`));
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": format === "svg" ? "image/svg+xml" : "image/x-icon",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
