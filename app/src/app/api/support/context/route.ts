import { NextResponse } from "next/server";
import { getIdentityAccess } from "@/lib/tenant";
import { tenantContextCookieOptions } from "@/lib/access-policy";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.APP_PUBLIC_URL ?? request.url).origin) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
    await getIdentityAccess();
    const response = NextResponse.json({ cleared: true });
    response.cookies.set("support_context", "", { ...tenantContextCookieOptions(), maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: "Não autenticado." }, { status: 401 }); }
}
