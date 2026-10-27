-- PG18 BASELINE V1: fresh installation only; canonical f670 fresh schema19.
-- Reviewed specification: docs/PG18-BASELINE-V1.md and docs/pg18/schema19-canonical.json.
-- No data, secrets, legacy transforms, access seeds, historical ledger or Power BI login.
BEGIN;
DO $target_schema_guard$
BEGIN
  IF current_schema() IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'PG18_BASELINE_REQUIRES_PUBLIC';
  END IF;
END
$target_schema_guard$;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL timezone = 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL default_tablespace = '';
SET LOCAL default_table_access_method = heap;

DO $baseline_guard$
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999 THEN
    RAISE EXCEPTION 'PG18_BASELINE_REQUIRES_POSTGRESQL18';
  END IF;
  IF current_schema() <> 'public' THEN RAISE EXCEPTION 'PG18_BASELINE_REQUIRES_PUBLIC'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')
        AND c.relname<>'_prisma_migrations')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typnamespace='public'::regnamespace AND typtype IN ('e','d')) THEN
    RAISE EXCEPTION 'PG18_BASELINE_REQUIRES_EMPTY_SCHEMA';
  END IF;
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public._prisma_migrations
        WHERE migration_name <> '20261027_pg18_baseline'
           OR finished_at IS NOT NULL OR rolled_back_at IS NOT NULL) THEN
      RAISE EXCEPTION 'PG18_BASELINE_INCOMPATIBLE_LEDGER';
    END IF;
  END IF;
END
$baseline_guard$;

CREATE TYPE public."AccessInviteStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EXPIRED',
    'REVOKED'
);

CREATE TYPE public."AccessStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);

CREATE TYPE public."AuditAccessMode" AS ENUM (
    'MEMBERSHIP',
    'PLATFORM_ADMIN',
    'SUPPORT_GRANT',
    'SYSTEM'
);

CREATE TYPE public."AuditResult" AS ENUM (
    'SUCCESS',
    'DENIED',
    'FAILURE'
);

CREATE TYPE public."MembershipRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER'
);

CREATE TYPE public."SupportAccessLevel" AS ENUM (
    'READ_ONLY',
    'OPERATIONAL'
);

CREATE TYPE public."SupportGrantEventType" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'ACTIVATED',
    'USED',
    'REVOKED',
    'EXPIRED'
);

CREATE TYPE public."SupportGrantStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'REJECTED',
    'REVOKED',
    'EXPIRED'
);

CREATE TYPE public."SupportModule" AS ENUM (
    'ESTRUTURA_EMPRESA',
    'ESTRUTURA_FINANCEIRA'
);

CREATE TYPE public."TermAudience" AS ENUM (
    'CONTRATANTE',
    'USUARIO'
);

CREATE TYPE public."TermVersionStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'RETIRED'
);

CREATE FUNCTION public.access5a_prevent_evidence_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Term acceptances are append-only';
END $$;

CREATE FUNCTION public.access5a_protect_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Published term versions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('PUBLISHED', 'RETIRED') THEN
    IF NEW.status <> 'RETIRED' OR
       (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'Published term versions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.bump_lancamento_revision() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.revisao := OLD.revisao + 1;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.forbid_audit_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;

CREATE FUNCTION public.guard_tenant_restore_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE old_t text; new_t text; v text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_t := to_jsonb(OLD)->>TG_ARGV[0]; END IF;
  IF TG_OP <> 'DELETE' THEN new_t := to_jsonb(NEW)->>TG_ARGV[0]; END IF;
  FOR v IN SELECT DISTINCT x FROM unnest(ARRAY[old_t,new_t]) x WHERE x IS NOT NULL ORDER BY x LOOP
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('10s:tenant-restore:' || v,0)) THEN
      RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='TENANT_RESTORE_IN_PROGRESS';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TABLE public.access_invites (
    id text NOT NULL,
    tenant_id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role public."MembershipRole" NOT NULL,
    profile_id text NOT NULL,
    status public."AccessInviteStatus" DEFAULT 'PENDING'::public."AccessInviteStatus" NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    invited_by_identity_id text NOT NULL,
    accepted_by_identity_id text,
    revoked_by_identity_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    accepted_at timestamp(3) without time zone,
    revoked_at timestamp(3) without time zone
);

