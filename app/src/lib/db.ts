import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Singleton do Prisma Client (Prisma v7 com adapter pg) ─────
// Prisma v7 requer um adapter para conexão direta ao PostgreSQL

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  // Keep the adapter in the same PostgreSQL schema selected by Prisma Migrate.
  // The production URL has no schema override; isolated DEV tests use one.
  const schema = new URL(connectionString).searchParams.get("schema") || undefined;
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ── Application-level RLS via Prisma Client Extensions ────────
// Retorna um client escopado ao tenant. Todas as queries feitas
// através deste client terão o tenantId injetado automaticamente
// no WHERE, impedindo vazamento de dados entre clientes.
//
// Uso: const db = getTenantPrisma(tenantId);
//      const rows = await db.lancamento.findMany(); // já filtrado!
//
// ⚠️  Não use o `prisma` singleton diretamente nas rotas de API —
//     use sempre `getTenantPrisma` para garantir o isolamento.
export function getTenantPrisma(tenantId: string) {
  // Prisma 7 aceita filtros adicionais no where com identificador único.
  // Mantê-los na própria operação evita a janela entre verificar posse e gravar.
  const scopedWhere = (where: any) => ({ ...where, tenantId });
  const scopedData = (data: any) => ({ ...data, tenantId });

  return prisma.$extends({
    query: {
      $allModels: {
        // ── Leitura em massa / agregação: filtro por tenant é suficiente ──
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async findFirstOrThrow({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async aggregate({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async groupBy({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },

        // ── Operações por chave única: escopo no mesmo statement SQL ──
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async findUniqueOrThrow({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },

        // ── Escrita: injeta o tenantId automaticamente no data ──
        async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.data = scopedData(args.data);
          return query(args);
        },
        async createMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map(scopedData);
          } else {
            args.data = scopedData(args.data);
          }
          return query(args);
        },
        async createManyAndReturn({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.data = Array.isArray(args.data) ? args.data.map(scopedData) : scopedData(args.data);
          return query(args);
        },

        async update({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          args.data = scopedData(args.data);
          return query(args);
        },
        async delete({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
        async upsert({ args, model }: { args: any; model: string }) {
          // O upsert nativo usa a chave única no ON CONFLICT e pode ignorar o
          // tenantId adicional no ramo UPDATE. Nunca executá-lo diretamente.
          const delegate = (prisma as any)[model] ?? (prisma as any)[model[0].toLowerCase() + model.slice(1)];
          const where = scopedWhere(args.where);
          const projection = args.select ? { select: args.select } : args.include ? { include: args.include } : {};
          const existing = await delegate.findUnique({ where, select: { id: true } });
          if (existing) {
            return delegate.update({ where: { id: existing.id, tenantId }, data: scopedData(args.update), ...projection });
          }
          try {
            return await delegate.create({ data: scopedData(args.create), ...projection });
          } catch (error: any) {
            if (error.code !== "P2002") throw error;
            // Corrida de criação no mesmo tenant: tentar o ramo UPDATE apenas
            // após confirmar posse. Conflito com outro tenant continua erro.
            const concurrent = await delegate.findUnique({ where, select: { id: true } });
            if (!concurrent) throw error;
            return delegate.update({ where: { id: concurrent.id, tenantId }, data: scopedData(args.update), ...projection });
          }
        },

        // ── updateMany/deleteMany: filtro por tenant é suficiente e seguro ──
        async updateMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          args.data = scopedData(args.data);
          return query(args);
        },
        async updateManyAndReturn({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          args.data = scopedData(args.data);
          return query(args);
        },
        async deleteMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = scopedWhere(args.where);
          return query(args);
        },
      },
    },
  });
}
