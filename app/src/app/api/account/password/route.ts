import { NextRequest, NextResponse } from "next/server";
import { getIdentityAccess } from "@/lib/tenant";
import { accountDatabase } from "@/lib/account-db";
import { changeOwnPassword, validatePasswordChange } from "@/lib/account-password";
import { withAccessRequest } from "@/lib/access-request-context";

async function handlePOST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const identity = await getIdentityAccess();
    const publicUrl = process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || req.url;
    if (req.headers.get("origin") !== new URL(publicUrl).origin || req.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Solicitação não permitida. Atualize a página e tente novamente." }, { status: 403, headers });
    }
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400, headers });
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Preencha os campos de senha." }, { status: 400, headers });
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413, headers }); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "Solicitação inválida." }, { status: 400, headers }); }
    const checked = validatePasswordChange(body);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400, headers });
    const result = await changeOwnPassword(accountDatabase(), identity.id, checked.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: { ...headers, ...(result.status === 429 ? { "Retry-After": "900" } : {}) } });
    const response = NextResponse.json({ message: "Senha alterada com sucesso. Entre novamente com a nova senha." }, { headers });
    for (const cookie of ["authjs.session-token", "tenant_context", "support_context"]) response.cookies.set(cookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (cause) {
    const status = (cause as { status?: number }).status;
    return NextResponse.json({ error: status === 401 ? "Entre novamente para alterar sua senha." : status === 409 ? "Sua conta foi alterada. Entre novamente e tente outra vez." : "Não foi possível alterar sua senha. Tente novamente." }, { status: status === 401 || status === 409 ? status : 500, headers });
  }
}
export const POST = withAccessRequest("account.password.change", handlePOST);
