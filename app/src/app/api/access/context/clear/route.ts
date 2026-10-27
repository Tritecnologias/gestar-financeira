import { NextResponse } from "next/server";
import { getIdentityAccess } from "@/lib/tenant";
import { tenantContextCookieOptions } from "@/lib/access-policy";
import { sameOrigin } from "@/lib/advisory-management";
export async function POST(request: Request) {
  try {
    sameOrigin(request); await getIdentityAccess();
    const response = NextResponse.json({ cleared: true });
    for (const name of ["tenant_context", "support_context", "advisory_context"]) response.cookies.set(name, "", { ...tenantContextCookieOptions(), maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: "Não autorizado." }, { status: 403 }); }
}
