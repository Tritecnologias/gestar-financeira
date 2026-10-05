-- Keep access to the existing Configurações screen for legacy memberships.
BEGIN;
UPDATE "access_profiles" SET "permissoes" = array_append("permissoes", 'sistema.configuracoes.view')
WHERE "nome" IN ('ACESSO LEGADO', 'ACESSO LEGADO MEMBRO')
  AND NOT 'sistema.configuracoes.view' = ANY("permissoes");
UPDATE "access_profiles" SET "permissoes" = array_append("permissoes", 'sistema.configuracoes.manage')
WHERE "nome" = 'ACESSO LEGADO'
  AND NOT 'sistema.configuracoes.manage' = ANY("permissoes");
COMMIT;
