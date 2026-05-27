/**
 * Script para gerar hashes bcrypt e atualizar as senhas no banco
 * Executar: node scripts/reset-passwords.js
 */

const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const SENHAS = [
  { email: "ricardo@gestarfinanceira.com.br", senha: "admin123" },
  { email: "joao@empresademo.com.br",          senha: "demo123"  },
  { email: "ana@techsolucoes.com.br",           senha: "tech123"  },
];

async function main() {
  const client = new Client({
    connectionString: "postgresql://gestar_admin:gestar@2024_secure@localhost:5433/gestar_financeira",
  });

  await client.connect();
  console.log("✅ Conectado ao PostgreSQL");

  for (const { email, senha } of SENHAS) {
    const hash = await bcrypt.hash(senha, 12);
    const result = await client.query(
      "UPDATE usuarios SET senha_hash = $1 WHERE email = $2 RETURNING nome, email",
      [hash, email]
    );
    if (result.rowCount > 0) {
      console.log(`✅ Senha atualizada: ${result.rows[0].nome} (${email})`);
    } else {
      console.log(`⚠️  Usuário não encontrado: ${email}`);
    }
  }

  await client.end();
  console.log("\n🎉 Todas as senhas foram atualizadas com bcrypt!");
  console.log("\nCredenciais para teste:");
  SENHAS.forEach(({ email, senha }) => console.log(`  ${email} → ${senha}`));
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
