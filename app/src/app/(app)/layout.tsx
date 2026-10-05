import { requireSession } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx: any;
  try {
    ctx = await requireSession();
  } catch (error) {
    const status = (error as {status?: number}).status;
    redirect(status === 409 || status === 403 ? "/selecionar-tenant" : "/login");
  }

  const { session } = ctx;

  // Busca o logo do tenant ativo
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { logoUrl: true },
  });

  return (
    <div className="layout">
      <Sidebar
        userNome={session.nome || "Usuário"}
        userPapel={session.papel || "membro"}
        tenantNome={session.tenantNome || "Dez Soluções"}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        authMode={session.authMode}
        platformAdmin={session.platformAdmin}
      />
      <main className="main" style={{ overflow: "hidden" }}>{children}</main>
    </div>
  );
}
