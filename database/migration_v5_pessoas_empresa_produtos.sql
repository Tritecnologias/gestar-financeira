-- ============================================================
-- GESTAR FINANCEIRA – Migration v5
-- Dimensões: pessoas, empresas, produtos
-- ============================================================

-- ── Pessoas (colaboradores/equipe) ───────────────────────────
CREATE TABLE IF NOT EXISTS pessoas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo       VARCHAR(20) NOT NULL,
  nome         TEXT NOT NULL,
  cargo        TEXT,
  departamento TEXT,
  email        TEXT,
  telefone     TEXT,
  documento    TEXT,
  data_admissao DATE,
  salario      NUMERIC(15, 2),
  ativo        BOOLEAN NOT NULL DEFAULT true,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_pessoas_tenant ON pessoas(tenant_id);

-- ── Empresas (dados da organização) ──────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj          TEXT,
  insc_estadual TEXT,
  telefone      TEXT,
  email         TEXT,
  endereco      TEXT,
  cidade        TEXT,
  estado        TEXT,
  cep           TEXT,
  segmento      TEXT,
  porte         TEXT,
  data_fundacao DATE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empresa_tenant ON empresas(tenant_id);

-- ── Produtos/Serviços ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo      VARCHAR(30) NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT,  -- PRODUTO | SERVICO
  unidade     TEXT,
  preco_venda NUMERIC(15, 2),
  preco_custo NUMERIC(15, 2),
  categoria   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON produtos(tenant_id);
