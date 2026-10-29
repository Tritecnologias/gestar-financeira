import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homologIdentity } from "./environment-identity";

export async function environmentFavicon(format: "svg" | "ico") {
  const name = homologIdentity() ? "homolog-yellow" : "dez-blue";
  const bytes = await readFile(join(process.cwd(), "public", "brand", `${name}.${format}`));
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": format === "svg" ? "image/svg+xml" : "image/x-icon",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
