import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { emailEqualsNormalized, normalizeEmail, unambiguousLegacyAccount } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { credentialStamp, matchesCredentialStamp } from "@/lib/credential-session";

const sessionSecret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

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
              !await bcrypt.compare(credentials.password, identity.senhaHash)) {
            await writeAudit(prisma, { actorIdentityId: identity?.id,
              accessMode: "SYSTEM", action: identity?.status === "INACTIVE" ? "IDENTITY_DISABLED_ACCESS_ATTEMPT" : "LOGIN_FAILURE",
              resourceType: "AuthIdentity", resourceId: identity?.id, result: "DENIED" }).catch(() => {});
            return null;
          }
          // Login telemetry is observational. A database outage must not turn
          // a valid credential into a false "invalid password" response.
          await writeAudit(prisma, { actorIdentityId: identity.id, accessMode: "SYSTEM",
            action: "LOGIN_SUCCESS", resourceType: "AuthIdentity", resourceId: identity.id }).catch(() => {});
          return { id: identity.id, name: identity.nome, email: identity.email,
            authMode: "identity", loginNonce: randomUUID(),
            credentialStamp: credentialStamp(identity.id, identity.senhaHash, sessionSecret()) };
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
        if (!usuario) {
          await writeAudit(prisma, { accessMode: "SYSTEM", action: "LOGIN_FAILURE",
            resourceType: "Usuario", result: "DENIED" }).catch(() => {});
          return null;
        }

        const senhaValida = await bcrypt.compare(
          credentials.password as string,
          usuario.senhaHash
        );
        if (!senhaValida) {
          await writeAudit(prisma, { tenantId: usuario.tenantId, accessMode: "SYSTEM",
            action: "LOGIN_FAILURE", resourceType: "Usuario", resourceId: usuario.id, result: "DENIED" }).catch(() => {});
          return null;
        }
        await writeAudit(prisma, { tenantId: usuario.tenantId, accessMode: "SYSTEM",
          action: "LOGIN_SUCCESS", resourceType: "Usuario", resourceId: usuario.id }).catch(() => {});

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
        token.credentialStamp = (user as any).credentialStamp;
        token.papel = (user as any).papel;
        token.tenantId = (user as any).tenantId;
        token.tenantNome = (user as any).tenantNome;
      }
      if (token.authMode === "identity") {
        // Existing JWTs without a stamp require one fresh login after rollout.
        // No profile/tenant context is used to authorize this credential check.
        if (typeof token.id !== "string") return null;
        const current = await prisma.authIdentity.findUnique({ where: { id: token.id }, select: { status: true, senhaHash: true } });
        if (!current || current.status !== "ACTIVE" || !matchesCredentialStamp(token.credentialStamp, token.id, current.senhaHash, sessionSecret())) return null;
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
  events: {
    async signOut(message) {
      const id = "token" in message ? message.token?.id : null;
      if (typeof id === "string" && !legacyAuthEnabled) {
        await writeAudit(prisma, { actorIdentityId: id, accessMode: "SYSTEM",
          action: "LOGOUT", resourceType: "AuthIdentity", resourceId: id }).catch(() => {});
      }
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
