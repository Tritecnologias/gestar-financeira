-- Only LOCAL/laboratory or HOMOLOG for this phase; never execute against PROD.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('dez.contractual_runtime', :'runtime', true);
DO $$
DECLARE rt text := current_setting('dez.contractual_runtime');
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (current_database() NOT IN ('gestar_vf_dev','gestar_homolog_pg18') AND current_database() !~ '^phase12a_[a-z_]+$')
    OR rt !~ '^[a-z][a-z0-9_]+$'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=rt AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261028_contractual_onboarding'
      AND checksum='c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'CONTRACTUAL_RUNTIME_ACL_GUARD';
  END IF;
  EXECUTE format('REVOKE ALL ON TABLE public.tenant_contractual_onboarding FROM %I',rt);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.tenant_contractual_onboarding TO %I',rt);
END $$;
COMMIT;
