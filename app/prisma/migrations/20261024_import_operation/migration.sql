-- Additive operation receipts; no updates to existing business data.
CREATE TABLE public.import_operations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  contract_type text NOT NULL,
  contract_version integer NOT NULL CHECK (contract_version > 0),
  payload_digest varchar(64) NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  file_digest varchar(64) NOT NULL CHECK (file_digest ~ '^[0-9a-f]{64}$'),
  actor_identity_id text REFERENCES public.auth_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created integer NOT NULL CHECK (created >= 0),
  updated integer NOT NULL CHECK (updated >= 0),
  unchanged integer NOT NULL CHECK (unchanged >= 0),
  warnings integer NOT NULL CHECK (warnings >= 0),
  completed_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT import_operations_idempotency_key UNIQUE (tenant_id, contract_type, contract_version, payload_digest)
);
CREATE INDEX import_operations_tenant_id_completed_at_idx ON public.import_operations(tenant_id, completed_at);
