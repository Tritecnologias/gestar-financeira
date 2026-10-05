-- Preserve pre-ACCESS-4B capabilities of mapped legacy memberships.
BEGIN;
UPDATE "access_profiles" p SET "permissoes" = (
  SELECT ARRAY(SELECT DISTINCT key FROM unnest(p."permissoes" || ARRAY[
    'acao.tarefas.create','acao.tarefas.edit','acao.tarefas.delete',
    'estrutura.empresa.create','estrutura.empresa.edit','estrutura.empresa.delete','estrutura.empresa.import','estrutura.empresa.export',
    'estrutura.pessoas.create','estrutura.pessoas.edit','estrutura.pessoas.delete','estrutura.pessoas.import','estrutura.pessoas.export',
    'estrutura.financeiras.create','estrutura.financeiras.edit','estrutura.financeiras.delete','estrutura.financeiras.import','estrutura.financeiras.export',
    'estrutura.cadastrais.create','estrutura.cadastrais.edit','estrutura.cadastrais.delete','estrutura.cadastrais.import','estrutura.cadastrais.export',
    'estrutura.portfolio.create','estrutura.portfolio.edit','estrutura.portfolio.delete','estrutura.portfolio.import','estrutura.portfolio.export'
  ]::TEXT[]) key)
)
WHERE p."nome" IN ('ACESSO LEGADO', 'ACESSO LEGADO MEMBRO');
COMMIT;
