import { prisma, requireDevDatabase } from "../access3b/context.mjs";
import { ALL_PERMISSIONS } from "../../src/lib/access-catalog.ts";

const screen = (prefix) => ALL_PERMISSIONS.filter(key => key.startsWith(prefix));
const read = (prefixes) => prefixes.flatMap(prefix => screen(prefix).filter(key => key.endsWith(".view")));
const seeds = [
  { nome: "ADMINISTRAÇÃO", descricao: "Exemplo DEV: administração do tenant", permissoes: ALL_PERMISSIONS },
  { nome: "FINANCEIRO GERENTE", descricao: "Exemplo DEV: operação financeira ampla", permissoes:
    [...screen("fluxo."), ...read(["estrutura.financeiras.", "estrutura.empresa."])] },
  { nome: "FINANCEIRO OPERACIONAL", descricao: "Exemplo DEV: lançamentos sem exclusão ou exportação", permissoes:
    ["fluxo.visao.view", "fluxo.lancamentos.view", "fluxo.lancamentos.create", "fluxo.lancamentos.edit",
      "fluxo.lancamentos.bulk_edit", "estrutura.financeiras.view"] },
  { nome: "RH", descricao: "Exemplo DEV: consulta à base de Pessoas", permissoes: ["estrutura.pessoas.view"] },
  { nome: "CONSULTA", descricao: "Exemplo DEV: leitura financeira sem saldos", permissoes:
    ["fluxo.visao.view", "fluxo.lancamentos.view", "fluxo.relatorios.view"] },
];

try {
  await requireDevDatabase();
  const tenant = await prisma.tenant.findFirst({ where: { nome: "Dez Soluções DEV", ativo: true }, select: { id: true } });
  if (!tenant) throw new Error("Dez Soluções DEV não encontrado; nenhum perfil criado.");
  for (const item of seeds) {
    const profile = await prisma.accessProfile.upsert({ where: { tenantId_nome: { tenantId: tenant.id, nome: item.nome } },
      create: { tenantId: tenant.id, ...item }, update: {} });
    const previousCatalog = ALL_PERMISSIONS.filter(key => !key.startsWith("sistema.configuracoes."));
    if (item.nome === "ADMINISTRAÇÃO" && profile.descricao === item.descricao &&
        profile.permissoes.length === previousCatalog.length && previousCatalog.every(key => profile.permissoes.includes(key)) &&
        await prisma.tenantMembership.count({ where: { profileId: profile.id } }) === 0) {
      await prisma.accessProfile.update({ where: { id: profile.id }, data: { permissoes: item.permissoes } });
    }
  }
  console.log(`Perfis DEV disponíveis: ${seeds.length}. Nenhum membership ou lançamento alterado.`);
} finally { await prisma.$disconnect(); }
