-- PORT-1: reserva permanente de códigos hierárquicos por tenant e pai.
-- Aplicar apenas após revisão da equipe responsável pelo banco fora do sandbox DEV.
BEGIN;
CREATE TABLE "produto_sequencias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "escopo" VARCHAR(100) NOT NULL,
  "ultimo_numero" BIGINT NOT NULL,
  CONSTRAINT "produto_sequencias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "produto_sequencias_tenant_id_escopo_key" ON "produto_sequencias"("tenant_id", "escopo");
COMMIT;
