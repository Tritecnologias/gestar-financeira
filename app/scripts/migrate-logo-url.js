/**
 * Adiciona a coluna logo_url à tabela tenants
 * Execute: node scripts/migrate-logo-url.js
 */
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS logo_url TEXT;
    `);
    console.log('✅ Coluna logo_url adicionada (ou já existia) em tenants.');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
  } finally {
    await client.end();
  }
}

run();
