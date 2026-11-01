-- A.2.1: LOCAL laboratory only. Remote promotion requires a separately reviewed release.
BEGIN;
DO $$ BEGIN
  IF current_schema() IS DISTINCT FROM 'public' THEN RAISE EXCEPTION 'ADMISSION_REQUIRES_PUBLIC'; END IF;
END $$;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE history jsonb; completed integer; unique_names integer;
BEGIN
  SELECT jsonb_object_agg(migration_name,checksum),count(*),count(DISTINCT migration_name)
    INTO history,completed,unique_names FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR current_database() !~ '^a2_[a-z0-9_]+$' OR current_user <> 'a2_migrator'
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE rolled_back_at IS NOT NULL
      OR (finished_at IS NULL AND migration_name <> '20261101_admission_foundation'))
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL) > 1
    OR completed <> unique_names OR history IS NULL
    OR NOT ((completed=7 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28"}'::jsonb)
      OR (completed=6 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261030_prod_experiment_invitations":"4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28"}'::jsonb))
    OR to_regclass('public.admissions') IS NOT NULL OR to_regclass('public.admission_challenges') IS NOT NULL THEN
    RAISE EXCEPTION 'ADMISSION_REQUIRES_LOCAL_MIGRATOR_EXACT_H7_OR_P6';
  END IF;
END $$;

CREATE TYPE public."AdmissionSource" AS ENUM ('AUTHORIZED_INVITE','VALIDATED_PAYMENT');
CREATE TYPE public."AdmissionStatus" AS ENUM ('AUTHORIZED','PROVISIONED','CANCELLED');
CREATE TYPE public."AdmissionChallengePurpose" AS ENUM ('EMAIL_VERIFICATION','RESUME');
CREATE TYPE public."AdmissionChallengeStatus" AS ENUM ('PENDING','CONSUMED','REVOKED');
CREATE TYPE public."AdmissionDeliveryStatus" AS ENUM ('PENDING','SENT','SIMULATED','FAILED');

CREATE TABLE public.admissions (
  id text PRIMARY KEY,
  source public."AdmissionSource" NOT NULL,
  source_reference text NOT NULL,
  experiment_invitation_id text,
  authorized_email text NOT NULL,
  authorized_by_admin_id text,
  authorized_by_identity_id text,
  authorized_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp(3) NOT NULL,
  status public."AdmissionStatus" NOT NULL DEFAULT 'AUTHORIZED',
  verified_challenge_id text,
  email_verified_at timestamp(3),
  identity_id text,
  tenant_id text,
  membership_id text,
  provisioned_at timestamp(3),
  cancelled_at timestamp(3),
  cancelled_by_admin_id text,
  cancelled_by_identity_id text,
  cancellation_reason text,
  CONSTRAINT admissions_source_enabled CHECK (
    source='AUTHORIZED_INVITE' AND experiment_invitation_id IS NOT NULL
    AND source_reference=experiment_invitation_id
    AND authorized_by_admin_id IS NOT NULL AND authorized_by_identity_id IS NOT NULL),
  CONSTRAINT admissions_email_normalized CHECK (
    authorized_email=lower(btrim(authorized_email)) AND length(authorized_email) BETWEEN 3 AND 254
    AND authorized_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  CONSTRAINT admissions_expiry CHECK (expires_at>authorized_at AND expires_at<=authorized_at+interval '168 hours'),
  CONSTRAINT admissions_verification CHECK (
    (verified_challenge_id IS NULL AND email_verified_at IS NULL) OR
    (verified_challenge_id IS NOT NULL AND email_verified_at IS NOT NULL
      AND email_verified_at>=authorized_at AND email_verified_at<expires_at)),
  CONSTRAINT admissions_result CHECK (
    (status='PROVISIONED' AND tenant_id IS NOT NULL AND identity_id IS NOT NULL
      AND membership_id IS NOT NULL AND provisioned_at IS NOT NULL AND email_verified_at IS NOT NULL
      AND provisioned_at>=email_verified_at AND provisioned_at<expires_at) OR
    (status<>'PROVISIONED' AND tenant_id IS NULL AND identity_id IS NULL AND membership_id IS NULL AND provisioned_at IS NULL)),
  CONSTRAINT admissions_cancellation CHECK (
    (status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_at>=authorized_at
      AND cancelled_by_admin_id IS NOT NULL AND cancelled_by_identity_id IS NOT NULL
      AND cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason)) BETWEEN 3 AND 200) OR
    (status<>'CANCELLED' AND cancelled_at IS NULL AND cancelled_by_admin_id IS NULL
      AND cancelled_by_identity_id IS NULL AND cancellation_reason IS NULL)),
  CONSTRAINT admissions_experiment_invitation_id_fkey FOREIGN KEY(experiment_invitation_id)
    REFERENCES public.experiment_invitations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_authorized_by_admin_id_authorized_by_identity_id_fkey
    FOREIGN KEY(authorized_by_admin_id,authorized_by_identity_id) REFERENCES public.platform_admins(id,identity_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_cancelled_by_admin_id_cancelled_by_identity_id_fkey
    FOREIGN KEY(cancelled_by_admin_id,cancelled_by_identity_id) REFERENCES public.platform_admins(id,identity_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_identity_id_fkey FOREIGN KEY(identity_id) REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_tenant_id_fkey FOREIGN KEY(tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_membership_id_identity_id_tenant_id_fkey FOREIGN KEY(membership_id,identity_id,tenant_id)
    REFERENCES public.tenant_memberships(id,identity_id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admissions_id_authorized_email_key UNIQUE(id,authorized_email)
);
CREATE UNIQUE INDEX admissions_source_source_reference_key ON public.admissions(source,source_reference);
CREATE UNIQUE INDEX admissions_experiment_invitation_id_key ON public.admissions(experiment_invitation_id);
CREATE UNIQUE INDEX admissions_tenant_id_key ON public.admissions(tenant_id);
CREATE UNIQUE INDEX admissions_verified_challenge_id_key ON public.admissions(verified_challenge_id);
CREATE UNIQUE INDEX admissions_verified_challenge_id_id_key ON public.admissions(verified_challenge_id,id);
CREATE INDEX admissions_authorized_email_status_idx ON public.admissions(authorized_email,status);
CREATE INDEX admissions_status_expires_at_idx ON public.admissions(status,expires_at);

CREATE TABLE public.admission_challenges (
  id text PRIMARY KEY,
  admission_id text NOT NULL,
  recipient_email text NOT NULL,
  purpose public."AdmissionChallengePurpose" NOT NULL,
  generation integer NOT NULL,
  token_hash text NOT NULL,
  status public."AdmissionChallengeStatus" NOT NULL DEFAULT 'PENDING',
  issued_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp(3) NOT NULL,
  consumed_at timestamp(3),
  revoked_at timestamp(3),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_attempt_at timestamp(3),
  delivery_status public."AdmissionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT admission_challenges_generation CHECK (generation>0),
  CONSTRAINT admission_challenges_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admission_challenges_attempts CHECK (max_attempts BETWEEN 1 AND 10 AND attempt_count BETWEEN 0 AND max_attempts),
  CONSTRAINT admission_challenges_expiry CHECK (expires_at>issued_at AND expires_at<=issued_at+
    CASE WHEN purpose='EMAIL_VERIFICATION' THEN interval '15 minutes' ELSE interval '30 minutes' END),
  CONSTRAINT admission_challenges_attempt_time CHECK (
    (attempt_count=0 AND last_attempt_at IS NULL) OR
    (attempt_count>0 AND last_attempt_at IS NOT NULL AND last_attempt_at>=issued_at)),
  CONSTRAINT admission_challenges_state CHECK (
    (status='PENDING' AND consumed_at IS NULL AND revoked_at IS NULL) OR
    (status='CONSUMED' AND consumed_at IS NOT NULL AND consumed_at>=issued_at AND consumed_at<expires_at
      AND attempt_count>0 AND last_attempt_at=consumed_at AND revoked_at IS NULL) OR
    (status='REVOKED' AND consumed_at IS NULL AND revoked_at IS NOT NULL AND revoked_at>=issued_at)),
  CONSTRAINT admission_challenges_admission_id_recipient_email_fkey FOREIGN KEY(admission_id,recipient_email)
    REFERENCES public.admissions(id,authorized_email) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT admission_challenges_id_admission_id_key UNIQUE(id,admission_id)
);
CREATE UNIQUE INDEX admission_challenges_token_hash_key ON public.admission_challenges(token_hash);
CREATE UNIQUE INDEX admission_challenges_admission_id_purpose_generation_key ON public.admission_challenges(admission_id,purpose,generation);
CREATE UNIQUE INDEX admission_challenges_one_pending_per_purpose ON public.admission_challenges(admission_id,purpose) WHERE status='PENDING';
CREATE INDEX admission_challenges_admission_id_issued_at_idx ON public.admission_challenges(admission_id,issued_at);
ALTER TABLE public.admissions ADD CONSTRAINT admissions_verified_challenge_id_id_fkey
  FOREIGN KEY(verified_challenge_id,id) REFERENCES public.admission_challenges(id,admission_id) ON DELETE RESTRICT ON UPDATE CASCADE;
REVOKE ALL ON public.admissions, public.admission_challenges FROM PUBLIC;
-- No grants, seeds, updates of existing records, privileged routines or changes to existing invitation rules.
COMMIT;
