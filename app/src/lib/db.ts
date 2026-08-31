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
  // Helper: verifica se um registro pertence ao tenant antes de operações
  // que exigem where por chave única (update/delete/findUnique/upsert).
  //
  // Motivo: o Prisma só aceita campos de identificador ÚNICO no where dessas
  // operações. Como não há @@unique([tenantId, id]) no schema, injetar tenantId
  // diretamente no where quebraria em runtime ("Unknown argument tenantId").
  // Então, em vez disso, validamos a posse com um findFirst (que aceita filtros
  // arbitrários) e só executamos a operação se o registro for do tenant.
  async function pertenceAoTenant(model: string, where: any): Promise<boolean> {
    const registro = await (prisma as any)[model].findFirst({
      where: { ...where, tenantId },
      select: { id: true },
    });
    return registro != null;
  }

  return prisma.$extends({
    query: {
      $allModels: {
        // ── Leitura em massa / agregação: filtro por tenant é suficiente ──
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

        // ── findUnique/findUniqueOrThrow: valida posse, mantém where único ──
        async findUnique({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          if (!(await pertenceAoTenant(model, args.where))) return null;
          return query(args);
        },
        async findUniqueOrThrow({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          if (!(await pertenceAoTenant(model, args.where))) {
            throw Object.assign(new Error("Registro não encontrado no tenant"), { code: "P2025" });
          }
          return query(args);
        },

        // ── Escrita: injeta o tenantId automaticamente no data ──
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

        // ── update/delete por chave única: valida posse antes de executar ──
        // Mantém o where original (chave única) intacto para não violar o
        // contrato do Prisma, mas impede operar em registro de outro tenant.
        async update({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          if (!(await pertenceAoTenant(model, args.where))) {
            throw Object.assign(new Error("Registro não encontrado no tenant"), { code: "P2025" });
          }
          return query(args);
        },
        async delete({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          if (!(await pertenceAoTenant(model, args.where))) {
            throw Object.assign(new Error("Registro não encontrado no tenant"), { code: "P2025" });
          }
          return query(args);
        },
        async upsert({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          // Se já existe no tenant, faz update; senão, cria com tenantId injetado.
          args.create = { tenantId, ...args.create };
          if (!(await pertenceAoTenant(model, args.where))) {
            // Registro não pertence ao tenant (ou não existe): força o caminho de create.
            // Removemos o update para evitar sobrescrever dados de outro tenant.
            args.update = {};
          }
          return query(args);
        },

        // ── updateMany/deleteMany: filtro por tenant é suficiente e seguro ──
        async updateMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
        async deleteMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { tenantId, ...args.where };
          return query(args);
        },
      },
    },
  });
}
