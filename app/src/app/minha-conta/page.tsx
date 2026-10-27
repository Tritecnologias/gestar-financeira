import { redirect } from "next/navigation";
import { getIdentityAccess } from "@/lib/tenant";
import AccountClient from "@/components/account/AccountClient";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  let identity;
  try { identity = await getIdentityAccess(); } catch { redirect("/login"); }
  return <AccountClient name={identity.nome} email={identity.email} platformAdmin={identity.platformAdmin?.status === "ACTIVE"} supportOperator={identity.supportOperator?.status === "ACTIVE"} />;
}
