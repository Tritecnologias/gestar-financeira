import { prisma, requireDevDatabase, loadPlatformAdminPlan } from "./context.mjs";

try {
  const database = await requireDevDatabase();
  const plan = await loadPlatformAdminPlan();
  console.log(JSON.stringify({ database, ...plan.report }, null, 2));
} finally {
  await prisma.$disconnect();
}
