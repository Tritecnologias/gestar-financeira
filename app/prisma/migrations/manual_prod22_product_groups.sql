-- PROD-2.2: Grupo configurável por tenant, sem atribuição automática ao legado.
-- Revisar com o responsável pelo banco antes de aplicar fora do sandbox DEV.
BEGIN;

CREATE TABLE "produto_grupos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "codigo" VARCHAR(30) NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "produto_grupos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "produto_grupos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "produto_grupos_tenant_id_id_key" ON "produto_grupos"("tenant_id", "id");
CREATE UNIQUE INDEX "produto_grupos_tenant_id_codigo_key" ON "produto_grupos"("tenant_id", "codigo");
CREATE INDEX "idx_produto_grupos_tenant" ON "produto_grupos"("tenant_id");

ALTER TABLE "produto_tipos" ALTER COLUMN "grupo" DROP NOT NULL;
ALTER TABLE "produto_tipos" ADD COLUMN "grupo_id" TEXT;
CREATE UNIQUE INDEX "produto_tipos_tenant_id_grupo_id_codigo_key" ON "produto_tipos"("tenant_id", "grupo_id", "codigo");
ALTER TABLE "produto_tipos" ADD CONSTRAINT "produto_tipos_tenant_id_grupo_id_fkey"
  FOREIGN KEY ("tenant_id", "grupo_id") REFERENCES "produto_grupos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "produtos" ADD COLUMN "grupo_id" TEXT;
ALTER TABLE "produtos" ALTER COLUMN "tipo" DROP NOT NULL;
CREATE INDEX "idx_produtos_grupo" ON "produtos"("tenant_id", "grupo_id");
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_grupo_id_fkey"
  FOREIGN KEY ("tenant_id", "grupo_id") REFERENCES "produto_grupos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
