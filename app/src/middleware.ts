import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { trustedClientIp } from "@/lib/trusted-proxy";
import { allowLoginAttempt } from "@/lib/login-rate-limit";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isActivation = pathname === "/ativar-acesso" || pathname === "/api/access/invitations/inspect" ||
    pathname === "/api/access/invitations/accept";
  const isStatic = pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  const isPublic = isAuthPage || isApiAuth || isStatic || isActivation;

  // Rate limiting na rota de login (proteção contra brute-force).
  // ⚠️ Limitação: o contador vive em memória do processo. Funciona bem em
  //    single-instance (VM/container único, como no docker-compose atual),
  //    mas NÃO é compartilhado entre instâncias serverless nem sobrevive a
  //    cold starts/deploys. Para produção multi-instância, migrar para um
  //    store externo (Redis/Upstash).
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const ip = await trustedClientIp(req.headers);
    if (!allowLoginAttempt(ip)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    }
  }

  if (isPublic) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // Rotas de API: responder 401 JSON (evita redirect 307 que quebra chamadas fetch).
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    // Páginas: redireciona para o login preservando o destino.
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Server-only routing evidence for SupportGrant. Overwrite any client value.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-10s-request-path", pathname);
  requestHeaders.set("x-10s-request-method", req.method);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
