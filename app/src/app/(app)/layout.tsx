import { requireSession } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/layout/Sidebar";
import { permissionsFor } from "@/lib/permissions";
import { PermissionProvider } from "@/components/access/PermissionContext";
import { SUPPORT_MODULES } from "@/lib/support-policy";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx: any;
  try {
    ctx = await requireSession();
  } catch (error) {
    const status = (error as {status?: number}).status;
    redirect(status === 428 ? "/termos/aceite" : status === 409 || status === 403 ? "/selecionar-tenant" : "/login");
  }

  const { session } = ctx;
  const permissions = [...await permissionsFor(ctx)];

  // Busca o logo do tenant ativo
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { logoUrl: true },
  });

  return (
    <PermissionProvider permissions={permissions}>
    <div className="layout">
      <Sidebar
        userNome={session.nome || "Usuário"}
        userPapel={session.papel || "membro"}
        tenantNome={session.tenantNome || "Dez Soluções"}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        authMode={session.authMode}
        platformAdmin={session.platformAdmin}
        permissions={permissions}
      />
      <main className="main" style={{ overflow: "hidden" }}>
        {session.accessSource === "SUPPORT_GRANT" ? <>
          <div className="support-mode-banner" role="status">
            <strong>MODO SUPORTE</strong><span>Tenant: {session.tenantNome}</span>
            <span>Escopo: {(session.supportModules ?? []).map((m: keyof typeof SUPPORT_MODULES) => SUPPORT_MODULES[m].label).join(", ")}</span>
            <span>{session.supportLevel === "READ_ONLY" ? "Somente leitura" : "Operacional"}</span>
            <span>Expira: {session.supportExpiresAt ? new Date(session.supportExpiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</span>
            <Link href="/selecionar-tenant">Trocar contexto</Link>
          </div>
          <div className="support-mode-content">{children}</div>
        </> : children}
      </main>
    </div>
    </PermissionProvider>
  );
}
