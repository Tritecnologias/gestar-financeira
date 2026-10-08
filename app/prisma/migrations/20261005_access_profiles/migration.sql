-- ACCESS-4: additive, tenant-scoped access profiles.
BEGIN;

CREATE TABLE "access_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "permissoes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_profiles_id_tenant_id_key" ON "access_profiles"("id", "tenant_id");
CREATE UNIQUE INDEX "access_profiles_tenant_id_nome_key" ON "access_profiles"("tenant_id", "nome");
CREATE INDEX "access_profiles_tenant_id_ativo_idx" ON "access_profiles"("tenant_id", "ativo");
ALTER TABLE "access_profiles" ADD CONSTRAINT "access_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships" ADD COLUMN "profile_id" TEXT;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_profile_id_tenant_id_fkey"
  FOREIGN KEY ("profile_id", "tenant_id") REFERENCES "access_profiles"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve exactly the pre-ACCESS-4 capabilities of existing memberships.
-- Newly added memberships require an explicit profile to use protected screens.
INSERT INTO "access_profiles" ("id", "tenant_id", "nome", "descricao", "permissoes")
SELECT gen_random_uuid()::text, m."tenant_id", 'ACESSO LEGADO',
  'Compatibilidade dos vínculos existentes antes do ACCESS-4',
  ARRAY[
    'acao.tarefas.view',
    'estrutura.empresa.view', 'estrutura.pessoas.view', 'estrutura.financeiras.view',
    'estrutura.cadastrais.view', 'estrutura.portfolio.view', 'estrutura.comerciais.view',
    'fluxo.visao.view', 'fluxo.visao.saldos',
    'fluxo.lancamentos.view', 'fluxo.lancamentos.create', 'fluxo.lancamentos.edit',
    'fluxo.lancamentos.delete', 'fluxo.lancamentos.import', 'fluxo.lancamentos.export',
    'fluxo.lancamentos.bulk_edit', 'fluxo.relatorios.view', 'fluxo.analises.view',
    'acessos.usuarios.view', 'acessos.usuarios.manage',
    'acessos.perfis.view', 'acessos.perfis.manage'
  ]::TEXT[]
FROM (SELECT DISTINCT "tenant_id" FROM "tenant_memberships") m;

UPDATE "tenant_memberships" m SET "profile_id" = p."id"
FROM "access_profiles" p WHERE p."tenant_id" = m."tenant_id" AND p."nome" = 'ACESSO LEGADO';

COMMIT;
