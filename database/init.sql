-- ============================================================
-- GESTAR FINANCEIRA – Schema Inicial (MVP v1)
-- Banco: PostgreSQL 16
-- Multi-tenancy: isolamento por tenant_id em todas as tabelas
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (empresas assinantes)
-- ============================================================
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  plano       TEXT NOT NULL DEFAULT 'trial'
                CHECK (plano IN ('trial', 'mensal', 'anual')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. USUÁRIOS
-- ============================================================
CREATE TABLE usuarios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,
  papel       TEXT NOT NULL DEFAULT 'membro'
                CHECK (papel IN ('admin_global', 'admin', 'membro')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- ============================================================
-- 3. PLANO DE CONTAS
-- ============================================================
CREATE TABLE plano_contas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo      TEXT,
  descricao   TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA')),
  pai_id      UUID REFERENCES plano_contas(id),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. LANÇAMENTOS (tabela central do Fluxo de Caixa)
-- ============================================================
CREATE TABLE lancamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_lanc       DATE NOT NULL,
  descricao       TEXT NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  tipo            TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  status          TEXT NOT NULL DEFAULT 'realizado'
                    CHECK (status IN ('realizado', 'previsto', 'cancelado')),
  conta_id        UUID REFERENCES plano_contas(id),
  fornecedor      TEXT,
  centro_custo    TEXT,
  referencia      TEXT,                           -- nº NF, contrato, boleto
  metadados       JSONB NOT NULL DEFAULT '{}',   -- colunas dinâmicas por tenant
  importado       BOOLEAN NOT NULL DEFAULT false,
  importado_em    TIMESTAMPTZ,
  criado_por      UUID REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. LOG DE IMPORTAÇÕES
-- ============================================================
CREATE TABLE importacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  usuario_id      UUID REFERENCES usuarios(id),
  nome_arquivo    TEXT NOT NULL,
  total_linhas    INT NOT NULL DEFAULT 0,
  linhas_ok       INT NOT NULL DEFAULT 0,
  linhas_erro     INT NOT NULL DEFAULT 0,
  erros           JSONB,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX idx_lancamentos_tenant_data ON lancamentos(tenant_id, data_lanc DESC);
CREATE INDEX idx_lancamentos_tenant_tipo ON lancamentos(tenant_id, tipo);
CREATE INDEX idx_lancamentos_tenant_status ON lancamentos(tenant_id, status);
CREATE INDEX idx_lancamentos_conta ON lancamentos(conta_id);
CREATE INDEX idx_plano_contas_tenant ON plano_contas(tenant_id);
CREATE INDEX idx_usuarios_tenant ON usuarios(tenant_id);

-- ============================================================
-- VIEW PARA POWER BI (dados desnormalizados, leitura otimizada)
-- ============================================================
CREATE VIEW vw_powerbi_lancamentos AS
SELECT
  l.id,
  t.nome                          AS tenant_nome,
  t.slug                          AS tenant_slug,
  l.data_lanc,
  EXTRACT(YEAR FROM l.data_lanc)  AS ano,
  EXTRACT(MONTH FROM l.data_lanc) AS mes,
  TO_CHAR(l.data_lanc, 'YYYY-MM') AS ano_mes,
  l.descricao,
  l.tipo,
  l.status,
  l.valor,
  CASE WHEN l.tipo = 'ENTRADA' THEN l.valor ELSE 0 END  AS entrada,
  CASE WHEN l.tipo = 'SAIDA'   THEN l.valor ELSE 0 END  AS saida,
  pc.codigo                       AS conta_codigo,
  pc.descricao                    AS conta_descricao,
  pc.tipo                         AS conta_tipo,
  l.fornecedor,
  l.centro_custo,
  l.referencia,
  l.metadados,
  l.importado,
  l.criado_em
FROM lancamentos l
JOIN tenants t ON t.id = l.tenant_id
LEFT JOIN plano_contas pc ON pc.id = l.conta_id
WHERE l.status != 'cancelado';

-- ============================================================
-- ROLE READ-ONLY PARA POWER BI
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
    CREATE ROLE powerbi_reader LOGIN PASSWORD 'powerbi_readonly_2024';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE gestar_financeira TO powerbi_reader;
GRANT USAGE ON SCHEMA public TO powerbi_reader;
GRANT SELECT ON vw_powerbi_lancamentos TO powerbi_reader;

-- ============================================================
-- TRIGGER: atualizar atualizado_em automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lancamentos_updated
  BEFORE UPDATE ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

CREATE TRIGGER trg_tenants_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
