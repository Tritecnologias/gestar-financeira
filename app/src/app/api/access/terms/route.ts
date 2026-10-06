import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenantPermission } from "@/lib/permissions";

/** Tenant administration sees status/version/date, never IP or user-agent. */
export async function GET() {
  try {
    const { session } = await requireTenantPermission("acessos.usuarios.view");
    if (session.membershipRole === "MEMBER") {
      return NextResponse.json({ error: "Consulta de aceites restrita à administração do tenant." }, { status: 403 });
    }
    const [memberships, versions, responsible] = await Promise.all([
      prisma.tenantMembership.findMany({ where: { tenantId: session.tenantId },
        include: { identity: { select: { nome: true, email: true } } }, orderBy: { identity: { nome: "asc" } } }),
      prisma.termVersion.findMany({ where: { status: "PUBLISHED", document: { required: true } }, include: { document: true } }),
      prisma.tenantContractualResponsible.findUnique({ where: { tenantId: session.tenantId } }),
    ]);
    const acceptances = await prisma.termAcceptance.findMany({ where: {
      OR: [{ tenantId: session.tenantId }, { tenantId: null, identityId: { in: memberships.map(m => m.identityId) } }],
    }, include: { version: { select: { documentId: true, version: true } } }, orderBy: { acceptedAt: "desc" } });
    const rows = memberships.map(member => ({
      membershipId: member.id, nome: member.identity.nome, email: member.identity.email,
      role: member.role, status: member.status,
      isContractualResponsible: responsible?.membershipId === member.id,
      terms: versions.map(version => {
        const ownerTerm = version.document.audience === "CONTRATANTE";
        const applicable = !ownerTerm || responsible?.membershipId === member.id;
        const accepted = applicable ? acceptances.find(a => a.identityId === member.identityId &&
          a.tenantId === (ownerTerm ? session.tenantId : null) &&
          (!ownerTerm || a.membershipId === member.id) &&
          (version.requiresReaccept ? a.termVersionId === version.id : a.version.documentId === version.documentId)) : undefined;
        return { documentCode: version.document.code, audience: version.document.audience,
          applicable, requiredVersion: version.version, acceptedVersion: accepted?.version.version ?? null,
          acceptedAt: accepted?.acceptedAt ?? null, pending: applicable && !accepted };
      }),
    }));
    return NextResponse.json({ contractualResponsibleMembershipId: responsible?.membershipId ?? null, rows },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as {status?: number}).status ? (error as Error).message : "Falha ao consultar aceites." }, { status: (error as {status?: number}).status ?? 500 });
  }
}
