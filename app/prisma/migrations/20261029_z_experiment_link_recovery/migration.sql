BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF current_database() NOT IN ('special_invite_lab','gestar_homolog_pg18')
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 4
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_pg18_baseline' AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_z_advisory_access' AND checksum='29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261028_contractual_onboarding' AND checksum='c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261029_experiment_invitations' AND checksum='a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'EXPERIMENT_LINK_RECOVERY_REQUIRES_LOCAL_HOMOLOG_LEDGER4';
  END IF;
END $$;
ALTER TABLE public.experiment_invitations ADD COLUMN encrypted_token text
  CHECK (encrypted_token IS NULL OR (length(encrypted_token) BETWEEN 100 AND 1024 AND encrypted_token ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'));
-- No token/hash replacement, backfill, access grant or business-data modification.
COMMIT;
