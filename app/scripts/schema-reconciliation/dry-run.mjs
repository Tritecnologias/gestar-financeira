import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { planIdentities } from './identity-plan.mjs';

// Explicitly pin the intended database; never load .env files or accept a URL on argv.
const expected = process.argv[2];
if (!expected || process.argv.length !== 3 || !/^[a-zA-Z0-9_]+$/.test(expected)) {
  console.error('Usage: node scripts/schema-reconciliation/dry-run.mjs EXPECTED_DATABASE');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: 'phase2a-readonly-plan' });
try {
  if (!process.env.DATABASE_URL) throw new Error('CONFIG_REQUIRED');
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL search_path=public,pg_catalog");
  const guard = await client.query("SELECT current_database() AS db,current_setting('transaction_read_only') AS ro");
  if (guard.rows[0].db !== expected || guard.rows[0].ro !== 'on') throw new Error('DATABASE_GUARD');
  const users = await client.query(await readFile(new URL('./identity-inventory.sql', import.meta.url), 'utf8'));
  const available = await client.query("SELECT to_regclass('public.auth_identities') IS NOT NULL AS present");
  const identities = available.rows[0].present ? (await client.query('SELECT email FROM auth_identities')).rows : [];
  const plan = planIdentities(users.rows, identities);
  await client.query('ROLLBACK');
  console.log(JSON.stringify(plan, null, 2));
} catch {
  // Driver errors can contain URLs, SQL values or identifiers. Do not echo them.
  console.error('READ_ONLY_PLAN_ABORTED: check the private connection and expected database.');
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
