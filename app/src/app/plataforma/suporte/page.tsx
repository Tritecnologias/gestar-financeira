import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/tenant";
import SupportClient from "@/components/access/SupportClient";

export default async function PlatformSupportPage() {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  return <SupportClient mode="platform" />;
}
