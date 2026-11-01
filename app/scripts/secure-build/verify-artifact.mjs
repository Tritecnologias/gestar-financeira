import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { inspectArtifact } from "./artifact-policy.mjs";

const root = resolve(process.argv[2] ?? ".");
const violations = inspectArtifact(root);
for (const required of ["server.js", ".next/BUILD_ID", "prisma/schema.prisma", "prisma.config.cjs", "prisma/migrations/local", "prisma/migrations/homolog", "prisma/migrations/production", "prisma/migrations/manual_admission_runtime_acl.sql", "build-metadata.json"])
  if (!existsSync(resolve(root, required))) violations.push(`missing:${required}`);
if (violations.length) {
  console.error("ARTIFACT_POLICY_FAILED", violations);
  process.exit(1);
}
console.log("ARTIFACT_POLICY_PASSED");
