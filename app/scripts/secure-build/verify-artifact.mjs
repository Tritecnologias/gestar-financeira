import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectArtifact } from "./artifact-policy.mjs";

const root = resolve(process.argv[2] ?? ".");
const violations = inspectArtifact(root);
for (const required of ["server.js", ".next/BUILD_ID", "prisma/schema.prisma", "prisma/migrations", "build-metadata.json"])
  if (!existsSync(resolve(root, required))) violations.push(`missing:${required}`);
if (violations.length) {
  console.error("ARTIFACT_POLICY_FAILED", violations);
  process.exit(1);
}
console.log("ARTIFACT_POLICY_PASSED");
