-- ============================================================
-- GESTAR FINANCEIRA – Migration v2
-- Expansão: Lançamentos 32 colunas
-- Tabelas novas: fornecedores, status_manual_tipos, layouts_colunas
-- ============================================================

-- ============================================================
-- A. TABELA DE APOIO: FORNECEDORES (Fantasia Padrão n4)
-- ============================================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo      VARCHAR(20) NOT NULL,
  nome        TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant ON fornecedores(tenant_id);

-- ============================================================
-- B. TABELA DE APOIO: STATUS MANUAL (tipos de status definidos pelo usuário)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_manual_tipos (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,
  nome      TEXT NOT NULL,
  cor       TEXT,              -- hex color ex: #22c55e
  ordem     INT NOT NULL DEFAULT 0,
  ativo     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_status_manual_tenant ON status_manual_tipos(tenant_id);

-- ============================================================
-- C. TABELA DE LAYOUTS DE COLUNAS (por usuário)
-- ============================================================
CREATE TABLE IF NOT EXISTS layouts_colunas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  colunas     JSONB NOT NULL,       -- [{key, visible, order, width}]
  is_default  BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layouts_usuario ON layouts_colunas(usuario_id);

-- Garante apenas 1 layout default por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_layouts_default_unico
  ON layouts_colunas(usuario_id)
  WHERE is_default = true;

-- ============================================================
-- D. ALTER TABLE lancamentos – novos campos
-- ============================================================

-- D.1 SEQ: número de registro imutável e auto-incremento
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS seq SERIAL;

-- D.2 Datas adicionais
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS data_emissao        DATE,
  ADD COLUMN IF NOT EXISTS data_venc_original  DATE,
  ADD COLUMN IF NOT EXISTS data_venc_plano     DATE,
  ADD COLUMN IF NOT EXISTS data_evento         DATE,
  ADD COLUMN IF NOT EXISTS data_pagamento      DATE;

-- D.3 Status adicionais
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS status_manual   TEXT,   -- código de status_manual_tipos
  ADD COLUMN IF NOT EXISTS status_extrato  TEXT;   -- A / B / C (extrato bancário)

-- D.4 Financeiro
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS valor_previsto  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS banco           TEXT;

-- D.5 Vínculos com tabelas de apoio
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS fornecedor_id   UUID REFERENCES fornecedores(id);

-- D.6 Campos de classificação contábil/gerencial
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS fantasia_padrao TEXT,   -- cache do display do fornecedor
  ADD COLUMN IF NOT EXISTS categoria       TEXT,   -- código categoria n5 (plano_contas gerencial)
  ADD COLUMN IF NOT EXISTS dre             TEXT,   -- código DRE
  ADD COLUMN IF NOT EXISTS cont            TEXT,   -- conta contábil
  ADD COLUMN IF NOT EXISTS anotacao        TEXT;   -- anotações livres

-- ============================================================
-- E. TRIGGER: proteger SEQ de atualizações
-- ============================================================
CREATE OR REPLACE FUNCTION protect_lancamento_seq()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.seq IS DISTINCT FROM OLD.seq THEN
    RAISE EXCEPTION 'O campo SEQ é imutável e não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_seq ON lancamentos;
CREATE TRIGGER trg_protect_seq
  BEFORE UPDATE ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION protect_lancamento_seq();

-- ============================================================
-- F. ÍNDICES DE PERFORMANCE (novos)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lancamentos_fornecedor  ON lancamentos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_venc_plano  ON lancamentos(tenant_id, data_venc_plano);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status_man  ON lancamentos(tenant_id, status_manual);

-- ============================================================
-- G. SEEDS: status_manual_tipos padrão para tenants existentes
-- ============================================================
INSERT INTO status_manual_tipos (tenant_id, codigo, nome, cor, ordem)
SELECT
  id AS tenant_id,
  unnest(ARRAY['PAGO','PENDENTE','CANCELADO','NEGOCIANDO','PARCELADO','PREVISTO']) AS codigo,
  unnest(ARRAY['Pago','Pendente','Cancelado','Negociando','Parcelado','Previsto']) AS nome,
  unnest(ARRAY['#22c55e','#f59e0b','#ef4444','#8b5cf6','#3b82f6','#94a3b8'])      AS cor,
  unnest(ARRAY[1,2,3,4,5,6])                                                      AS ordem
FROM tenants
ON CONFLICT (tenant_id, codigo) DO NOTHING;

-- ============================================================
-- H. ATUALIZAR VIEW POWER BI com novos campos
-- ============================================================
CREATE OR REPLACE VIEW vw_powerbi_lancamentos AS
SELECT
  l.id,
  l.seq,
  t.nome                               AS tenant_nome,
  t.slug                               AS tenant_slug,
  l.data_lanc,
  l.data_emissao,
  l.data_venc_original,
  l.data_venc_plano,
  l.data_pagamento,
  EXTRACT(YEAR  FROM l.data_lanc)      AS ano,
  EXTRACT(MONTH FROM l.data_lanc)      AS mes,
  TO_CHAR(l.data_lanc,  'YYYY-MM')    AS ano_mes,
  TO_CHAR(l.data_emissao, 'YY_MM')    AS emissao_a_m,
  TO_CHAR(l.data_venc_plano, 'YY_MM') AS venc_a_m,
  EXTRACT(YEAR  FROM l.data_venc_plano) AS venc_a,
  EXTRACT(MONTH FROM l.data_venc_plano) AS venc_m,
  EXTRACT(DAY   FROM l.data_venc_plano) AS venc_d,
  -- Dias de atraso calculados
  CASE WHEN l.data_pagamento IS NULL THEN
    (CURRENT_DATE - l.data_venc_original)::int ELSE 0 END  AS dias_atraso_original,
  CASE WHEN l.data_pagamento IS NULL THEN
    (CURRENT_DATE - l.data_venc_plano)::int ELSE 0 END     AS dias_atraso_plano,
  -- Range de atraso
  CASE
    WHEN l.data_pagamento IS NOT NULL                            THEN 'Pago'
    WHEN l.data_venc_plano IS NULL                               THEN 'Sem venc.'
    WHEN (CURRENT_DATE - l.data_venc_plano) <= 0                THEN 'No prazo'
    WHEN (CURRENT_DATE - l.data_venc_plano) <= 30               THEN '01-30 dias'
    WHEN (CURRENT_DATE - l.data_venc_plano) <= 60               THEN '31-60 dias'
    WHEN (CURRENT_DATE - l.data_venc_plano) <= 90               THEN '61-90 dias'
    ELSE '90+ dias'
  END AS range_atraso,
  -- Status Auto calculado
  CASE
    WHEN l.data_pagamento IS NOT NULL AND l.valor > 0           THEN 'PAGO'
    WHEN l.data_venc_plano IS NOT NULL
      AND l.data_venc_plano < CURRENT_DATE
      AND l.data_pagamento IS NULL                              THEN 'ATRASADO'
    WHEN l.data_venc_plano IS NOT NULL
      AND l.data_venc_plano >= CURRENT_DATE
      AND l.data_pagamento IS NULL                              THEN 'A VENCER'
    ELSE 'PREVISTO'
  END AS status_auto,
  l.descricao,
  l.tipo,
  l.status,
  l.status_manual,
  l.status_extrato,
  l.valor,
  l.valor_previsto,
  CASE WHEN l.tipo = 'ENTRADA' THEN l.valor ELSE 0 END         AS entrada,
  CASE WHEN l.tipo = 'SAIDA'   THEN l.valor ELSE 0 END         AS saida,
  pc.codigo                                                     AS conta_codigo,
  pc.descricao                                                  AS conta_descricao,
  l.fornecedor,
  f.codigo || ' – ' || f.nome                                  AS fantasia_display,
  l.centro_custo,
  l.banco,
  l.categoria,
  l.dre,
  l.cont,
  l.anotacao,
  l.referencia,
  l.importado,
  l.criado_em
FROM lancamentos l
JOIN  tenants     t  ON t.id  = l.tenant_id
LEFT JOIN plano_contas pc ON pc.id = l.conta_id
LEFT JOIN fornecedores  f  ON f.id  = l.fornecedor_id
WHERE l.status != 'cancelado';
