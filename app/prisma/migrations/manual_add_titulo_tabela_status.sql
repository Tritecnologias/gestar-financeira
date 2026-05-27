-- Adiciona campo titulo_tabela_status na tabela tenants
-- Permite que cada tenant personalize o nome da tabela de apoio de status
ALTER TABLE "tenants" ADD COLUMN "titulo_tabela_status" TEXT DEFAULT 'VALOR PREVISTO';
