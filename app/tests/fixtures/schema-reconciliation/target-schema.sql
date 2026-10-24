-- Schema-only target snapshot. No HOMO rows, identities or credentials.
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: AccessInviteStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccessInviteStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EXPIRED',
    'REVOKED'
);


--
-- Name: AccessStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccessStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: AuditAccessMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditAccessMode" AS ENUM (
    'MEMBERSHIP',
    'PLATFORM_ADMIN',
    'SUPPORT_GRANT',
    'SYSTEM'
);


--
-- Name: AuditResult; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditResult" AS ENUM (
    'SUCCESS',
    'DENIED',
    'FAILURE'
);


--
-- Name: MembershipRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER'
);


--
-- Name: SupportAccessLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportAccessLevel" AS ENUM (
    'READ_ONLY',
    'OPERATIONAL'
);


--
-- Name: SupportGrantEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportGrantEventType" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'ACTIVATED',
    'USED',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: SupportGrantStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportGrantStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'REJECTED',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: SupportModule; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportModule" AS ENUM (
    'ESTRUTURA_EMPRESA',
    'ESTRUTURA_FINANCEIRA'
);


--
-- Name: TermAudience; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TermAudience" AS ENUM (
    'CONTRATANTE',
    'USUARIO'
);


--
-- Name: TermVersionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TermVersionStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'RETIRED'
);


--
-- Name: access5a_prevent_evidence_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.access5a_prevent_evidence_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Term acceptances are append-only';
END $$;


