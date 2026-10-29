BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 3
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_pg18_baseline' AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_z_advisory_access' AND checksum='29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261028_contractual_onboarding' AND checksum='c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR to_regclass('public.experiment_invitations') IS NOT NULL THEN
    RAISE EXCEPTION 'EXPERIMENT_INVITATIONS_REQUIRES_EXACT_PG18_LEDGER3';
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
  CONSTRAINT experiment_expiry CHECK (expires_at > created_at)
);
CREATE INDEX experiment_invitations_created_at_idx ON public.experiment_invitations(created_at DESC);
-- Additive only: no existing business/access rows are changed.
-- Operational grants: runtime SELECT/INSERT/UPDATE only; never DELETE, DDL or ledger writes.
COMMIT;
