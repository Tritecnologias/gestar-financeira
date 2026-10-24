import { readdirSync } from "node:fs";
import { join } from "node:path";

export function forbiddenArtifactPath(path) {
  const parts = path.replaceAll("\\", "/").split("/");
  const name = parts.at(-1);
  if (parts.some(part => [".git", ".private", ".ssh", ".aws"].includes(part))) return true;
  if (/^\.env(?:\.|$)/.test(name) || /\.(dump|backup|bak|key|pem|p12)$/.test(name)) return true;
  if (["reset-passwords.js", "generate-seed-hashes.js"].includes(name)) return true;
  // Dependency package documentation is legitimate; application sources/tools are not.
  if (parts[0] === "node_modules") return false;
  if (["scripts", "src", "tests", "docs", "reports", "backups"].includes(parts[0])) return true;
  if (/audit-macro|credentials/i.test(path) || /\.(log|tsbuildinfo)$/.test(name)) return true;
  if (/\.sql$/.test(name) && !/^prisma\/migrations\/(?:[^/]+\/migration|manual_[a-z0-9_]+)\.sql$/.test(path)) return true;
  return false;
}

export function inspectArtifact(root) {
  const violations = [];
  function walk(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (forbiddenArtifactPath(path)) violations.push(path);
      else if (entry.isDirectory()) walk(join(directory, entry.name), path);
    }
  }
  walk(root);
  return violations;
}
