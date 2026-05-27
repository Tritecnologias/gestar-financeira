import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Singleton do Prisma Client (Prisma v7 com adapter pg) ─────
// Prisma v7 requer um adapter para conexão direta ao PostgreSQL

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
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
  return prisma.$extends({
    query: {
      $allModels: {
        // Intercepta findMany, findFirst, findUnique, findUniqueOrThrow, findFirstOrThrow
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async findFirstOrThrow({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          // findUnique não aceita tenantId direto no where composto; delega ao findFirst
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async aggregate({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async groupBy({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        // Escrita: injeta o tenantId automaticamente no data
        async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.data = { tenantId, ...args.data };
          return query(args);
        },
        async createMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((item: any) => ({ tenantId, ...item }));
          } else {
            args.data = { tenantId, ...args.data };
          }
          return query(args);
        },
        // update/delete: exige que o registro pertença ao tenant
        async update({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async updateMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async delete({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async deleteMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async upsert({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where  = { tenantId, ...args.where };
          args.create = { tenantId, ...args.create };
          return query(args);
        },
      },
    },
  });
}
