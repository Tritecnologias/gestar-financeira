import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function buildMetadata(commit, branch, root = ".") {
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("SOURCE_COMMIT must be a full Git SHA");
  if (!/^[a-zA-Z0-9._/-]{1,160}$/.test(branch ?? "")) throw new Error("SOURCE_BRANCH is required and must be a safe ref name");
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
  const lockBytes = readFileSync(`${root}/package-lock.json`);
  const lock = JSON.parse(lockBytes);
  return {
    sourceCommit: commit, sourceBranch: branch, applicationVersion: pkg.version,
    nodeVersion: process.version, prismaVersion: lock.packages["node_modules/prisma"].version,
    lockfileSha256: createHash("sha256").update(lockBytes).digest("hex"),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeFileSync("build-metadata.json", JSON.stringify(buildMetadata(process.env.SOURCE_COMMIT, process.env.SOURCE_BRANCH), null, 2) + "\n");
}
