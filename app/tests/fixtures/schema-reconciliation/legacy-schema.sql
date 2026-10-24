-- Schema-only snapshot 2026-10-23. No production rows. PostgreSQL 16.
CREATE EXTENSION "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

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
-- Name: protect_lancamento_seq(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_lancamento_seq() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.seq IS DISTINCT FROM OLD.seq THEN
    RAISE EXCEPTION 'O campo SEQ é imutável e não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_atualizado_em(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_atualizado_em() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
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
-- Name: areas_negocio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas_negocio (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    tipo text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: centros_custo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centros_custo (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    area_id uuid
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo character varying(20) NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    documento text,
    endereco text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dados_bancarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dados_bancarios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    banco text NOT NULL,
    agencia text,
    conta text,
    tipo text,
    titular text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dre; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dre (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
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
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fornecedores (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo character varying(20) NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: importacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.importacoes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    usuario_id uuid,
    nome_arquivo text NOT NULL,
    total_linhas integer DEFAULT 0 NOT NULL,
    linhas_ok integer DEFAULT 0 NOT NULL,
    linhas_erro integer DEFAULT 0 NOT NULL,
    erros jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    data_lanc date NOT NULL,
    descricao text NOT NULL,
    valor numeric(15,2) NOT NULL,
    tipo text NOT NULL,
    status text DEFAULT 'realizado'::text NOT NULL,
    conta_id uuid,
    fornecedor text,
    centro_custo text,
    referencia text,
    metadados jsonb DEFAULT '{}'::jsonb NOT NULL,
    importado boolean DEFAULT false NOT NULL,
    importado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    seq integer NOT NULL,
    data_emissao date,
    data_venc_original date,
    data_venc_plano date,
    data_evento date,
    data_pagamento date,
    status_manual text,
    status_extrato text,
    valor_previsto numeric(15,2),
    banco text,
    fornecedor_id uuid,
    fantasia_padrao text,
    categoria text,
    dre text,
    cont text,
    anotacao text,
    CONSTRAINT lancamentos_status_check CHECK ((status = ANY (ARRAY['realizado'::text, 'previsto'::text, 'cancelado'::text]))),
    CONSTRAINT lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['ENTRADA'::text, 'SAIDA'::text]))),
    CONSTRAINT lancamentos_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: layouts_colunas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.layouts_colunas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    nome text NOT NULL,
    colunas jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pessoas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pessoas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
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
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plano_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plano_contas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text,
    descricao text NOT NULL,
    tipo text NOT NULL,
    pai_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plano_contas_tipo_check CHECK ((tipo = ANY (ARRAY['RECEITA'::text, 'DESPESA'::text, 'TRANSFERENCIA'::text])))
);


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo character varying(30) NOT NULL,
    nome text NOT NULL,
    tipo text,
    unidade text,
    preco_venda numeric(15,2),
    preco_custo numeric(15,2),
    categoria text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: status_manual_tipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_manual_tipos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    cor text,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: tarefa_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefa_status (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    nome text NOT NULL,
    cor text DEFAULT '#3b82f6'::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL
);


--
-- Name: tarefas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarefas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    seq integer NOT NULL,
    nome text NOT NULL,
    status text DEFAULT 'A Fazer!'::text NOT NULL,
    status_cor text,
    colunas jsonb DEFAULT '[]'::jsonb NOT NULL,
    linhas jsonb DEFAULT '[]'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    email text NOT NULL,
    plano text DEFAULT 'trial'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    titulo_tabela_status text DEFAULT 'VALOR PREVISTO'::text,
    logo_url text,
    CONSTRAINT tenants_plano_check CHECK ((plano = ANY (ARRAY['trial'::text, 'mensal'::text, 'anual'::text])))
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    senha_hash text NOT NULL,
    papel text DEFAULT 'membro'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usuarios_papel_check CHECK ((papel = ANY (ARRAY['admin_global'::text, 'admin'::text, 'membro'::text])))
);


--
-- Name: vw_powerbi_lancamentos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_powerbi_lancamentos AS
 SELECT l.id,
    t.nome AS tenant_nome,
    t.slug AS tenant_slug,
    l.data_lanc,
    EXTRACT(year FROM l.data_lanc) AS ano,
    EXTRACT(month FROM l.data_lanc) AS mes,
    to_char((l.data_lanc)::timestamp with time zone, 'YYYY-MM'::text) AS ano_mes,
    l.descricao,
    l.tipo,
    l.status,
    l.valor,
        CASE
            WHEN (l.tipo = 'ENTRADA'::text) THEN l.valor
            ELSE (0)::numeric
        END AS entrada,
        CASE
            WHEN (l.tipo = 'SAIDA'::text) THEN l.valor
            ELSE (0)::numeric
        END AS saida,
    pc.codigo AS conta_codigo,
    pc.descricao AS conta_descricao,
    pc.tipo AS conta_tipo,
    l.fornecedor,
    l.centro_custo,
    l.referencia,
    l.metadados,
    l.importado,
    l.criado_em
   FROM ((public.lancamentos l
     JOIN public.tenants t ON ((t.id = l.tenant_id)))
     LEFT JOIN public.plano_contas pc ON ((pc.id = l.conta_id)))
  WHERE (l.status <> 'cancelado'::text);


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
-- Name: areas_negocio areas_negocio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_pkey PRIMARY KEY (id);


