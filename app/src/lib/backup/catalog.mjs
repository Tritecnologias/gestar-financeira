// Explicit, versioned restore allowlist. Never derive writable tables from an uploaded file.
export const TABLES = [
  "areas_negocio",
  "centros_custo",
  "categorias",
  "plano_contas",
  "fornecedores",
  "clientes",
  "dre",
  "dados_bancarios",
  "empresas",
  "pessoas",
  "produto_grupos",
  "produto_tipos",
  "produto_linhas",
  "produtos",
  "produto_sequencias",
  "tarefa_status",
  "tarefas",
  "status_manual_tipos",
  "layouts_colunas",
  "lancamentos",
  "import_operations"
];
export const REFERENCE_TABLES = ["access_profiles","tenant_memberships","legacy_user_access_maps","tenant_contractual_responsibles"];
export const COLUMNS = {
  "areas_negocio": [
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "tenant_id"
  ],
  "centros_custo": [
    "area_id",
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "tenant_id"
  ],
  "categorias": [
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "tenant_id",
    "tipo"
  ],
  "plano_contas": [
    "ativo",
    "categoria_id",
    "codigo",
    "criado_em",
    "descricao",
    "id",
    "pai_id",
    "tenant_id",
    "tipo"
  ],
  "fornecedores": [
    "ativo",
    "codigo",
    "conta_padrao_id",
    "criado_em",
    "documento",
    "email",
    "endereco",
    "id",
    "nome",
    "nome_fantasia",
    "telefone",
    "tenant_id",
    "tipo_pessoa"
  ],
  "clientes": [
    "ativo",
    "codigo",
    "conta_padrao_id",
    "criado_em",
    "documento",
    "email",
    "endereco",
    "id",
    "nome",
    "nome_fantasia",
    "telefone",
    "tenant_id",
    "tipo_pessoa"
  ],
  "dre": [
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "ordem",
    "tenant_id"
  ],
  "dados_bancarios": [
    "agencia",
    "ativo",
    "banco",
    "conta",
    "criado_em",
    "id",
    "tenant_id",
    "tipo",
    "titular"
  ],
  "empresas": [
    "cep",
    "cidade",
    "cnpj",
    "criado_em",
    "data_fundacao",
    "email",
    "endereco",
    "estado",
    "id",
    "insc_estadual",
    "nome_fantasia",
    "porte",
    "razao_social",
    "segmento",
    "telefone",
    "tenant_id"
  ],
  "pessoas": [
    "ativo",
    "cargo",
    "codigo",
    "criado_em",
    "data_admissao",
    "departamento",
    "documento",
    "email",
    "id",
    "nome",
    "salario",
    "telefone",
    "tenant_id"
  ],
  "produto_grupos": [
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "tenant_id"
  ],
  "produto_tipos": [
    "ativo",
    "codigo",
    "criado_em",
    "grupo",
    "grupo_id",
    "id",
    "nome",
    "tenant_id"
  ],
  "produto_linhas": [
    "ativo",
    "codigo",
    "criado_em",
    "id",
    "nome",
    "tenant_id",
    "tipo_id"
  ],
  "produtos": [
    "ativo",
    "categoria",
    "codigo",
    "criado_em",
    "descricao",
    "grupo_id",
    "id",
    "linha_id",
    "nome",
    "observacoes",
    "preco_custo",
    "preco_venda",
    "tenant_id",
    "tipo",
    "tipo_id",
    "unidade"
  ],
  "produto_sequencias": [
    "escopo",
    "id",
    "tenant_id",
    "ultimo_numero"
  ],
  "tarefa_status": [
    "cor",
    "id",
    "nome",
    "ordem",
    "tenant_id"
  ],
  "tarefas": [
    "atualizado_em",
    "colunas",
    "criado_em",
    "id",
    "linhas",
    "nome",
    "seq",
    "status",
    "status_cor",
    "tenant_id"
  ],
  "status_manual_tipos": [
    "ativo",
    "codigo",
    "cor",
    "id",
    "nome",
    "ordem",
    "tenant_id"
  ],
  "layouts_colunas": [
    "atualizado_em",
    "colunas",
    "criado_em",
    "id",
    "identity_id",
    "is_default",
    "nome",
    "tenant_id",
    "usuario_id"
  ],
  "lancamentos": [
    "anotacao",
    "atualizado_em",
    "banco",
    "categoria",
    "centro_custo",
    "cliente_id",
    "cont",
    "conta_id",
    "criado_em",
    "criado_por",
    "criado_por_identity_id",
    "data_emissao",
    "data_evento",
    "data_lanc",
    "data_pagamento",
    "data_venc_original",
    "data_venc_plano",
    "descricao",
    "dre",
    "fantasia_padrao",
    "fornecedor",
    "fornecedor_id",
    "id",
    "importado",
    "importado_em",
    "metadados",
    "referencia",
    "revisao",
    "seq",
    "status",
    "status_extrato",
    "status_manual",
    "tenant_id",
    "tipo",
    "valor",
    "valor_previsto"
  ],
  "import_operations": [
    "actor_identity_id",
    "completed_at",
    "contract_type",
    "contract_version",
    "created",
    "file_digest",
    "id",
    "payload_digest",
    "tenant_id",
    "unchanged",
    "updated",
    "warnings"
  ]
};
export const FOREIGN_KEYS = [
  {
    "table": "areas_negocio",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "categorias",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "centros_custo",
    "columns": [
      "area_id"
    ],
    "target": "areas_negocio",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "centros_custo",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "clientes",
    "columns": [
      "tenant_id",
      "conta_padrao_id"
    ],
    "target": "plano_contas",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "clientes",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "dados_bancarios",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "dre",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "empresas",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "fornecedores",
    "columns": [
      "tenant_id",
      "conta_padrao_id"
    ],
    "target": "plano_contas",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "fornecedores",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "import_operations",
    "columns": [
      "actor_identity_id"
    ],
    "target": "auth_identities",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "import_operations",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "conta_id"
    ],
    "target": "plano_contas",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "criado_por"
    ],
    "target": "usuarios",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "fornecedor_id"
    ],
    "target": "fornecedores",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "tenant_id",
      "cliente_id"
    ],
    "target": "clientes",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "layouts_colunas",
    "columns": [
      "usuario_id"
    ],
    "target": "usuarios",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "pessoas",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "plano_contas",
    "columns": [
      "categoria_id"
    ],
    "target": "categorias",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "plano_contas",
    "columns": [
      "pai_id"
    ],
    "target": "plano_contas",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "plano_contas",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produto_grupos",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produto_linhas",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produto_linhas",
    "columns": [
      "tenant_id",
      "tipo_id"
    ],
    "target": "produto_tipos",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "produto_sequencias",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produto_tipos",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produto_tipos",
    "columns": [
      "tenant_id",
      "grupo_id"
    ],
    "target": "produto_grupos",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "produtos",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "produtos",
    "columns": [
      "tenant_id",
      "grupo_id"
    ],
    "target": "produto_grupos",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "produtos",
    "columns": [
      "tenant_id",
      "linha_id"
    ],
    "target": "produto_linhas",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "produtos",
    "columns": [
      "tenant_id",
      "tipo_id"
    ],
    "target": "produto_tipos",
    "targetColumns": [
      "tenant_id",
      "id"
    ]
  },
  {
    "table": "status_manual_tipos",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "tarefa_status",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "tarefas",
    "columns": [
      "tenant_id"
    ],
    "target": "tenants",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "lancamentos",
    "columns": [
      "criado_por_identity_id"
    ],
    "target": "auth_identities",
    "targetColumns": [
      "id"
    ]
  },
  {
    "table": "layouts_colunas",
    "columns": [
      "identity_id"
    ],
    "target": "auth_identities",
    "targetColumns": [
      "id"
    ]
  }
];
