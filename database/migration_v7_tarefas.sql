-- ============================================================
-- GESTAR FINANCEIRA – Migration v7
-- Módulo Ação: Tarefas com colunas dinâmicas
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seq           SERIAL,
  nome          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'A Fazer!',
  status_cor    TEXT,
  colunas       JSONB NOT NULL DEFAULT '[]',
  linhas        JSONB NOT NULL DEFAULT '[]',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_tenant ON tarefas(tenant_id);

CREATE TABLE IF NOT EXISTS tarefa_status (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  cor       TEXT NOT NULL DEFAULT '#3b82f6',
  ordem     INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tarefa_status_tenant ON tarefa_status(tenant_id);

-- Seeds: status padrão
INSERT INTO tarefa_status (tenant_id, nome, cor, ordem)
SELECT id, unnest(ARRAY['A Fazer!','Em Andamento!','Atrasado!','Atenção! Prioridade!','Criar! Elaborar!','Aprimorar!','Concluído!','Acompanhar!']),
       unnest(ARRAY['#3b82f6','#f59e0b','#ef4444','#dc2626','#d97706','#8b5cf6','#059669','#06b6d4']),
       unnest(ARRAY[1,2,3,4,5,6,7,8])
FROM tenants ON CONFLICT DO NOTHING;
