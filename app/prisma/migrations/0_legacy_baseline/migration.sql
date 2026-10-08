-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plano" TEXT NOT NULL DEFAULT 'trial',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "logo_url" TEXT,
    "titulo_tabela_status" TEXT DEFAULT 'VALOR PREVISTO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'membro',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_contas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "pai_id" TEXT,
    "categoria_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plano_contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centros_custo" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "area_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "centros_custo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas_negocio" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "areas_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dados_bancarios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT,
    "conta" TEXT,
    "tipo" TEXT,
    "titular" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dados_bancarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dre" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_pessoa" VARCHAR(2),
    "nome_fantasia" TEXT,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "conta_padrao_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_pessoa" VARCHAR(2),
    "nome_fantasia" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "documento" TEXT,
    "endereco" TEXT,
    "conta_padrao_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "departamento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "documento" TEXT,
    "data_admissao" DATE,
    "salario" DECIMAL(15,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "cnpj" TEXT,
    "insc_estadual" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "segmento" TEXT,
    "porte" TEXT,
    "data_fundacao" DATE,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_grupos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_sequencias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "escopo" VARCHAR(100) NOT NULL,
    "ultimo_numero" BIGINT NOT NULL,

    CONSTRAINT "produto_sequencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_tipos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grupo" TEXT,
    "grupo_id" TEXT,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_linhas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo_id" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "grupo_id" TEXT,
    "tipo_id" TEXT,
    "linha_id" TEXT,
    "descricao" TEXT,
    "observacoes" TEXT,
    "unidade" TEXT,
    "preco_venda" DECIMAL(15,2),
    "preco_custo" DECIMAL(15,2),
    "categoria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'A Fazer!',
    "status_cor" TEXT,
    "colunas" JSONB NOT NULL DEFAULT '[]',
    "linhas" JSONB NOT NULL DEFAULT '[]',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_status" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#3b82f6',
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tarefa_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_manual_tipos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "status_manual_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layouts_colunas" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "colunas" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layouts_colunas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "data_lanc" DATE NOT NULL,
    "data_emissao" DATE,
    "data_venc_original" DATE,
    "data_venc_plano" DATE,
    "data_evento" DATE,
    "data_pagamento" DATE,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "valor_previsto" DECIMAL(15,2),
    "banco" TEXT,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'realizado',
    "status_manual" TEXT,
    "status_extrato" TEXT,
    "conta_id" TEXT,
    "fornecedor_id" TEXT,
    "cliente_id" TEXT,
    "fornecedor" TEXT,
    "centro_custo" TEXT,
    "referencia" TEXT,
    "fantasia_padrao" TEXT,
    "categoria" TEXT,
    "dre" TEXT,
    "cont" TEXT,
    "anotacao" TEXT,
    "metadados" JSONB NOT NULL DEFAULT '{}',
    "importado" BOOLEAN NOT NULL DEFAULT false,
    "importado_em" TIMESTAMP(3),
    "criado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_email_key" ON "usuarios"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "idx_plano_contas_tenant_categoria" ON "plano_contas"("tenant_id", "categoria_id");

-- CreateIndex
CREATE INDEX "idx_plano_contas_tenant_codigo" ON "plano_contas"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "plano_contas_tenant_id_id_key" ON "plano_contas"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_centro_custo_tenant" ON "centros_custo"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_tenant_id_codigo_key" ON "centros_custo"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_area_negocio_tenant" ON "areas_negocio"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_negocio_tenant_id_codigo_key" ON "areas_negocio"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_dados_bancarios_tenant" ON "dados_bancarios"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_categoria_tenant" ON "categorias"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_tenant_id_codigo_key" ON "categorias"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_dre_tenant" ON "dre"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dre_tenant_id_codigo_key" ON "dre"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_fornecedores_tenant" ON "fornecedores"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_fornecedores_conta_padrao" ON "fornecedores"("tenant_id", "conta_padrao_id");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_tenant_id_codigo_key" ON "fornecedores"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_clientes_tenant" ON "clientes"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_clientes_conta_padrao" ON "clientes"("tenant_id", "conta_padrao_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenant_id_codigo_key" ON "clientes"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenant_id_id_key" ON "clientes"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idx_pessoas_tenant" ON "pessoas"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pessoas_tenant_id_codigo_key" ON "pessoas"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_empresa_tenant" ON "empresas"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_produto_grupos_tenant" ON "produto_grupos"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_grupos_tenant_id_id_key" ON "produto_grupos"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_grupos_tenant_id_codigo_key" ON "produto_grupos"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "produto_sequencias_tenant_id_escopo_key" ON "produto_sequencias"("tenant_id", "escopo");

-- CreateIndex
CREATE INDEX "idx_produto_tipos_tenant" ON "produto_tipos"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_tipos_tenant_id_id_key" ON "produto_tipos"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_tipos_tenant_id_grupo_codigo_key" ON "produto_tipos"("tenant_id", "grupo", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "produto_tipos_tenant_id_grupo_id_codigo_key" ON "produto_tipos"("tenant_id", "grupo_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_produto_linhas_tipo" ON "produto_linhas"("tenant_id", "tipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_linhas_tenant_id_id_key" ON "produto_linhas"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "produto_linhas_tenant_id_tipo_id_codigo_key" ON "produto_linhas"("tenant_id", "tipo_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_produtos_tenant" ON "produtos"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_produtos_tipo" ON "produtos"("tenant_id", "tipo_id");

-- CreateIndex
CREATE INDEX "idx_produtos_grupo" ON "produtos"("tenant_id", "grupo_id");

-- CreateIndex
CREATE INDEX "idx_produtos_linha" ON "produtos"("tenant_id", "linha_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_tenant_id_codigo_key" ON "produtos"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_tarefas_tenant" ON "tarefas"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_tarefa_status_tenant" ON "tarefa_status"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_status_manual_tenant" ON "status_manual_tipos"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "status_manual_tipos_tenant_id_codigo_key" ON "status_manual_tipos"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "idx_layouts_usuario" ON "layouts_colunas"("usuario_id");

-- CreateIndex
CREATE INDEX "idx_lancamentos_tenant_data" ON "lancamentos"("tenant_id", "data_lanc" DESC);

-- CreateIndex
CREATE INDEX "idx_lancamentos_tenant_status" ON "lancamentos"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_lancamentos_tenant_tipo" ON "lancamentos"("tenant_id", "tipo");

-- CreateIndex
CREATE INDEX "idx_lancamentos_fornecedor" ON "lancamentos"("fornecedor_id");

-- CreateIndex
CREATE INDEX "idx_lancamentos_tenant_cliente" ON "lancamentos"("tenant_id", "cliente_id");

-- CreateIndex
CREATE INDEX "idx_lancamentos_venc_plano" ON "lancamentos"("tenant_id", "data_venc_plano");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas_negocio" ADD CONSTRAINT "areas_negocio_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dados_bancarios" ADD CONSTRAINT "dados_bancarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dre" ADD CONSTRAINT "dre_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tenant_id_conta_padrao_id_fkey" FOREIGN KEY ("tenant_id", "conta_padrao_id") REFERENCES "plano_contas"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_conta_padrao_id_fkey" FOREIGN KEY ("tenant_id", "conta_padrao_id") REFERENCES "plano_contas"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_grupos" ADD CONSTRAINT "produto_grupos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_sequencias" ADD CONSTRAINT "produto_sequencias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_tipos" ADD CONSTRAINT "produto_tipos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_tipos" ADD CONSTRAINT "produto_tipos_tenant_id_grupo_id_fkey" FOREIGN KEY ("tenant_id", "grupo_id") REFERENCES "produto_grupos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produto_linhas" ADD CONSTRAINT "produto_linhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_linhas" ADD CONSTRAINT "produto_linhas_tenant_id_tipo_id_fkey" FOREIGN KEY ("tenant_id", "tipo_id") REFERENCES "produto_tipos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_grupo_id_fkey" FOREIGN KEY ("tenant_id", "grupo_id") REFERENCES "produto_grupos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_tipo_id_fkey" FOREIGN KEY ("tenant_id", "tipo_id") REFERENCES "produto_tipos"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_linha_id_fkey" FOREIGN KEY ("tenant_id", "linha_id") REFERENCES "produto_linhas"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_status" ADD CONSTRAINT "tarefa_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_manual_tipos" ADD CONSTRAINT "status_manual_tipos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layouts_colunas" ADD CONSTRAINT "layouts_colunas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_cliente_id_fkey" FOREIGN KEY ("tenant_id", "cliente_id") REFERENCES "clientes"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
