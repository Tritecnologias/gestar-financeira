import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getIdentityAccess } from "@/lib/tenant";

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    if ((session.user as {authMode?: string}).authMode === "identity") {
      let platformOnly = false;
      try {
        const identity = await getIdentityAccess();
        platformOnly = identity.memberships.length === 0 && identity.platformAdmin?.status === "ACTIVE";
      } catch { /* requireSession will reject an invalid session */ }
      if (platformOnly) redirect("/plataforma");
    }
    redirect("/lancamentos");
  } else {
    redirect("/login");
  }
}
