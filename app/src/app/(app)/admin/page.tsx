import { redirect } from "next/navigation";
import { legacyAuthEnabled } from "@/lib/auth";
import LegacyAdminClient from "@/components/access/LegacyAdminClient";

/** Legacy administration remains available only for the explicit rollback mode. */
export default function AdminPage() {
  if (!legacyAuthEnabled) redirect("/acessos");
  return <LegacyAdminClient />;
}
