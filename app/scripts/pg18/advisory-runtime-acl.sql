-- Separate operational grant after the migration; never DDL for runtime.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT set_config('dez.runtime', :'runtime', true);
DO $$ DECLARE rt text := current_setting('dez.runtime'); BEGIN
  IF current_database() NOT IN ('phase11b_lab','gestar_homolog_pg18')
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR rt !~ '^[a-z][a-z0-9_]+$'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=rt AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261027_z_advisory_access'
      AND checksum='29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'ADVISORY_ACL_GUARD'; END IF;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.advisory_access_grants TO %I',rt);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.guard_advisory_history() TO %I',rt);
END $$;
COMMIT;