--
-- Name: access5a_protect_version(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: forbid_audit_event_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_audit_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: access_invites; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: access_owner_events; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: access_profiles; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: areas_negocio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas_negocio (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: auth_identities; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    tipo text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: centros_custo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centros_custo (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    area_id text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: dados_bancarios; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: dre; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dre (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    seq integer NOT NULL,
    data_lanc date NOT NULL,
    data_emissao date,
    data_venc_original date,
    data_venc_plano date,
    data_evento date,
    data_pagamento date,
    descricao text NOT NULL,
    valor numeric(15,2) NOT NULL,
    valor_previsto numeric(15,2),
    banco text,
    tipo text NOT NULL,
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
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: layouts_colunas; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: legacy_user_access_maps; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: pessoas; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: plano_contas; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id text NOT NULL,
    identity_id text NOT NULL,
    status public."AccessStatus" DEFAULT 'ACTIVE'::public."AccessStatus" NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: produto_grupos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto_grupos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: produto_linhas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto_linhas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    tipo_id text NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: produto_sequencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto_sequencias (
    id text NOT NULL,
    tenant_id text NOT NULL,
    escopo character varying(100) NOT NULL,
    ultimo_numero bigint NOT NULL
);


--
-- Name: produto_tipos; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: status_manual_tipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_manual_tipos (
    id text NOT NULL,
    tenant_id text NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    cor text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: support_grant_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_grant_events (
    id text NOT NULL,
    grant_id text NOT NULL,
    tenant_id text NOT NULL,
    type public."SupportGrantEventType" NOT NULL,
    actor_identity_id text,
    detail text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_grants; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: tarefa_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_status (
    id text NOT NULL,
    tenant_id text NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL
);


--
-- Name: tarefas; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: tarefas_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tarefas_seq_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tarefas_seq_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tarefas_seq_seq OWNED BY public.tarefas.seq;


--
-- Name: tenant_contractual_responsibles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_contractual_responsibles (
    tenant_id text NOT NULL,
    membership_id text NOT NULL,
    assigned_by_identity_id text NOT NULL,
    assigned_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: term_acceptances; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: term_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term_documents (
    id text NOT NULL,
    code text NOT NULL,
    audience public."TermAudience" NOT NULL,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: term_versions; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: tarefas seq; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas ALTER COLUMN seq SET DEFAULT nextval('public.tarefas_seq_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: access_invites access_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);


--
-- Name: access_owner_events access_owner_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_owner_events
    ADD CONSTRAINT access_owner_events_pkey PRIMARY KEY (id);


--
-- Name: access_profiles access_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_pkey PRIMARY KEY (id);


--
-- Name: areas_negocio areas_negocio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: auth_identities auth_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: centros_custo centros_custo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: dados_bancarios dados_bancarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dados_bancarios
    ADD CONSTRAINT dados_bancarios_pkey PRIMARY KEY (id);


--
-- Name: dre dre_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: fornecedores fornecedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);


--
-- Name: lancamentos lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pkey PRIMARY KEY (id);


--
-- Name: layouts_colunas layouts_colunas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_pkey PRIMARY KEY (id);


--
-- Name: legacy_user_access_maps legacy_user_access_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_pkey PRIMARY KEY (id);


--
-- Name: pessoas pessoas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_pkey PRIMARY KEY (id);


--
-- Name: plano_contas plano_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: produto_grupos produto_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_grupos
    ADD CONSTRAINT produto_grupos_pkey PRIMARY KEY (id);


--
-- Name: produto_linhas produto_linhas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_pkey PRIMARY KEY (id);


--
-- Name: produto_sequencias produto_sequencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_sequencias
    ADD CONSTRAINT produto_sequencias_pkey PRIMARY KEY (id);


--
-- Name: produto_tipos produto_tipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: status_manual_tipos status_manual_tipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_pkey PRIMARY KEY (id);


--
-- Name: support_grant_events support_grant_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_pkey PRIMARY KEY (id);


--
-- Name: support_grants support_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_pkey PRIMARY KEY (id);


--
-- Name: tarefa_status tarefa_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_status
    ADD CONSTRAINT tarefa_status_pkey PRIMARY KEY (id);


--
-- Name: tarefas tarefas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_pkey PRIMARY KEY (id);


--
-- Name: tenant_contractual_responsibles tenant_contractual_responsibles_membership_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_membership_id_key UNIQUE (membership_id);


--
-- Name: tenant_contractual_responsibles tenant_contractual_responsibles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_memberships tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: term_acceptances term_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_pkey PRIMARY KEY (id);


--
-- Name: term_documents term_documents_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_documents
    ADD CONSTRAINT term_documents_code_key UNIQUE (code);


--
-- Name: term_documents term_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_documents
    ADD CONSTRAINT term_documents_pkey PRIMARY KEY (id);


--
-- Name: term_versions term_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_pkey PRIMARY KEY (id);


--
-- Name: term_versions term_versions_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_storage_key_key UNIQUE (storage_key);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: access_invites_one_pending_email_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_invites_one_pending_email_tenant ON public.access_invites USING btree (tenant_id, email) WHERE (status = 'PENDING'::public."AccessInviteStatus");


--
-- Name: access_invites_tenant_id_email_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_invites_tenant_id_email_status_idx ON public.access_invites USING btree (tenant_id, email, status);


--
-- Name: access_invites_tenant_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_invites_tenant_id_status_created_at_idx ON public.access_invites USING btree (tenant_id, status, created_at DESC);


--
-- Name: access_invites_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_invites_token_hash_key ON public.access_invites USING btree (token_hash);


--
-- Name: access_owner_events_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_owner_events_tenant_id_created_at_idx ON public.access_owner_events USING btree (tenant_id, created_at);


--
-- Name: access_profiles_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_profiles_id_tenant_id_key ON public.access_profiles USING btree (id, tenant_id);


--
-- Name: access_profiles_tenant_id_ativo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_profiles_tenant_id_ativo_idx ON public.access_profiles USING btree (tenant_id, ativo);


--
-- Name: access_profiles_tenant_id_nome_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_profiles_tenant_id_nome_key ON public.access_profiles USING btree (tenant_id, nome);


--
-- Name: areas_negocio_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX areas_negocio_tenant_id_codigo_key ON public.areas_negocio USING btree (tenant_id, codigo);


--
-- Name: audit_events_action_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_action_occurred_at_idx ON public.audit_events USING btree (action, occurred_at DESC);


--
-- Name: audit_events_actor_identity_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_actor_identity_id_occurred_at_idx ON public.audit_events USING btree (actor_identity_id, occurred_at DESC);


--
-- Name: audit_events_support_grant_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_support_grant_id_occurred_at_idx ON public.audit_events USING btree (support_grant_id, occurred_at DESC);


--
-- Name: audit_events_tenant_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_tenant_id_occurred_at_idx ON public.audit_events USING btree (tenant_id, occurred_at DESC);


--
-- Name: auth_identities_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_identities_email_key ON public.auth_identities USING btree (email);


--
-- Name: categorias_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categorias_tenant_id_codigo_key ON public.categorias USING btree (tenant_id, codigo);


--
-- Name: centros_custo_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX centros_custo_tenant_id_codigo_key ON public.centros_custo USING btree (tenant_id, codigo);


--
-- Name: clientes_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_tenant_id_codigo_key ON public.clientes USING btree (tenant_id, codigo);


--
-- Name: clientes_tenant_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clientes_tenant_id_id_key ON public.clientes USING btree (tenant_id, id);


--
-- Name: dre_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dre_tenant_id_codigo_key ON public.dre USING btree (tenant_id, codigo);


--
-- Name: fornecedores_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fornecedores_tenant_id_codigo_key ON public.fornecedores USING btree (tenant_id, codigo);


--
-- Name: idx_area_negocio_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_area_negocio_tenant ON public.areas_negocio USING btree (tenant_id);


--
-- Name: idx_categoria_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categoria_tenant ON public.categorias USING btree (tenant_id);


--
-- Name: idx_centro_custo_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_centro_custo_tenant ON public.centros_custo USING btree (tenant_id);


--
-- Name: idx_clientes_conta_padrao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_conta_padrao ON public.clientes USING btree (tenant_id, conta_padrao_id);


--
-- Name: idx_clientes_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_tenant ON public.clientes USING btree (tenant_id);


--
-- Name: idx_dados_bancarios_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dados_bancarios_tenant ON public.dados_bancarios USING btree (tenant_id);


--
-- Name: idx_dre_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dre_tenant ON public.dre USING btree (tenant_id);


--
-- Name: idx_empresa_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_tenant ON public.empresas USING btree (tenant_id);


--
-- Name: idx_fornecedores_conta_padrao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fornecedores_conta_padrao ON public.fornecedores USING btree (tenant_id, conta_padrao_id);


--
-- Name: idx_fornecedores_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fornecedores_tenant ON public.fornecedores USING btree (tenant_id);


--
-- Name: idx_lancamentos_fornecedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_fornecedor ON public.lancamentos USING btree (fornecedor_id);


--
-- Name: idx_lancamentos_tenant_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tenant_cliente ON public.lancamentos USING btree (tenant_id, cliente_id);


--
-- Name: idx_lancamentos_tenant_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tenant_data ON public.lancamentos USING btree (tenant_id, data_lanc DESC);


--
-- Name: idx_lancamentos_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tenant_status ON public.lancamentos USING btree (tenant_id, status);


--
-- Name: idx_lancamentos_tenant_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tenant_tipo ON public.lancamentos USING btree (tenant_id, tipo);


--
-- Name: idx_lancamentos_venc_plano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_venc_plano ON public.lancamentos USING btree (tenant_id, data_venc_plano);


--
-- Name: idx_layouts_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_layouts_usuario ON public.layouts_colunas USING btree (usuario_id);


--
-- Name: idx_pessoas_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pessoas_tenant ON public.pessoas USING btree (tenant_id);


--
-- Name: idx_plano_contas_tenant_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plano_contas_tenant_categoria ON public.plano_contas USING btree (tenant_id, categoria_id);


--
-- Name: idx_plano_contas_tenant_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plano_contas_tenant_codigo ON public.plano_contas USING btree (tenant_id, codigo);


--
-- Name: idx_produto_grupos_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_grupos_tenant ON public.produto_grupos USING btree (tenant_id);


--
-- Name: idx_produto_linhas_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_linhas_tipo ON public.produto_linhas USING btree (tenant_id, tipo_id);


--
-- Name: idx_produto_tipos_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_tipos_tenant ON public.produto_tipos USING btree (tenant_id);


--
-- Name: idx_produtos_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_grupo ON public.produtos USING btree (tenant_id, grupo_id);


--
-- Name: idx_produtos_linha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_linha ON public.produtos USING btree (tenant_id, linha_id);


--
-- Name: idx_produtos_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_tenant ON public.produtos USING btree (tenant_id);


--
-- Name: idx_produtos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_tipo ON public.produtos USING btree (tenant_id, tipo_id);


--
-- Name: idx_status_manual_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_manual_tenant ON public.status_manual_tipos USING btree (tenant_id);


--
-- Name: idx_tarefa_status_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefa_status_tenant ON public.tarefa_status USING btree (tenant_id);


--
-- Name: idx_tarefas_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarefas_tenant ON public.tarefas USING btree (tenant_id);


--
-- Name: legacy_user_access_maps_identity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legacy_user_access_maps_identity_id_idx ON public.legacy_user_access_maps USING btree (identity_id);


--
-- Name: legacy_user_access_maps_legacy_usuario_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX legacy_user_access_maps_legacy_usuario_id_key ON public.legacy_user_access_maps USING btree (legacy_usuario_id);


--
-- Name: legacy_user_access_maps_legacy_usuario_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX legacy_user_access_maps_legacy_usuario_id_tenant_id_key ON public.legacy_user_access_maps USING btree (legacy_usuario_id, tenant_id);


--
-- Name: legacy_user_access_maps_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX legacy_user_access_maps_tenant_id_idx ON public.legacy_user_access_maps USING btree (tenant_id);


--
-- Name: pessoas_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pessoas_tenant_id_codigo_key ON public.pessoas USING btree (tenant_id, codigo);


--
-- Name: plano_contas_tenant_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plano_contas_tenant_id_id_key ON public.plano_contas USING btree (tenant_id, id);


--
-- Name: platform_admins_id_identity_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_admins_id_identity_id_key ON public.platform_admins USING btree (id, identity_id);


--
-- Name: platform_admins_identity_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_admins_identity_id_key ON public.platform_admins USING btree (identity_id);


--
-- Name: produto_grupos_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_grupos_tenant_id_codigo_key ON public.produto_grupos USING btree (tenant_id, codigo);


--
-- Name: produto_grupos_tenant_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_grupos_tenant_id_id_key ON public.produto_grupos USING btree (tenant_id, id);


--
-- Name: produto_linhas_tenant_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_linhas_tenant_id_id_key ON public.produto_linhas USING btree (tenant_id, id);


--
-- Name: produto_linhas_tenant_id_tipo_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_linhas_tenant_id_tipo_id_codigo_key ON public.produto_linhas USING btree (tenant_id, tipo_id, codigo);


--
-- Name: produto_sequencias_tenant_id_escopo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_sequencias_tenant_id_escopo_key ON public.produto_sequencias USING btree (tenant_id, escopo);


--
-- Name: produto_tipos_tenant_id_grupo_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo, codigo);


--
-- Name: produto_tipos_tenant_id_grupo_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_id_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo_id, codigo);


--
-- Name: produto_tipos_tenant_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produto_tipos_tenant_id_id_key ON public.produto_tipos USING btree (tenant_id, id);


--
-- Name: produtos_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produtos_tenant_id_codigo_key ON public.produtos USING btree (tenant_id, codigo);


--
-- Name: status_manual_tipos_tenant_id_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX status_manual_tipos_tenant_id_codigo_key ON public.status_manual_tipos USING btree (tenant_id, codigo);


--
-- Name: support_grant_events_grant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_grant_events_grant_id_created_at_idx ON public.support_grant_events USING btree (grant_id, created_at);


--
-- Name: support_grant_events_tenant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_grant_events_tenant_id_created_at_idx ON public.support_grant_events USING btree (tenant_id, created_at);


--
-- Name: support_grants_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX support_grants_id_tenant_id_key ON public.support_grants USING btree (id, tenant_id);


--
-- Name: support_grants_platform_admin_identity_id_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_grants_platform_admin_identity_id_status_expires_at_idx ON public.support_grants USING btree (platform_admin_identity_id, status, expires_at);


--
-- Name: support_grants_tenant_id_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_grants_tenant_id_status_expires_at_idx ON public.support_grants USING btree (tenant_id, status, expires_at);


--
-- Name: tenant_contractual_responsibles_membership_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_contractual_responsibles_membership_id_tenant_id_key ON public.tenant_contractual_responsibles USING btree (membership_id, tenant_id);


--
-- Name: tenant_memberships_id_identity_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_memberships_id_identity_id_tenant_id_key ON public.tenant_memberships USING btree (id, identity_id, tenant_id);


--
-- Name: tenant_memberships_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_memberships_id_tenant_id_key ON public.tenant_memberships USING btree (id, tenant_id);


--
-- Name: tenant_memberships_identity_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_memberships_identity_id_tenant_id_key ON public.tenant_memberships USING btree (identity_id, tenant_id);


--
-- Name: tenant_memberships_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_memberships_tenant_id_status_idx ON public.tenant_memberships USING btree (tenant_id, status);


--
-- Name: tenants_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_email_key ON public.tenants USING btree (email);


--
-- Name: tenants_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);


--
-- Name: term_acceptances_identity_id_term_version_id_scope_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX term_acceptances_identity_id_term_version_id_scope_key_key ON public.term_acceptances USING btree (identity_id, term_version_id, scope_key);


--
-- Name: term_acceptances_tenant_id_accepted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX term_acceptances_tenant_id_accepted_at_idx ON public.term_acceptances USING btree (tenant_id, accepted_at);


--
-- Name: term_acceptances_term_version_id_accepted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX term_acceptances_term_version_id_accepted_at_idx ON public.term_acceptances USING btree (term_version_id, accepted_at);


--
-- Name: term_versions_document_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX term_versions_document_id_status_idx ON public.term_versions USING btree (document_id, status);


--
-- Name: term_versions_document_id_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX term_versions_document_id_version_key ON public.term_versions USING btree (document_id, version);


--
-- Name: term_versions_one_published_per_document; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX term_versions_one_published_per_document ON public.term_versions USING btree (document_id) WHERE (status = 'PUBLISHED'::public."TermVersionStatus");


--
-- Name: usuarios_id_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_id_tenant_id_key ON public.usuarios USING btree (id, tenant_id);


--
-- Name: usuarios_tenant_id_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_tenant_id_email_key ON public.usuarios USING btree (tenant_id, email);


--
-- Name: term_acceptances access5a_acceptance_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access5a_acceptance_append_only BEFORE DELETE OR UPDATE ON public.term_acceptances FOR EACH ROW EXECUTE FUNCTION public.access5a_prevent_evidence_change();


--
-- Name: term_versions access5a_version_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access5a_version_immutable BEFORE DELETE OR UPDATE ON public.term_versions FOR EACH ROW EXECUTE FUNCTION public.access5a_protect_version();


--
-- Name: audit_events audit_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_immutable BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.forbid_audit_event_mutation();


--
-- Name: access_invites access_invites_accepted_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_accepted_by_identity_id_fkey FOREIGN KEY (accepted_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_invites access_invites_invited_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_invited_by_identity_id_fkey FOREIGN KEY (invited_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_invites access_invites_profile_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_profile_id_tenant_id_fkey FOREIGN KEY (profile_id, tenant_id) REFERENCES public.access_profiles(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_invites access_invites_revoked_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_revoked_by_identity_id_fkey FOREIGN KEY (revoked_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_invites access_invites_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_owner_events access_owner_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_owner_events
    ADD CONSTRAINT access_owner_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: access_profiles access_profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_profiles
    ADD CONSTRAINT access_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: areas_negocio areas_negocio_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_events audit_events_actor_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_identity_id_fkey FOREIGN KEY (actor_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_events audit_events_actor_membership_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_membership_id_tenant_id_fkey FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_events audit_events_platform_admin_id_actor_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_platform_admin_id_actor_identity_id_fkey FOREIGN KEY (platform_admin_id, actor_identity_id) REFERENCES public.platform_admins(id, identity_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_events audit_events_support_grant_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_support_grant_id_tenant_id_fkey FOREIGN KEY (support_grant_id, tenant_id) REFERENCES public.support_grants(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_events audit_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: categorias categorias_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: centros_custo centros_custo_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas_negocio(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: centros_custo centros_custo_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: clientes clientes_tenant_id_conta_padrao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_conta_padrao_id_fkey FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES public.plano_contas(tenant_id, id);


--
-- Name: clientes clientes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dados_bancarios dados_bancarios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dados_bancarios
    ADD CONSTRAINT dados_bancarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dre dre_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: empresas empresas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fornecedores fornecedores_tenant_id_conta_padrao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_conta_padrao_id_fkey FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES public.plano_contas(tenant_id, id);


--
-- Name: fornecedores fornecedores_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.plano_contas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_tenant_id_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_tenant_id_cliente_id_fkey FOREIGN KEY (tenant_id, cliente_id) REFERENCES public.clientes(tenant_id, id);


--
-- Name: lancamentos lancamentos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: layouts_colunas layouts_colunas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: legacy_user_access_maps legacy_user_access_maps_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: legacy_user_access_maps legacy_user_access_maps_legacy_usuario_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_legacy_usuario_id_tenant_id_fkey FOREIGN KEY (legacy_usuario_id, tenant_id) REFERENCES public.usuarios(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: legacy_user_access_maps legacy_user_access_maps_membership_id_identity_id_tenant_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_membership_id_identity_id_tenant_i_fkey FOREIGN KEY (membership_id, identity_id, tenant_id) REFERENCES public.tenant_memberships(id, identity_id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: legacy_user_access_maps legacy_user_access_maps_platform_admin_id_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_user_access_maps
    ADD CONSTRAINT legacy_user_access_maps_platform_admin_id_identity_id_fkey FOREIGN KEY (platform_admin_id, identity_id) REFERENCES public.platform_admins(id, identity_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pessoas pessoas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: plano_contas plano_contas_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: plano_contas plano_contas_pai_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pai_id_fkey FOREIGN KEY (pai_id) REFERENCES public.plano_contas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: plano_contas plano_contas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: platform_admins platform_admins_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: produto_grupos produto_grupos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_grupos
    ADD CONSTRAINT produto_grupos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: produto_linhas produto_linhas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: produto_linhas produto_linhas_tenant_id_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_linhas
    ADD CONSTRAINT produto_linhas_tenant_id_tipo_id_fkey FOREIGN KEY (tenant_id, tipo_id) REFERENCES public.produto_tipos(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: produto_sequencias produto_sequencias_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_sequencias
    ADD CONSTRAINT produto_sequencias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: produto_tipos produto_tipos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: produto_tipos produto_tipos_tenant_id_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_tipos
    ADD CONSTRAINT produto_tipos_tenant_id_grupo_id_fkey FOREIGN KEY (tenant_id, grupo_id) REFERENCES public.produto_grupos(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: produtos produtos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: produtos produtos_tenant_id_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_grupo_id_fkey FOREIGN KEY (tenant_id, grupo_id) REFERENCES public.produto_grupos(tenant_id, id) ON DELETE RESTRICT;


--
-- Name: produtos produtos_tenant_id_linha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_linha_id_fkey FOREIGN KEY (tenant_id, linha_id) REFERENCES public.produto_linhas(tenant_id, id);


--
-- Name: produtos produtos_tenant_id_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_tipo_id_fkey FOREIGN KEY (tenant_id, tipo_id) REFERENCES public.produto_tipos(tenant_id, id);


--
-- Name: status_manual_tipos status_manual_tipos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_grant_events support_grant_events_actor_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_actor_identity_id_fkey FOREIGN KEY (actor_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grant_events support_grant_events_grant_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_grant_id_tenant_id_fkey FOREIGN KEY (grant_id, tenant_id) REFERENCES public.support_grants(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grant_events support_grant_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grant_events
    ADD CONSTRAINT support_grant_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grants support_grants_approved_by_membership_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_approved_by_membership_id_tenant_id_fkey FOREIGN KEY (approved_by_membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grants support_grants_platform_admin_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_platform_admin_identity_id_fkey FOREIGN KEY (platform_admin_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grants support_grants_revoked_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_revoked_by_identity_id_fkey FOREIGN KEY (revoked_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_grants support_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_grants
    ADD CONSTRAINT support_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tarefa_status tarefa_status_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_status
    ADD CONSTRAINT tarefa_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tarefas tarefas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tenant_contractual_responsibles tenant_contractual_responsibles_assigned_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_assigned_by_identity_id_fkey FOREIGN KEY (assigned_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenant_contractual_responsibles tenant_contractual_responsibles_membership_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_membership_id_tenant_id_fkey FOREIGN KEY (membership_id, tenant_id) REFERENCES public.tenant_memberships(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenant_contractual_responsibles tenant_contractual_responsibles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_contractual_responsibles
    ADD CONSTRAINT tenant_contractual_responsibles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenant_memberships tenant_memberships_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenant_memberships tenant_memberships_profile_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_profile_id_tenant_id_fkey FOREIGN KEY (profile_id, tenant_id) REFERENCES public.access_profiles(id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenant_memberships tenant_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_acceptances term_acceptances_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_acceptances term_acceptances_membership_id_identity_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_membership_id_identity_id_tenant_id_fkey FOREIGN KEY (membership_id, identity_id, tenant_id) REFERENCES public.tenant_memberships(id, identity_id, tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_acceptances term_acceptances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_acceptances term_acceptances_term_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_acceptances
    ADD CONSTRAINT term_acceptances_term_version_id_fkey FOREIGN KEY (term_version_id) REFERENCES public.term_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_versions term_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.term_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: term_versions term_versions_published_by_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_versions
    ADD CONSTRAINT term_versions_published_by_identity_id_fkey FOREIGN KEY (published_by_identity_id) REFERENCES public.auth_identities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuarios usuarios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

SET search_path=public,pg_catalog;

-- Synthetic ledger metadata: schema-only fixture of an already migrated target.
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000001','ab4c8a4084dc6c6a15ced50fca5e98593a4207c634831a6871277e89fb2197c4','0_legacy_baseline','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000002','489810946c6c29ea6193f66458d643269d7ab90c8a952ecd6b76a8665cb12d2c','20261005_access4b_owner_events','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000003','4bca54cfc0c4005eafb5a5ac1c07df9c87efcd7c94baa73f7a1fa32da3744132','20261005_access4b_permissions','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000004','2f3c0adf3bc36b768a7a6a0da1e30c4f872f65ff4347f057dcf77ede3a25aaa7','20261005_access5a_versioned_terms','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000005','57d4ab16fbfd6d6105a572ad054750ffd70948c0377cf6c88e8dd2cd68ab9b25','20261005_access5a_z_integrity','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000006','8c4c4decb6bf2ceef501f22eb427e5459e32f4c3f92265481ac0211477e4525a','20261005_access5b_support_grants','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000007','82eca9c6a03cce6668b1fc5c3d550d8d5f22b8e309fc6a3e5f5ffe652db08abe','20261005_access5c_audit_events','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000008','5f6f45904b43a3fe9986136cf01540537063c038c5fb76129096112ca87902d5','20261005_access_identity_membership','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000009','46ad7fec6f44573effe0f656ee716e05247bdef2a548a4def128c44bfa1ea0f7','20261005_access_profiles','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000010','a8a5387549c0895ca3e692bf4dc2b3053acccf583f7612f78c9b32a9bf79427f','20261005_access_profiles_config_compat','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000011','48353336eacca5d3e3597c1167245d08e445adc61ee7ab1e961bb6632506bd46','20261005_access_profiles_member_compat','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('00000000-0000-4000-8000-000000000012','5d66dcc1a8f6e8024befa768d2c0de4b52eae52808a7880094316f463487bcb7','20261007_access_invitations','2026-10-23T00:00:00Z','2026-10-23T00:00:01Z',1);
