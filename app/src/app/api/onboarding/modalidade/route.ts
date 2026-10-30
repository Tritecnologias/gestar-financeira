import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { sameOrigin } from "@/lib/advisory-management";
import { selectTenantModality } from "@/lib/tenant-modality";
import { withAccessRequest } from "@/lib/access-request-context";
import { tenantModalityErrorStatus } from "@/lib/tenant-modality-state";

async function handlePOST(req: Request) {
  try {
    sameOrigin(req);
    const { session } = await requireSession({ allowPendingTerms: true });
    const result = await selectTenantModality(session, await req.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    const status = tenantModalityErrorStatus(error);
    return NextResponse.json({ error: e.status ? e.message : status === 400 ? "Solicitação inválida." : status === 409 ? "A situação mudou. Atualize a página e confira a modalidade." : "Não foi possível definir a modalidade." }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
export const POST = withAccessRequest("TENANT_MODALITY", handlePOST);
