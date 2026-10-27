import { requireSession } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/layout/Sidebar";
import { permissionsFor } from "@/lib/permissions";
import { PermissionProvider } from "@/components/access/PermissionContext";
import { SUPPORT_MODULES } from "@/lib/support-policy";
import Link from "next/link";
import { testTenantLabel } from "@/lib/test-tenant";
import { cookies } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx: any;
  try {
    ctx = await requireSession();
  } catch (error) {
    const status = (error as {status?: number}).status;
    redirect(status === 428 ? (await cookies()).get("support_context")?.value ? "/suporte?pending=contract" : "/termos/aceite" : status === 409 || status === 403 ? "/selecionar-tenant" : "/login");
  }

  const { session } = ctx;
  const permissions = [...await permissionsFor(ctx)];

  // Busca o logo do tenant ativo
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { logoUrl: true, slug: true },
  });
  const testLabel = testTenantLabel(tenant?.slug);

  return (
    <PermissionProvider permissions={permissions}>
    <div className="layout">
      <Sidebar
        userNome={session.nome || "Usuário"}
        userPapel={session.papel || "membro"}
        tenantNome={session.tenantNome || "Dez Soluções"}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        authMode={session.authMode}
        platformAdmin={session.accessSource === "SUPPORT_GRANT" || session.accessSource === "ADVISORY" ? false : session.platformAdmin}
        supportOperator={session.supportOperator}
        permissions={permissions}
        hasMembership={session.accessSource === "MEMBERSHIP" && Boolean(session.membershipId)}
        membershipRole={session.membershipRole}
      />
      <main className="main" style={{ overflow: "hidden" }}>
        {testLabel && <div className="test-tenant-banner" role="status">
          <strong>{testLabel}</strong><span>Use somente dados sintéticos.</span>
        </div>}
        {session.accessSource === "ADVISORY" && <div className="support-mode-banner" role="status">
          <strong>Assessoria DEZ</strong><span>Empresa: {session.tenantNome}</span>
          <span>{session.advisoryExpiresAt ? `Até ${new Date(session.advisoryExpiresAt).toLocaleString("pt-BR")}` : "Vigente até revogação"}</span>
          <Link href="/selecionar-tenant">Trocar contexto</Link>
        </div>}
        {session.accessSource === "SUPPORT_GRANT" ? <>
          <div className="support-mode-banner" role="status">
            <strong>Acesso temporário de suporte</strong><span>Empresa: {session.tenantNome}</span>
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