CREATE TABLE public.access_owner_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    actor_identity_id text,
    actor_legacy_user_id text,
    target_identity_id text NOT NULL,
    target_membership_id text NOT NULL,
    previous_role text,
    previous_status text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.access_profiles (
    id text NOT NULL,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    permissoes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.areas_negocio (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.audit_events (
    id text NOT NULL,
    occurred_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actor_identity_id text,
    actor_membership_id text,
    platform_admin_id text,
    tenant_id text,
    access_mode public."AuditAccessMode" NOT NULL,
    support_grant_id text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    result public."AuditResult" NOT NULL,
    reason text,
    metadata jsonb,
    changes jsonb,
    request_id text,
    CONSTRAINT audit_events_action_check CHECK (((length(action) >= 3) AND (length(action) <= 100))),
    CONSTRAINT audit_events_membership_context_check CHECK (((actor_membership_id IS NULL) OR (tenant_id IS NOT NULL))),
    CONSTRAINT audit_events_resource_check CHECK (((length(resource_type) >= 2) AND (length(resource_type) <= 100))),
    CONSTRAINT audit_events_support_context_check CHECK (((support_grant_id IS NULL) OR (tenant_id IS NOT NULL)))
);

CREATE TABLE public.auth_identities (
    id text NOT NULL,
    email text NOT NULL,
    nome text NOT NULL,
    senha_hash text NOT NULL,
    status public."AccessStatus" DEFAULT 'ACTIVE'::public."AccessStatus" NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT auth_identities_email_normalized_check CHECK (((email <> ''::text) AND (email = lower(btrim(email)))))
);

CREATE TABLE public.categorias (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    tipo text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.centros_custo (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    area_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.clientes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(20) NOT NULL,
    nome text NOT NULL,
    tipo_pessoa character varying(2),
    nome_fantasia text,
    email text,
    telefone text,
    documento text,
    endereco text,
    conta_padrao_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.dados_bancarios (
    id text NOT NULL,
    tenant_id text NOT NULL,
    banco text NOT NULL,
    agencia text,
    conta text,
    tipo text,
    titular text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.dre (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.empresas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    cnpj text,
    insc_estadual text,
    telefone text,
    email text,
    endereco text,
    cidade text,
    estado text,
    cep text,
    segmento text,
    porte text,
    data_fundacao date,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.fornecedores (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(20) NOT NULL,
    nome text NOT NULL,
    tipo_pessoa character varying(2),
    nome_fantasia text,
    documento text,
    email text,
    telefone text,
    endereco text,
    conta_padrao_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.import_operations (
    id text NOT NULL,
    tenant_id text NOT NULL,
    contract_type text NOT NULL,
    contract_version integer NOT NULL,
    payload_digest character varying(64) NOT NULL,
    file_digest character varying(64) NOT NULL,
    actor_identity_id text,
    created integer NOT NULL,
    updated integer NOT NULL,
    unchanged integer NOT NULL,
    warnings integer NOT NULL,
    completed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT import_operations_contract_version_check CHECK ((contract_version > 0)),
    CONSTRAINT import_operations_created_check CHECK ((created >= 0)),
    CONSTRAINT import_operations_file_digest_check CHECK (((file_digest)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT import_operations_payload_digest_check CHECK (((payload_digest)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT import_operations_unchanged_check CHECK ((unchanged >= 0)),
    CONSTRAINT import_operations_updated_check CHECK ((updated >= 0)),
    CONSTRAINT import_operations_warnings_check CHECK ((warnings >= 0))
);

CREATE TABLE public.lancamentos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    seq integer NOT NULL,
    data_lanc date,
    data_emissao date,
    data_venc_original date,
    data_venc_plano date,
    data_evento date,
    data_pagamento date,
    descricao text,
    valor numeric(15,2),
    valor_previsto numeric(15,2),
    banco text,
    tipo text,
    status text DEFAULT 'realizado'::text NOT NULL,
    status_manual text,
    status_extrato text,
    conta_id text,
    fornecedor_id text,
    cliente_id text,
    fornecedor text,
    centro_custo text,
    referencia text,
    fantasia_padrao text,
    categoria text,
    dre text,
    cont text,
    anotacao text,
    metadados jsonb DEFAULT '{}'::jsonb NOT NULL,
    importado boolean DEFAULT false NOT NULL,
    importado_em timestamp(3) without time zone,
    criado_por text,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revisao bigint DEFAULT 0 NOT NULL,
    CONSTRAINT lancamentos_revisao_nonnegative CHECK ((revisao >= 0)),
    CONSTRAINT lancamentos_valor_check CHECK (((valor IS NULL) OR (valor >= (0)::numeric)))
);

CREATE TABLE public.layouts_colunas (
    id text NOT NULL,
    usuario_id text NOT NULL,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    colunas jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.legacy_user_access_maps (
    id text NOT NULL,
    legacy_usuario_id text NOT NULL,
    identity_id text NOT NULL,
    tenant_id text NOT NULL,
    membership_id text,
    platform_admin_id text,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT legacy_user_access_maps_target_check CHECK (((membership_id IS NOT NULL) <> (platform_admin_id IS NOT NULL)))
);

CREATE TABLE public.pessoas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(20) NOT NULL,
    nome text NOT NULL,
    cargo text,
    departamento text,
    email text,
    telefone text,
    documento text,
    data_admissao date,
    salario numeric(15,2),
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.plano_contas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text,
    descricao text NOT NULL,
    tipo text NOT NULL,
    pai_id text,
    categoria_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.platform_admins (
    id text NOT NULL,
    identity_id text NOT NULL,
    status public."AccessStatus" DEFAULT 'ACTIVE'::public."AccessStatus" NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.produto_grupos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.produto_linhas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    tipo_id text NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.produto_sequencias (
    id text NOT NULL,
    tenant_id text NOT NULL,
    escopo character varying(100) NOT NULL,
    ultimo_numero bigint NOT NULL
);

CREATE TABLE public.produto_tipos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    grupo text,
    grupo_id text,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.produtos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    tipo text,
    grupo_id text,
    tipo_id text,
    linha_id text,
    descricao text,
    observacoes text,
    unidade text,
    preco_venda numeric(15,2),
    preco_custo numeric(15,2),
    categoria text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.status_manual_tipos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    cor text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);

CREATE TABLE public.support_grant_events (
    id text NOT NULL,
    grant_id text NOT NULL,
    tenant_id text NOT NULL,
    type public."SupportGrantEventType" NOT NULL,
    actor_identity_id text,
    detail text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.support_grants (
    id text NOT NULL,
    tenant_id text NOT NULL,
    platform_admin_identity_id text NOT NULL,
    status public."SupportGrantStatus" DEFAULT 'PENDING'::public."SupportGrantStatus" NOT NULL,
    reason text NOT NULL,
    modules public."SupportModule"[] NOT NULL,
    access_level public."SupportAccessLevel" DEFAULT 'READ_ONLY'::public."SupportAccessLevel" NOT NULL,
    requested_minutes integer NOT NULL,
    requested_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    approved_at timestamp(3) without time zone,
    approved_by_membership_id text,
    starts_at timestamp(3) without time zone,
    expires_at timestamp(3) without time zone,
    rejected_at timestamp(3) without time zone,
    rejection_reason text,
    revoked_at timestamp(3) without time zone,
    revoked_by_identity_id text,
    revocation_reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT support_grants_active_window_check CHECK (((status <> 'ACTIVE'::public."SupportGrantStatus") OR ((approved_at IS NOT NULL) AND (approved_by_membership_id IS NOT NULL) AND (starts_at IS NOT NULL) AND (expires_at IS NOT NULL) AND (expires_at > starts_at)))),
    CONSTRAINT support_grants_minutes_check CHECK (((requested_minutes >= 15) AND (requested_minutes <= 1440))),
    CONSTRAINT support_grants_modules_check CHECK (((cardinality(modules) >= 1) AND (cardinality(modules) <= 2))),
    CONSTRAINT support_grants_reason_check CHECK ((length(btrim(reason)) >= 15))
);

CREATE TABLE public.support_operators (
    id text NOT NULL,
    identity_id text NOT NULL,
    status public."AccessStatus" DEFAULT 'ACTIVE'::public."AccessStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.tarefa_status (
    id text NOT NULL,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.tarefas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    seq integer NOT NULL,
    nome text NOT NULL,
    status text DEFAULT 'A Fazer!'::text NOT NULL,
    status_cor text,
    colunas jsonb DEFAULT '[]'::jsonb NOT NULL,
    linhas jsonb DEFAULT '[]'::jsonb NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE public.tarefas_seq_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.tarefas_seq_seq OWNED BY public.tarefas.seq;

CREATE TABLE public.tenant_contractual_responsibles (
    tenant_id text NOT NULL,
    membership_id text NOT NULL,
    assigned_by_identity_id text NOT NULL,
    assigned_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.tenant_memberships (
    id text NOT NULL,
    identity_id text NOT NULL,
    tenant_id text NOT NULL,
    status public."AccessStatus" DEFAULT 'ACTIVE'::public."AccessStatus" NOT NULL,
    role public."MembershipRole" DEFAULT 'MEMBER'::public."MembershipRole" NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    profile_id text
);

CREATE TABLE public.tenants (
    id text NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    email text NOT NULL,
    plano text DEFAULT 'trial'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    logo_url text,
    titulo_tabela_status text DEFAULT 'VALOR PREVISTO'::text,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.term_acceptances (
    id text NOT NULL,
    identity_id text NOT NULL,
    term_version_id text NOT NULL,
    tenant_id text,
    membership_id text,
    scope_key text NOT NULL,
    role_at_acceptance text,
    accepted_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address text,
    user_agent text,
    document_hash text NOT NULL,
    CONSTRAINT term_acceptances_hash_check CHECK ((document_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT term_acceptances_scope_check CHECK ((((tenant_id IS NULL) AND (membership_id IS NULL) AND (scope_key = 'GLOBAL'::text) AND (role_at_acceptance IS NULL)) OR ((tenant_id IS NOT NULL) AND (membership_id IS NOT NULL) AND (scope_key = tenant_id) AND (role_at_acceptance = 'OWNER'::text))))
);

CREATE TABLE public.term_documents (
    id text NOT NULL,
    code text NOT NULL,
    audience public."TermAudience" NOT NULL,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.term_versions (
    id text NOT NULL,
    document_id text NOT NULL,
    version text NOT NULL,
    title text NOT NULL,
    description text,
    storage_key text NOT NULL,
    mime_type text NOT NULL,
    byte_size integer NOT NULL,
    sha256 text NOT NULL,
    status public."TermVersionStatus" DEFAULT 'DRAFT'::public."TermVersionStatus" NOT NULL,
    requires_reaccept boolean DEFAULT true NOT NULL,
    published_at timestamp(3) without time zone,
    published_by_identity_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT term_versions_byte_size_check CHECK ((byte_size > 0)),
    CONSTRAINT term_versions_publication_check CHECK ((((status = 'DRAFT'::public."TermVersionStatus") AND (published_at IS NULL) AND (published_by_identity_id IS NULL)) OR ((status <> 'DRAFT'::public."TermVersionStatus") AND (published_at IS NOT NULL) AND (published_by_identity_id IS NOT NULL)))),
    CONSTRAINT term_versions_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE public.usuarios (
    id text NOT NULL,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    senha_hash text NOT NULL,
    papel text DEFAULT 'membro'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.tarefas ALTER COLUMN seq SET DEFAULT nextval('public.tarefas_seq_seq'::regclass);

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.access_owner_events
    ADD CONSTRAINT access_owner_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dados_bancarios
    ADD CONSTRAINT dados_bancarios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_operations
    ADD CONSTRAINT import_operations_idempotency_key UNIQUE (tenant_id, contract_type, contract_version, payload_digest);

ALTER TABLE ONLY public.import_operations
    ADD CONSTRAINT import_operations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produto_grupos
    ADD CONSTRAINT produto_grupos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produto_sequencias
    ADD CONSTRAINT produto_sequencias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_operators
    ADD CONSTRAINT support_operators_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tarefa_status
    ADD CONSTRAINT tarefa_status_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_membership_id_key UNIQUE (membership_id);

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_pkey PRIMARY KEY (tenant_id);

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.term_documents
    ADD CONSTRAINT term_documents_code_key UNIQUE (code);

ALTER TABLE ONLY public.term_documents
    ADD CONSTRAINT term_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_storage_key_key UNIQUE (storage_key);

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX access_invites_one_pending_email_tenant ON public.access_invites USING btree (tenant_id, email) WHERE (status = 'PENDING'::public."AccessInviteStatus");

CREATE INDEX access_invites_tenant_id_email_status_idx ON public.access_invites USING btree (tenant_id, email, status);

CREATE INDEX access_invites_tenant_id_status_created_at_idx ON public.access_invites USING btree (tenant_id, status, created_at DESC);

CREATE UNIQUE INDEX access_invites_token_hash_key ON public.access_invites USING btree (token_hash);

CREATE INDEX access_owner_events_tenant_id_created_at_idx ON public.access_owner_events USING btree (tenant_id, created_at);

CREATE UNIQUE INDEX access_profiles_id_tenant_id_key ON public.access_profiles USING btree (id, tenant_id);

CREATE INDEX access_profiles_tenant_id_ativo_idx ON public.access_profiles USING btree (tenant_id, ativo);

CREATE UNIQUE INDEX access_profiles_tenant_id_nome_key ON public.access_profiles USING btree (tenant_id, nome);

CREATE UNIQUE INDEX areas_negocio_tenant_id_codigo_key ON public.areas_negocio USING btree (tenant_id, codigo);

CREATE INDEX audit_events_action_occurred_at_idx ON public.audit_events USING btree (action, occurred_at DESC);

CREATE INDEX audit_events_actor_identity_id_occurred_at_idx ON public.audit_events USING btree (actor_identity_id, occurred_at DESC);

CREATE INDEX audit_events_support_grant_id_occurred_at_idx ON public.audit_events USING btree (support_grant_id, occurred_at DESC);

CREATE INDEX audit_events_tenant_id_occurred_at_idx ON public.audit_events USING btree (tenant_id, occurred_at DESC);

CREATE UNIQUE INDEX auth_identities_email_key ON public.auth_identities USING btree (email);

CREATE UNIQUE INDEX categorias_tenant_id_codigo_key ON public.categorias USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX centros_custo_tenant_id_codigo_key ON public.centros_custo USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX clientes_tenant_id_codigo_key ON public.clientes USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX clientes_tenant_id_id_key ON public.clientes USING btree (tenant_id, id);

CREATE UNIQUE INDEX dre_tenant_id_codigo_key ON public.dre USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX fornecedores_tenant_id_codigo_key ON public.fornecedores USING btree (tenant_id, codigo);

CREATE INDEX idx_area_negocio_tenant ON public.areas_negocio USING btree (tenant_id);

CREATE INDEX idx_categoria_tenant ON public.categorias USING btree (tenant_id);

CREATE INDEX idx_centro_custo_tenant ON public.centros_custo USING btree (tenant_id);

CREATE INDEX idx_clientes_conta_padrao ON public.clientes USING btree (tenant_id, conta_padrao_id);

CREATE INDEX idx_clientes_tenant ON public.clientes USING btree (tenant_id);

CREATE INDEX idx_dados_bancarios_tenant ON public.dados_bancarios USING btree (tenant_id);

CREATE INDEX idx_dre_tenant ON public.dre USING btree (tenant_id);

CREATE INDEX idx_empresa_tenant ON public.empresas USING btree (tenant_id);

CREATE INDEX idx_fornecedores_conta_padrao ON public.fornecedores USING btree (tenant_id, conta_padrao_id);

CREATE INDEX idx_fornecedores_tenant ON public.fornecedores USING btree (tenant_id);

CREATE INDEX idx_lancamentos_fornecedor ON public.lancamentos USING btree (fornecedor_id);

CREATE INDEX idx_lancamentos_tenant_cliente ON public.lancamentos USING btree (tenant_id, cliente_id);

CREATE INDEX idx_lancamentos_tenant_data ON public.lancamentos USING btree (tenant_id, data_lanc DESC);

CREATE INDEX idx_lancamentos_tenant_status ON public.lancamentos USING btree (tenant_id, status);

CREATE INDEX idx_lancamentos_tenant_tipo ON public.lancamentos USING btree (tenant_id, tipo);

CREATE INDEX idx_lancamentos_venc_plano ON public.lancamentos USING btree (tenant_id, data_venc_plano);

CREATE INDEX idx_layouts_usuario ON public.layouts_colunas USING btree (usuario_id);

CREATE INDEX idx_pessoas_tenant ON public.pessoas USING btree (tenant_id);

CREATE INDEX idx_plano_contas_tenant_categoria ON public.plano_contas USING btree (tenant_id, categoria_id);

CREATE INDEX idx_plano_contas_tenant_codigo ON public.plano_contas USING btree (tenant_id, codigo);

CREATE INDEX idx_produto_grupos_tenant ON public.produto_grupos USING btree (tenant_id);

CREATE INDEX idx_produto_linhas_tipo ON public.produto_linhas USING btree (tenant_id, tipo_id);

CREATE INDEX idx_produto_tipos_tenant ON public.produto_tipos USING btree (tenant_id);

CREATE INDEX idx_produtos_grupo ON public.produtos USING btree (tenant_id, grupo_id);

CREATE INDEX idx_produtos_linha ON public.produtos USING btree (tenant_id, linha_id);

CREATE INDEX idx_produtos_tenant ON public.produtos USING btree (tenant_id);

CREATE INDEX idx_produtos_tipo ON public.produtos USING btree (tenant_id, tipo_id);

CREATE INDEX idx_status_manual_tenant ON public.status_manual_tipos USING btree (tenant_id);

CREATE INDEX idx_tarefa_status_tenant ON public.tarefa_status USING btree (tenant_id);

CREATE INDEX idx_tarefas_tenant ON public.tarefas USING btree (tenant_id);

CREATE INDEX import_operations_tenant_id_completed_at_idx ON public.import_operations USING btree (tenant_id, completed_at);

CREATE INDEX legacy_user_access_maps_identity_id_idx ON public.legacy_user_access_maps USING btree (identity_id);

CREATE UNIQUE INDEX legacy_user_access_maps_legacy_usuario_id_key ON public.legacy_user_access_maps USING btree (legacy_usuario_id);

CREATE UNIQUE INDEX legacy_user_access_maps_legacy_usuario_id_tenant_id_key ON public.legacy_user_access_maps USING btree (legacy_usuario_id, tenant_id);

CREATE INDEX legacy_user_access_maps_tenant_id_idx ON public.legacy_user_access_maps USING btree (tenant_id);

CREATE UNIQUE INDEX pessoas_tenant_id_codigo_key ON public.pessoas USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX plano_contas_tenant_id_id_key ON public.plano_contas USING btree (tenant_id, id);

CREATE UNIQUE INDEX platform_admins_id_identity_id_key ON public.platform_admins USING btree (id, identity_id);

CREATE UNIQUE INDEX platform_admins_identity_id_key ON public.platform_admins USING btree (identity_id);

CREATE UNIQUE INDEX produto_grupos_tenant_id_codigo_key ON public.produto_grupos USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX produto_grupos_tenant_id_id_key ON public.produto_grupos USING btree (tenant_id, id);

CREATE UNIQUE INDEX produto_linhas_tenant_id_id_key ON public.produto_linhas USING btree (tenant_id, id);

CREATE UNIQUE INDEX produto_linhas_tenant_id_tipo_id_codigo_key ON public.produto_linhas USING btree (tenant_id, tipo_id, codigo);

CREATE UNIQUE INDEX produto_sequencias_tenant_id_escopo_key ON public.produto_sequencias USING btree (tenant_id, escopo);

CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo, codigo);

CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_id_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo_id, codigo);

CREATE UNIQUE INDEX produto_tipos_tenant_id_id_key ON public.produto_tipos USING btree (tenant_id, id);

CREATE UNIQUE INDEX produtos_tenant_id_codigo_key ON public.produtos USING btree (tenant_id, codigo);

CREATE UNIQUE INDEX status_manual_tipos_tenant_id_codigo_key ON public.status_manual_tipos USING btree (tenant_id, codigo);

CREATE INDEX support_grant_events_grant_id_created_at_idx ON public.support_grant_events USING btree (grant_id, created_at);

CREATE INDEX support_grant_events_tenant_id_created_at_idx ON public.support_grant_events USING btree (tenant_id, created_at);

CREATE UNIQUE INDEX support_grants_id_tenant_id_key ON public.support_grants USING btree (id, tenant_id);

CREATE INDEX support_grants_platform_admin_identity_id_status_expires_at_idx ON public.support_grants USING btree (platform_admin_identity_id, status, expires_at);

CREATE INDEX support_grants_tenant_id_status_expires_at_idx ON public.support_grants USING btree (tenant_id, status, expires_at);

CREATE UNIQUE INDEX support_operators_identity_id_key ON public.support_operators USING btree (identity_id);

CREATE UNIQUE INDEX tenant_contractual_responsibles_membership_id_tenant_id_key ON public.tenant_contractual_responsibles USING btree (membership_id, tenant_id);

CREATE UNIQUE INDEX tenant_memberships_id_identity_id_tenant_id_key ON public.tenant_memberships USING btree (id, identity_id, tenant_id);

CREATE UNIQUE INDEX tenant_memberships_id_tenant_id_key ON public.tenant_memberships USING btree (id, tenant_id);

CREATE UNIQUE INDEX tenant_memberships_identity_id_tenant_id_key ON public.tenant_memberships USING btree (identity_id, tenant_id);

CREATE INDEX tenant_memberships_tenant_id_status_idx ON public.tenant_memberships USING btree (tenant_id, status);

CREATE UNIQUE INDEX tenants_email_key ON public.tenants USING btree (email);

CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);

CREATE UNIQUE INDEX term_acceptances_identity_id_term_version_id_scope_key_key ON public.term_acceptances USING btree (identity_id, term_version_id, scope_key);

CREATE INDEX term_acceptances_tenant_id_accepted_at_idx ON public.term_acceptances USING btree (tenant_id, accepted_at);

CREATE INDEX term_acceptances_term_version_id_accepted_at_idx ON public.term_acceptances USING btree (term_version_id, accepted_at);

CREATE INDEX term_versions_document_id_status_idx ON public.term_versions USING btree (document_id, status);

CREATE UNIQUE INDEX term_versions_document_id_version_key ON public.term_versions USING btree (document_id, version);

CREATE UNIQUE INDEX term_versions_one_published_per_document ON public.term_versions USING btree (document_id) WHERE (status = 'PUBLISHED'::public."TermVersionStatus");

CREATE UNIQUE INDEX usuarios_id_tenant_id_key ON public.usuarios USING btree (id, tenant_id);

CREATE UNIQUE INDEX usuarios_tenant_id_email_key ON public.usuarios USING btree (tenant_id, email);

CREATE TRIGGER access5a_acceptance_append_only BEFORE DELETE OR UPDATE ON public.term_acceptances FOR EACH ROW EXECUTE FUNCTION public.access5a_prevent_evidence_change();

CREATE TRIGGER access5a_version_immutable BEFORE DELETE OR UPDATE ON public.term_versions FOR EACH ROW EXECUTE FUNCTION public.access5a_protect_version();

CREATE TRIGGER audit_events_immutable BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.forbid_audit_event_mutation();

CREATE TRIGGER lancamento_revision_before_update BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.bump_lancamento_revision();

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.access_owner_events FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.access_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.areas_negocio FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.categorias FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.centros_custo FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.dados_bancarios FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.dre FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.import_operations FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.layouts_colunas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.legacy_user_access_maps FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.pessoas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.plano_contas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.produto_grupos FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.produto_linhas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.produto_sequencias FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.produto_tipos FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.status_manual_tipos FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.support_grant_events FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.support_grants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tarefa_status FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tenant_contractual_responsibles FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tenant_memberships FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.term_acceptances FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_accepted_by_identity_id_fkey FOREIGN KEY (accepted_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_invited_by_identity_id_fkey FOREIGN KEY (invited_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_profile_id_tenant_id_fkey FOREIGN KEY (profile_id, tenant_id) REFERENCES public.access_profiles(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_revoked_by_identity_id_fkey FOREIGN KEY (revoked_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_owner_events
    ADD CONSTRAINT access_owner_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_identity_id_fkey FOREIGN KEY (actor_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_membership_id_tenant_id_fkey FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_platform_admin_id_actor_identity_id_fkey FOREIGN KEY (platform_admin_id, actor_identity_id) REFERENCES public.platform_admins(id, identity_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_support_grant_id_tenant_id_fkey FOREIGN KEY (support_grant_id, tenant_id) REFERENCES public.support_grants(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas_negocio(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_conta_padrao_id_fkey FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES public.plano_contas(tenant_id, id);

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.dados_bancarios
    ADD CONSTRAINT dados_bancarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_conta_padrao_id_fkey FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES public.plano_contas(tenant_id, id);

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.import_operations
    ADD CONSTRAINT import_operations_actor_identity_id_fkey FOREIGN KEY (actor_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.import_operations
    ADD CONSTRAINT import_operations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.plano_contas(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_tenant_id_cliente_id_fkey FOREIGN KEY (tenant_id, cliente_id) REFERENCES public.clientes(tenant_id, id);

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_legacy_usuario_id_tenant_id_fkey FOREIGN KEY (legacy_usuario_id, tenant_id) REFERENCES public.usuarios(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_membership_id_identity_id_tenant_i_fkey FOREIGN KEY (membership_id, identity_id, tenant_id) REFERENCES public.tenant_memberships(id, identity_id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_platform_admin_id_identity_id_fkey FOREIGN KEY (platform_admin_id, identity_id) REFERENCES public.platform_admins(id, identity_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pai_id_fkey FOREIGN KEY (pai_id) REFERENCES public.plano_contas(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.produto_grupos
    ADD CONSTRAINT produto_grupos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_tenant_id_tipo_id_fkey FOREIGN KEY (tenant_id, tipo_id) REFERENCES public.produto_tipos(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.produto_sequencias
    ADD CONSTRAINT produto_sequencias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_tenant_id_grupo_id_fkey FOREIGN KEY (tenant_id, grupo_id) REFERENCES public.produto_grupos(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_grupo_id_fkey FOREIGN KEY (tenant_id, grupo_id) REFERENCES public.produto_grupos(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_linha_id_fkey FOREIGN KEY (tenant_id, linha_id) REFERENCES public.produto_linhas(tenant_id, id);

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_tipo_id_fkey FOREIGN KEY (tenant_id, tipo_id) REFERENCES public.produto_tipos(tenant_id, id);

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_actor_identity_id_fkey FOREIGN KEY (actor_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_grant_id_tenant_id_fkey FOREIGN KEY (grant_id, tenant_id) REFERENCES public.support_grants(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_approved_by_membership_id_tenant_id_fkey FOREIGN KEY (approved_by_membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_platform_admin_identity_id_fkey FOREIGN KEY (platform_admin_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_revoked_by_identity_id_fkey FOREIGN KEY (revoked_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_operators
    ADD CONSTRAINT support_operators_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tarefa_status
    ADD CONSTRAINT tarefa_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_assigned_by_identity_id_fkey FOREIGN KEY (assigned_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_membership_id_tenant_id_fkey FOREIGN KEY (membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_profile_id_tenant_id_fkey FOREIGN KEY (profile_id, tenant_id) REFERENCES public.access_profiles(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_membership_id_identity_id_tenant_id_fkey FOREIGN KEY (membership_id, identity_id, tenant_id) REFERENCES public.tenant_memberships(id, identity_id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_term_version_id_fkey FOREIGN KEY (term_version_id) REFERENCES public.term_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.term_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_published_by_identity_id_fkey FOREIGN KEY (published_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;

COMMIT;
