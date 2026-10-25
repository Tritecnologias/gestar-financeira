-- F9-06: explicit global technical capability, independent of platform/tenant roles.
-- No conversion, provisioning, backfill or rewrite of historical grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE public.support_operators (
  id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  status public."AccessStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_operators_pkey PRIMARY KEY (id),
  CONSTRAINT support_operators_identity_id_fkey FOREIGN KEY (identity_id)
    REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX support_operators_identity_id_key ON public.support_operators(identity_id);
COMMIT;
