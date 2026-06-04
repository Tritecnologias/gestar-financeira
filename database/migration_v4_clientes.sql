-- ============================================================
-- GESTAR FINANCEIRA – Migration v4
-- Dimensões Cadastrais: tabela clientes
-- ============================================================

CREATE TABLE IF NOT EXISTS clientes (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    VARCHAR(20) NOT NULL,
  nome      TEXT NOT NULL,
  email     TEXT,
  telefone  TEXT,
  documento TEXT,
  endereco  TEXT,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON clientes(tenant_id);
