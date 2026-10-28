BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 2
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_pg18_baseline'
      AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261027_z_advisory_access'
      AND checksum='29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR to_regclass('public.tenant_contractual_onboarding') IS NOT NULL THEN
    RAISE EXCEPTION 'CONTRACTUAL_ONBOARDING_REQUIRES_EXACT_PG18_LEDGER2';
  END IF;
END $$;

CREATE TYPE public."ContractualOnboardingChoice" AS ENUM ('SELF','OTHER');
CREATE TYPE public."ContractualOnboardingStatus" AS ENUM ('PENDING','ASSIGNED','CANCELLED');
ALTER TABLE public.access_invites ADD CONSTRAINT access_invites_id_tenant_id_key UNIQUE(id,tenant_id);

CREATE TABLE public.tenant_contractual_onboarding (
  tenant_id text PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  choice public."ContractualOnboardingChoice" NOT NULL,
  status public."ContractualOnboardingStatus" NOT NULL,
  initiated_by_membership_id text NOT NULL,
  invitation_id text,
  assigned_membership_id text,
  assigned_at timestamp(3),
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contractual_initiator_tenant_fkey FOREIGN KEY(initiated_by_membership_id,tenant_id)
    REFERENCES public.tenant_memberships(id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contractual_invitation_tenant_fkey FOREIGN KEY(invitation_id,tenant_id)
    REFERENCES public.access_invites(id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contractual_assignee_tenant_fkey FOREIGN KEY(assigned_membership_id,tenant_id)
    REFERENCES public.tenant_memberships(id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT contractual_onboarding_invitation_kind_check CHECK (
    (choice='SELF' AND invitation_id IS NULL) OR (choice='OTHER' AND invitation_id IS NOT NULL)),
  CONSTRAINT contractual_onboarding_self_check CHECK (
    choice<>'SELF' OR status<>'ASSIGNED' OR assigned_membership_id=initiated_by_membership_id),
  CONSTRAINT contractual_onboarding_state_check CHECK (
    (status='PENDING' AND choice='OTHER' AND assigned_membership_id IS NULL AND assigned_at IS NULL) OR
    (status='ASSIGNED' AND assigned_membership_id IS NOT NULL AND assigned_at IS NOT NULL) OR
    (status='CANCELLED' AND assigned_membership_id IS NULL AND assigned_at IS NULL)),
  CONSTRAINT tenant_contractual_onboarding_invitation_id_tenant_id_key UNIQUE(invitation_id,tenant_id)
);
-- No UPDATE/backfill: valid existing responsibilities and acceptances remain unchanged.
-- Runtime needs only SELECT/INSERT/UPDATE on this new access-state table, granted operationally.
COMMIT;