--
-- Name: areas_negocio areas_negocio_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: centros_custo centros_custo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_pkey PRIMARY KEY (id);


--
-- Name: centros_custo centros_custo_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


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
-- Name: dre dre_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


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
-- Name: fornecedores fornecedores_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: importacoes importacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes
    ADD CONSTRAINT importacoes_pkey PRIMARY KEY (id);


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
-- Name: pessoas pessoas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_pkey PRIMARY KEY (id);


--
-- Name: pessoas pessoas_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: plano_contas plano_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


--
-- Name: status_manual_tipos status_manual_tipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_pkey PRIMARY KEY (id);


--
-- Name: status_manual_tipos status_manual_tipos_tenant_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_tenant_id_codigo_key UNIQUE (tenant_id, codigo);


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
-- Name: tenants tenants_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_email_key UNIQUE (email);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_tenant_id_email_key UNIQUE (tenant_id, email);


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
-- Name: idx_fornecedores_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fornecedores_tenant ON public.fornecedores USING btree (tenant_id);


--
-- Name: idx_lancamentos_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_conta ON public.lancamentos USING btree (conta_id);


--
-- Name: idx_lancamentos_fornecedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_fornecedor ON public.lancamentos USING btree (fornecedor_id);


--
-- Name: idx_lancamentos_status_man; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_status_man ON public.lancamentos USING btree (tenant_id, status_manual);


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
-- Name: idx_layouts_default_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_layouts_default_unico ON public.layouts_colunas USING btree (usuario_id) WHERE (is_default = true);


--
-- Name: idx_layouts_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_layouts_usuario ON public.layouts_colunas USING btree (usuario_id);


--
-- Name: idx_pessoas_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pessoas_tenant ON public.pessoas USING btree (tenant_id);


--
-- Name: idx_plano_contas_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plano_contas_tenant ON public.plano_contas USING btree (tenant_id);


--
-- Name: idx_produtos_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_tenant ON public.produtos USING btree (tenant_id);


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
-- Name: idx_usuarios_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_tenant ON public.usuarios USING btree (tenant_id);


--
-- Name: lancamentos trg_lancamentos_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();


--
-- Name: lancamentos trg_protect_seq; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_seq BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.protect_lancamento_seq();


--
-- Name: tenants trg_tenants_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_atualizado_em();


--
-- Name: areas_negocio areas_negocio_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas_negocio
    ADD CONSTRAINT areas_negocio_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: categorias categorias_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: centros_custo centros_custo_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas_negocio(id);


--
-- Name: centros_custo centros_custo_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: dados_bancarios dados_bancarios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dados_bancarios
    ADD CONSTRAINT dados_bancarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: dre dre_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dre
    ADD CONSTRAINT dre_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: empresas empresas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: fornecedores fornecedores_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: importacoes importacoes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes
    ADD CONSTRAINT importacoes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: importacoes importacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.importacoes
    ADD CONSTRAINT importacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: lancamentos lancamentos_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.plano_contas(id);


--
-- Name: lancamentos lancamentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.usuarios(id);


--
-- Name: lancamentos lancamentos_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: lancamentos lancamentos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: layouts_colunas layouts_colunas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: layouts_colunas layouts_colunas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layouts_colunas
    ADD CONSTRAINT layouts_colunas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: pessoas pessoas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoas
    ADD CONSTRAINT pessoas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: plano_contas plano_contas_pai_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pai_id_fkey FOREIGN KEY (pai_id) REFERENCES public.plano_contas(id);


--
-- Name: plano_contas plano_contas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: produtos produtos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: status_manual_tipos status_manual_tipos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_manual_tipos
    ADD CONSTRAINT status_manual_tipos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tarefa_status tarefa_status_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefa_status
    ADD CONSTRAINT tarefa_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tarefas tarefas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarefas
    ADD CONSTRAINT tarefas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

-- Existing read-only Power BI grant from the audited catalog; role supplied by lab.
GRANT SELECT ON public.vw_powerbi_lancamentos TO powerbi_reader;
