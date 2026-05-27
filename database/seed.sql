-- ============================================================
-- GESTAR FINANCEIRA – Dados de Exemplo (Seed)
-- ============================================================

-- Tenant de demonstração (Ricardo / admin global)
INSERT INTO tenants (id, nome, slug, email, plano) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ricardo Planilhas (Admin)', 'admin', 'ricardo@gestarfinanceira.com.br', 'anual'),
  ('00000000-0000-0000-0000-000000000002', 'Empresa Demo Ltda', 'empresa-demo', 'demo@empresademo.com.br', 'mensal'),
  ('00000000-0000-0000-0000-000000000003', 'Tech Soluções ME', 'tech-solucoes', 'financeiro@techsolucoes.com.br', 'trial');

-- Usuário admin global (Ricardo)
-- Senhas hasheadas com bcrypt (compatível com bcryptjs no Node.js)
-- Ricardo: admin123 | João Silva: demo123 | Ana Tech: tech123
INSERT INTO usuarios (tenant_id, nome, email, senha_hash, papel) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ricardo', 'ricardo@gestarfinanceira.com.br',
   '$2b$12$ZV4zxI6qOF2cFHbZeNRbie8.ZnRe9EU7ia63/iwqOefa0W87k8Bge', 'admin_global'),
  ('00000000-0000-0000-0000-000000000002', 'João Silva', 'joao@empresademo.com.br',
   '$2b$12$Ns9/T.WRi4wGnV6db1v2Auu9xyOhek/dzhevFYjBn1ilBzgWdPBkO', 'admin'),
  ('00000000-0000-0000-0000-000000000003', 'Ana Tech', 'ana@techsolucoes.com.br',
   '$2b$12$8ylP0q7ykwhS04Ml0d7EAeCHxV2N9pPooeojDfL1aOGiN5D2kdKwS', 'admin');

-- Plano de Contas para tenant demo
INSERT INTO plano_contas (tenant_id, codigo, descricao, tipo) VALUES
  ('00000000-0000-0000-0000-000000000002', '1.0', 'RECEITAS OPERACIONAIS', 'RECEITA'),
  ('00000000-0000-0000-0000-000000000002', '1.1', 'Vendas de Produtos', 'RECEITA'),
  ('00000000-0000-0000-0000-000000000002', '1.2', 'Prestação de Serviços', 'RECEITA'),
  ('00000000-0000-0000-0000-000000000002', '1.3', 'Outras Receitas', 'RECEITA'),
  ('00000000-0000-0000-0000-000000000002', '2.0', 'DESPESAS OPERACIONAIS', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.1', 'Folha de Pagamento', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.2', 'Aluguel e Condomínio', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.3', 'Fornecedores', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.4', 'Marketing e Publicidade', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.5', 'Impostos e Taxas', 'DESPESA'),
  ('00000000-0000-0000-0000-000000000002', '2.6', 'Outros Custos', 'DESPESA');

-- Lançamentos de exemplo (Maio 2026)
INSERT INTO lancamentos (tenant_id, data_lanc, descricao, valor, tipo, status, fornecedor, centro_custo, referencia) VALUES
  ('00000000-0000-0000-0000-000000000002', '2026-05-01', 'Pagamento de Cliente A', 12500.00, 'ENTRADA', 'realizado', 'Cliente A', 'Comercial', 'NF-001'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-02', 'Pagamento de Cliente B', 8750.00, 'ENTRADA', 'realizado', 'Cliente B', 'Comercial', 'NF-002'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-02', 'Aluguel do escritório', 3500.00, 'SAIDA', 'realizado', 'Imobiliária XYZ', 'Administrativo', 'Aluguel/Mai'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-03', 'Fornecedor de Material', 2340.50, 'SAIDA', 'realizado', 'Suprimentos ABC', 'Operacional', 'NF-789'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-05', 'Serviço de Consultoria', 5000.00, 'ENTRADA', 'realizado', 'XPTO Corp', 'Projetos', 'CTR-045'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-07', 'Folha de Pagamento', 15200.00, 'SAIDA', 'realizado', NULL, 'RH', 'FP/Mai-2026'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-10', 'Receita de Assinatura SaaS', 2980.00, 'ENTRADA', 'realizado', 'Assinantes', 'Produto', NULL),
  ('00000000-0000-0000-0000-000000000002', '2026-05-15', 'Google Ads - Campanha', 850.00, 'SAIDA', 'realizado', 'Google LLC', 'Marketing', 'ADS-052'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-20', 'Previsão: Cliente C', 18000.00, 'ENTRADA', 'previsto', 'Cliente C', 'Comercial', 'PRE-001'),
  ('00000000-0000-0000-0000-000000000002', '2026-05-25', 'Previsão: SIMPLES Nacional', 4200.00, 'SAIDA', 'previsto', 'Receita Federal', 'Fiscal', 'SIMPLES/Mai');
