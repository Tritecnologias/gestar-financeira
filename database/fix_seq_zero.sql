-- Corrigir lançamentos com seq = 0 ou NULL
-- Reatribuir seq sequencial para registros sem sequência

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY criado_em ASC) + (SELECT COALESCE(MAX(seq), 0) FROM lancamentos WHERE seq > 0) AS new_seq
  FROM lancamentos
  WHERE seq = 0 OR seq IS NULL
)
UPDATE lancamentos SET seq = numbered.new_seq
FROM numbered WHERE lancamentos.id = numbered.id;

-- Atualizar a sequence para o próximo valor disponível
SELECT setval(pg_get_serial_sequence('lancamentos', 'seq'), COALESCE((SELECT MAX(seq) FROM lancamentos), 1));
