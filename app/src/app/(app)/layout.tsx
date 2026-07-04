import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;

  // Busca o logo do tenant (uma query extra leve)
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { logoUrl: true },
  });

  return (
    <div className="layout">
      <Sidebar
        userNome={user.name ?? ""}
        userPapel={user.papel ?? "membro"}
        tenantNome={user.tenantNome ?? ""}
        tenantLogoUrl={tenant?.logoUrl ?? null}
      />
      <main className="main" style={{ overflow: "hidden" }}>{children}</main>
    </div>
  );
}
