import { notFound, redirect } from "next/navigation";
import ExperimentInvitationsClient from "@/components/access/ExperimentInvitationsClient";
import { experimentOrigin } from "@/lib/experiment-policy";
import { requirePlatformAdmin } from "@/lib/tenant";
import { homologIdentity } from "@/lib/environment-identity";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!experimentOrigin()) notFound();
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  return <ExperimentInvitationsClient homolog={homologIdentity()} />;
}
