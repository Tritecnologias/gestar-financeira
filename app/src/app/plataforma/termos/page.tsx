import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/tenant";
import TermsPlatformClient from "@/components/access/TermsPlatformClient";

export default async function PlatformTermsPage() {
  try { await requirePlatformAdmin(); } catch { redirect("/acesso-negado"); }
  return <TermsPlatformClient />;
}
