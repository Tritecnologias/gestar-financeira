import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/config/logo – retorna o logoUrl do tenant atual
export async function GET() {
  let session: any;
  try {
    ({ session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ⚠️ Tenant é lido pelo ID primário — usamos o prisma base (sem Extension de tenant,
  // pois Tenant não tem campo tenantId próprio; é a raiz do multi-tenancy).
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { logoUrl: true },
  });

  return NextResponse.json({ logoUrl: tenant?.logoUrl ?? null });
}

// POST /api/config/logo – salva o logoUrl (base64 ou URL externa)
export async function POST(request: Request) {
  let session: any;
  try {
    ({ session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Apenas admin pode alterar o logo
  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { logoUrl } = body as { logoUrl: string | null };

  // Validação básica: se for string, precisa ser URL ou data URI
  if (logoUrl !== null && typeof logoUrl !== "string") {
    return NextResponse.json({ error: "logoUrl inválido" }, { status: 400 });
  }

  // Limite de tamanho: base64 de imagens grandes podem ser pesados
  if (logoUrl && logoUrl.length > 2_000_000) {
    return NextResponse.json({ error: "Imagem muito grande (máx 1.5 MB)" }, { status: 400 });
  }

  // ⚠️ Tenant.update usa o prisma base — o model Tenant não tem tenantId (ele É o tenant)
  const updated = await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { logoUrl },
    select: { logoUrl: true },
  });

  return NextResponse.json({ logoUrl: updated.logoUrl });
}
