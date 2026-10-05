import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../src/app/api");
const intentional = new Set([
  "auth/[...nextauth]/route.ts", // NextAuth protocol
  "access/context/route.ts",     // current authenticated context
  "tenants/route.ts",            // own memberships or PlatformAdmin; POST platform only
  "tenants/switch/route.ts",     // choose an already-authorized membership
  "usuarios/[id]/route.ts",      // 410 in identity mode; legacy admin only
]);
function* walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) yield* walk(path);
    else if (item.name === "route.ts") yield path;
  }
}
let checked = 0;
const uncovered = [];
for (const file of walk(root)) {
  const path = relative(root, file).replaceAll("\\", "/");
  if (intentional.has(path)) continue;
  const source = readFileSync(file, "utf8");
  const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)];
  for (let i = 0; i < handlers.length; i++) {
    const body = source.slice(handlers[i].index, handlers[i + 1]?.index ?? source.length);
    checked++;
    if (!/\b(guardApi|requirePermission|requireTenantPermission|requirePlatformAdmin|requireAdmin|requireUserAdminActor)\(/.test(body)) {
      uncovered.push(`${handlers[i][1]} ${path}`);
    }
  }
}
if (uncovered.length) throw new Error(`Handlers without explicit authorization:\n${uncovered.join("\n")}`);
console.log(`ACCESS-4B: ${checked} non-protocol handlers have explicit authorization checks.`);
