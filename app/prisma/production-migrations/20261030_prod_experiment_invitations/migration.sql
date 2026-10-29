BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF current_database() <> 'gestar_prod_pg18'
    OR current_user <> 'pg18_prod_migrator'
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name <> '20261030_prod_experiment_invitations')
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 3
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_pg18_baseline' AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_z_advisory_access' AND checksum='29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261028_contractual_onboarding' AND checksum='c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR to_regclass('public.experiment_invitations') IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pg18_prod_runtime' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole)
    OR has_schema_privilege('pg18_prod_runtime','public','CREATE')
    OR has_table_privilege('pg18_prod_runtime','public._prisma_migrations','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'PROD_EXPERIMENT_REQUIRES_EXACT_PG18_LEDGER3_MIGRATOR_AND_RESTRICTED_RUNTIME';
  END IF;
END $$;
CREATE TABLE public.experiment_invitations (
  id text PRIMARY KEY,
  recipient_name text NOT NULL CHECK (length(btrim(recipient_name)) BETWEEN 1 AND 160),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by_identity_id text NOT NULL REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp(3) NOT NULL,
  revoked_at timestamp(3),
  viewed_at timestamp(3),
  acknowledged_at timestamp(3),
  interest_at timestamp(3),
  encrypted_token text CHECK (encrypted_token IS NULL OR (length(encrypted_token) BETWEEN 100 AND 1024 AND encrypted_token ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')),
  CONSTRAINT experiment_expiry CHECK (expires_at > created_at)
);
CREATE INDEX experiment_invitations_created_at_idx ON public.experiment_invitations(created_at DESC);
REVOKE ALL ON public.experiment_invitations FROM PUBLIC, pg18_prod_runtime;
GRANT SELECT, INSERT, UPDATE ON public.experiment_invitations TO pg18_prod_runtime;
-- Separate productive history; no rewriting, resolving or pretending the pilot SQL ran here.
-- No seed, backfill, access grant or updates to existing business/authentication rows.
COMMIT;
