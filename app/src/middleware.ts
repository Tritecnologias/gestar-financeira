import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isStatic = pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  const isPublic = isAuthPage || isApiAuth || isStatic;

  // Rate limiting na rota de login (proteção contra brute-force).
  // ⚠️ Limitação: o contador vive em memória do processo. Funciona bem em
  //    single-instance (VM/container único, como no docker-compose atual),
  //    mas NÃO é compartilhado entre instâncias serverless nem sobrevive a
  //    cold starts/deploys. Para produção multi-instância, migrar para um
  //    store externo (Redis/Upstash).
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    // x-forwarded-for pode ser uma lista "ip1, ip2, ..." — usar o primeiro (cliente)
    const fwd = req.headers.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
    const key = `login:${ip}`;

    const WINDOW = 15 * 60 * 1000;
    const MAX = 10;
    const now = Date.now();
    const stored: Map<string, { count: number; resetAt: number }> =
      (globalThis as any).__rateLimit ?? new Map();
    (globalThis as any).__rateLimit = stored;

    const entry = stored.get(key);
    const janelaAtiva = entry && now < entry.resetAt;

    if (janelaAtiva && entry.count >= MAX) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    }

    if (janelaAtiva) {
      entry.count++;
    } else {
      stored.set(key, { count: 1, resetAt: now + WINDOW });
      // Limpeza oportunista de entradas expiradas para o Map não crescer sem limite
      for (const [k, v] of stored) {
        if (now > v.resetAt) stored.delete(k);
      }
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

