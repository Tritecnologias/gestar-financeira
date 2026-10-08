-- Existing MEMBER accounts could not delete launches before ACCESS-4.
-- Keep that behavior while allowing future profiles to grant the action explicitly.
BEGIN;

INSERT INTO "access_profiles" ("id", "tenant_id", "nome", "descricao", "permissoes")
SELECT gen_random_uuid()::text, p."tenant_id", 'ACESSO LEGADO MEMBRO',
  'Compatibilidade para membros existentes antes do ACCESS-4',
  array_remove(p."permissoes", 'fluxo.lancamentos.delete')
FROM "access_profiles" p
WHERE p."nome" = 'ACESSO LEGADO'
  AND EXISTS (SELECT 1 FROM "tenant_memberships" m WHERE m."tenant_id" = p."tenant_id" AND m."role" = 'MEMBER')
ON CONFLICT ("tenant_id", "nome") DO NOTHING;

UPDATE "tenant_memberships" m SET "profile_id" = target."id"
FROM "access_profiles" source, "access_profiles" target
WHERE source."id" = m."profile_id" AND source."nome" = 'ACESSO LEGADO'
  AND target."tenant_id" = m."tenant_id" AND target."nome" = 'ACESSO LEGADO MEMBRO'
  AND m."role" = 'MEMBER';

COMMIT;
