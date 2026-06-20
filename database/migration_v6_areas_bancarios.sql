-- ============================================================
-- GESTAR FINANCEIRA – Migration v6
-- Áreas de Negócio, Dados Bancários, Centro Custo com área
-- ============================================================

-- ── Áreas de Negócio ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas_negocio (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  nome      TEXT NOT NULL,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_area_negocio_tenant ON areas_negocio(tenant_id);

-- ── Dados Bancários ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dados_bancarios (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  banco     TEXT NOT NULL,
  agencia   TEXT,
  conta     TEXT,
  tipo      TEXT,
  titular   TEXT,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dados_bancarios_tenant ON dados_bancarios(tenant_id);

-- ── Centro de Custo: adicionar campo area_id ─────────────────
ALTER TABLE centros_custo ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas_negocio(id);
