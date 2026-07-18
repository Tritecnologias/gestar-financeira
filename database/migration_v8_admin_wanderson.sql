-- ============================================================
-- GESTAR FINANCEIRA – Migration v8
-- Criar usuário admin global Wanderson
-- ============================================================

-- Inserir Wanderson como admin_global no tenant do Ricardo
-- Senha: gerar hash com: node -e "require('bcryptjs').hash('SUASENHA',12).then(h=>console.log(h))"
-- Por enquanto inserindo com hash de 'admin123' — TROCAR EM PRODUÇÃO

INSERT INTO usuarios (tenant_id, nome, email, senha_hash, papel)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Wanderson',
  'wanderson.martins.silva@gmail.com',
  '$2b$12$HCzIfCnAW6QJzcpbNN7BNehawUmxXi4P59J/.J7sr0ZSG4XPWEeTa',
  'admin_global'
) ON CONFLICT (tenant_id, email) DO UPDATE SET papel = 'admin_global';
