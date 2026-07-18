import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isStatic = pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  const isPublic = isAuthPage || isApiAuth || isStatic;

  // Rate limiting na rota de login (proteção contra brute-force)
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const key = `login:${ip}`;
    // Inline rate check (não importa módulo em edge middleware)
    const WINDOW = 15 * 60 * 1000;
    const MAX = 10;
    const now = Date.now();
    const stored = (globalThis as any).__rateLimit ?? new Map();
    (globalThis as any).__rateLimit = stored;
    const entry = stored.get(key);
    if (entry && now < entry.resetAt && entry.count >= MAX) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    }
    if (!entry || now > (entry?.resetAt ?? 0)) {
      stored.set(key, { count: 1, resetAt: now + WINDOW });
    } else {
      entry.count++;
    }
  }

  if (isPublic) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

