BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT count(*) FROM public._prisma_migrations WHERE migration_name='20261027_pg18_baseline'
      AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ADVISORY_REQUIRES_PG18_BASELINE_V1';
  END IF;
END $$;

ALTER TYPE public."AuditAccessMode" ADD VALUE 'ADVISORY';
CREATE TABLE public.advisory_access_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  identity_id text NOT NULL REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status public."AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 3 AND 500),
  permissions text[] NOT NULL CHECK (cardinality(permissions) BETWEEN 1 AND 100),
  authorized_by_membership_id text NOT NULL,
  granted_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  starts_at timestamp(3) NOT NULL,
  expires_at timestamp(3),
  revoked_at timestamp(3),
  revoked_by_identity_id text REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revocation_reason text,
  CONSTRAINT advisory_authorizer_tenant_fkey FOREIGN KEY (authorized_by_membership_id,tenant_id)
    REFERENCES public.tenant_memberships(id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT advisory_dates_check CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT advisory_revocation_check CHECK (
    (status='ACTIVE' AND revoked_at IS NULL AND revoked_by_identity_id IS NULL AND revocation_reason IS NULL) OR
    (status='INACTIVE' AND revoked_at IS NOT NULL AND revoked_by_identity_id IS NOT NULL AND length(btrim(revocation_reason)) BETWEEN 3 AND 500)),
  CONSTRAINT advisory_access_grants_id_tenant_id_key UNIQUE(id,tenant_id)
);
CREATE UNIQUE INDEX advisory_active_identity_tenant_key ON public.advisory_access_grants(tenant_id,identity_id) WHERE status='ACTIVE';
CREATE INDEX advisory_access_grants_identity_id_status_idx ON public.advisory_access_grants(identity_id,status);
CREATE INDEX advisory_access_grants_tenant_id_status_idx ON public.advisory_access_grants(tenant_id,status);
ALTER TABLE public.audit_events ADD COLUMN advisory_grant_id text;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_advisory_grant_tenant_fkey FOREIGN KEY(advisory_grant_id,tenant_id)
  REFERENCES public.advisory_access_grants(id,tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.lancamentos ADD COLUMN criado_por_identity_id text REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_author_kind_check CHECK(criado_por IS NULL OR criado_por_identity_id IS NULL);
ALTER TABLE public.layouts_colunas ADD COLUMN identity_id text REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.layouts_colunas ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE public.layouts_colunas ADD CONSTRAINT layouts_owner_kind_check CHECK((usuario_id IS NULL) <> (identity_id IS NULL));
CREATE FUNCTION public.guard_advisory_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ADVISORY_HISTORY_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','revoked_at','revoked_by_identity_id','revocation_reason']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','revoked_at','revoked_by_identity_id','revocation_reason'])
     OR OLD.status <> 'ACTIVE' OR NEW.status <> 'INACTIVE' THEN
    RAISE EXCEPTION 'ADVISORY_ONLY_REVOCATION_ALLOWED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER advisory_history_guard BEFORE UPDATE OR DELETE ON public.advisory_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_advisory_history();
COMMIT;
