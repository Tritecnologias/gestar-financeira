-- ============================================================
-- GESTAR FINANCEIRA – Migration v3
-- Dimensões Financeiras: centros_custo, categorias, dre
-- ============================================================

-- ── Centros de Custo ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS centros_custo (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  nome      TEXT NOT NULL,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_centro_custo_tenant ON centros_custo(tenant_id);

-- ── Categorias (classificação gerencial) ─────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  nome      TEXT NOT NULL,
  tipo      TEXT,  -- RECEITA | DESPESA
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_categoria_tenant ON categorias(tenant_id);

-- ── DRE (Demonstrativo de Resultado) ─────────────────────────
CREATE TABLE IF NOT EXISTS dre (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  nome      TEXT NOT NULL,
  ordem     INT NOT NULL DEFAULT 0,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_dre_tenant ON dre(tenant_id);
