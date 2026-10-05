import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { emailEqualsNormalized, normalizeEmail, unambiguousLegacyAccount } from "@/lib/email";

// Rollback operacional explícito. O modo padrão usa a identidade ACCESS-2.
export const legacyAuthEnabled = process.env.ACCESS_AUTH_MODE === "legacy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string" ||
            !credentials.email.trim() || !credentials.password) return null;

        if (!legacyAuthEnabled) {
          const identity = await prisma.authIdentity.findUnique({
            where: { email: normalizeEmail(credentials.email) },
            select: { id: true, nome: true, email: true, senhaHash: true, status: true },
          });
          if (!identity || identity.status !== "ACTIVE" ||
              !await bcrypt.compare(credentials.password, identity.senhaHash)) return null;
          return { id: identity.id, name: identity.nome, email: identity.email,
            authMode: "identity", loginNonce: randomUUID() };
        }

        const usuarios = await prisma.usuario.findMany({
          where: {
            email: emailEqualsNormalized(credentials.email as string),
            ativo: true,
            tenant: { ativo: true },
          },
          include: {
            tenant: {
              select: { id: true, nome: true, ativo: true },
            },
          },
          take: 2,
        });

        const usuario = unambiguousLegacyAccount(usuarios);
        if (!usuario) return null;

        const senhaValida = await bcrypt.compare(
          credentials.password as string,
          usuario.senhaHash
        );
        if (!senhaValida) return null;

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          tenantId: usuario.tenantId,
          tenantNome: usuario.tenant.nome,
          authMode: "legacy",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.authMode = (user as any).authMode;
        token.loginNonce = (user as any).loginNonce;
        token.papel = (user as any).papel;
        token.tenantId = (user as any).tenantId;
        token.tenantNome = (user as any).tenantNome;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).authMode = token.authMode;
        (session.user as any).loginNonce = token.loginNonce;
        (session.user as any).papel = token.papel;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantNome = token.tenantNome;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 horas
  },
});
