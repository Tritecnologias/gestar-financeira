import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/tenant";
import AuditClient from "@/components/access/AuditClient";

export default async function PlatformAuditPage() {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  return <AuditClient mode="platform" />;
}
