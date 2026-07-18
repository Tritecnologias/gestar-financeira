import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const usuario = await prisma.usuario.findFirst({
          where: {
            email: credentials.email as string,
            ativo: true,
          },
          include: {
            tenant: {
              select: { id: true, nome: true, ativo: true },
            },
          },
        });

        if (!usuario || !usuario.tenant.ativo) return null;

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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.papel = (user as any).papel;
        token.tenantId = (user as any).tenantId;
        token.tenantNome = (user as any).tenantNome;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
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
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 horas
  },
});
