import { prisma } from "./context.mjs";
import { runPlatformAdminBackfill } from "./migration.mjs";

try {
  console.log(JSON.stringify(await runPlatformAdminBackfill(), null, 2));
} finally {
  await prisma.$disconnect();
}
