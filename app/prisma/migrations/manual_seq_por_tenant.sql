-- Migração: troca seq global (SERIAL) por seq por tenant
--
-- O campo seq era gerado por uma sequência global do PostgreSQL (SERIAL),
-- compartilhada entre todos os tenants. Isso fazia o "Empresa DEMO Ltda"
-- herdar a numeração de outros tenants (ex: começar em 7342 em vez de 1).
--
-- Após esta migração, o seq é um INTEGER simples calculado por tenant no
-- momento da inserção via transação (SELECT COALESCE(MAX(seq),0)+1).
-- Registros existentes mantêm seus seqs atuais.

-- 1. Remover o default SERIAL do campo seq
ALTER TABLE lancamentos ALTER COLUMN seq DROP DEFAULT;

-- 2. Remover a sequência automática criada pelo SERIAL (se existir)
-- O nome padrão do PostgreSQL para SERIAL em "lancamentos.seq" é "lancamentos_seq_seq"
DROP SEQUENCE IF EXISTS lancamentos_seq_seq;

-- Verificação: após a migração, seq não tem default e é preenchido pelo código.
-- Registros existentes não são alterados.
