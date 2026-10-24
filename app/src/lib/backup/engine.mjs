import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { TABLES, REFERENCE_TABLES, COLUMNS, FOREIGN_KEYS } from './catalog.mjs';
import { VERSION, MAX_BYTES, canonical, digest, fail, seal, validate } from './format.mjs';

const qi = name => '"' + name.replaceAll('"', '""') + '"';
async function rows(db, sql, args = []) { return (await db.query(sql, args)).rows; }
async function objects(db, table, tenantId, projection = 'to_jsonb(t)') {
  return (await rows(db, `SELECT ${projection} AS v FROM public.${qi(table)} t WHERE tenant_id=$1 ORDER BY id`, [tenantId])).map(r => r.v);
}
async function permissions(db, ctx, action, hold = false) {
  const [m] = await rows(db, `SELECT m.role,p.permissoes,p.ativo FROM tenant_memberships m
    JOIN auth_identities i ON i.id=m.identity_id JOIN tenants t ON t.id=m.tenant_id
    LEFT JOIN access_profiles p ON p.id=m.profile_id AND p.tenant_id=m.tenant_id
    WHERE m.id=$1 AND m.tenant_id=$2 AND m.identity_id=$3 AND m.status='ACTIVE' AND i.status='ACTIVE' AND t.ativo${hold ? ' FOR SHARE OF m,i,t' : ''}`,
  [ctx.membershipId, ctx.tenantId, ctx.identityId]);
  if (!m || (action === 'restore' && m.role !== 'OWNER') ||
      (m.role !== 'OWNER' && (!m.ativo || !m.permissoes.includes('sistema.backup.view') || !m.permissoes.includes('sistema.backup.' + action)))) {
    fail('PERMISSION', 'Acesso negado para backup/restauração desta empresa.', 403);
  }
}
async function audit(db, ctx, action, metadata, id = randomUUID(), result = 'SUCCESS') {
  await db.query(`INSERT INTO audit_events(id,actor_identity_id,actor_membership_id,tenant_id,access_mode,action,resource_type,resource_id,result,metadata)
    VALUES($1,$2,$3,$4,'MEMBERSHIP',$5,'TenantBackup',$4,$6,$7::jsonb)`,
  [id, ctx.identityId, ctx.membershipId, ctx.tenantId, action, result, JSON.stringify(metadata)]);
}
async function lock(db, tenantId) {
  const [r] = await rows(db, "SELECT pg_try_advisory_xact_lock(hashtextextended('10s:tenant-restore:' || $1,0)) locked", [tenantId]);
  if (!r.locked) fail('BUSY', 'Há gravação em andamento nesta empresa. Tente novamente após sua conclusão.', 409);
}
async function references(db, tenantId) {
  const result = {};
  for (const t of REFERENCE_TABLES) {
    result[t] = t === 'tenant_contractual_responsibles'
      ? (await rows(db, 'SELECT to_jsonb(t) v FROM tenant_contractual_responsibles t WHERE tenant_id=$1', [tenantId])).map(r => r.v)
      : await objects(db, t, tenantId);
  }
  result.usuarios = await objects(db, 'usuarios', tenantId, "to_jsonb(t)-'senha_hash'");
  // Only stable IDs/status of identities actually referenced by this tenant; never credentials or other memberships.
  result.identities = (await rows(db, `SELECT DISTINCT i.id,i.status FROM auth_identities i WHERE i.id IN
    (SELECT identity_id FROM tenant_memberships WHERE tenant_id=$1 UNION SELECT actor_identity_id FROM import_operations WHERE tenant_id=$1)
    ORDER BY i.id`, [tenantId]));
  return result;
}
async function fileManifest(db, tenantId) {
  // Current documents are global. Only references required by this tenant's acceptances.
  return await rows(db, `SELECT DISTINCT v.id,v.version,v.storage_key AS key,v.sha256,v.byte_size AS size
    FROM term_versions v JOIN term_acceptances a ON a.term_version_id=v.id
    WHERE a.tenant_id=$1 OR a.identity_id IN (SELECT identity_id FROM tenant_memberships WHERE tenant_id=$1)
    ORDER BY v.id`, [tenantId]);
}
async function verifyFiles(files, storageDir) {
  if (files.length && (!storageDir || !isAbsolute(storageDir))) fail('STORAGE', 'Storage privado indisponível.', 409);
  for (const f of files) {
    if (!/^[0-9a-f-]{36}\.pdf$/.test(f.key)) fail('FILE_PATH');
    try {
      const path = join(storageDir, f.key), stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== f.size) throw Error();
      const bytes = await readFile(path);
      if (createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw Error();
    } catch { fail('STORAGE_INTEGRITY', 'Documento referenciado ausente ou divergente. Reconcilie o storage antes de restaurar.', 409); }
  }
}
async function snapshot(db, tenantId, config) {
  const [tenant] = await rows(db, 'SELECT id,slug,nome,logo_url,titulo_tabela_status FROM tenants WHERE id=$1', [tenantId]);
  if (!tenant) fail('TENANT_NOT_FOUND');
  const migrations = await rows(db, 'SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  const [pending] = await rows(db, 'SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');
  if (pending.n || migrations.length !== 16 || !migrations.some(m => m.migration_name === '20261024_z_tenant_restore_lock')) fail('MIGRATIONS', 'Schema fora do contrato de backup v1. Atualize o mecanismo antes de prosseguir.', 409);
  const sections = {};
  for (const t of TABLES) {
    // JSON-safe bigint representation; numeric money remains PostgreSQL numeric on reinsert.
    const data = await objects(db, t, tenantId, t === 'lancamentos' ? "to_jsonb(t)||jsonb_build_object('revisao',t.revisao::text)" : 'to_jsonb(t)');
    sections[t] = { rows: data, count: data.length, checksum: digest(data) };
  }
  const files = await fileManifest(db, tenantId);
  await verifyFiles(files, config.termDir);
  return seal({ format: VERSION, createdAt: new Date().toISOString(), sourceCommit: config.sourceCommit,
    applicationVersion: '0.1.0', tenant, migrations, sections, references: await references(db, tenantId), files,
    exclusions: ['global credentials/identities/PlatformAdmin', 'access grants/invitations', 'immutable audit/acceptances', 'infrastructure secrets'],
    policy: 'same-tenant-replace-business-preserve-access' });
}
function stateDigest(b) { return digest({ tenant: b.tenant, sections: b.sections, references: b.references, files: b.files, migrations: b.migrations }); }
async function compatible(db, backup, current) {
  if (digest(backup.migrations) !== digest(current.migrations)) fail('SCHEMA_VERSION', 'Migrations incompatíveis com este backup.', 409);
  if (digest(backup.references) !== digest(current.references)) fail('RECONCILIATION', 'Perfis, vínculos ou referências de identidade divergiram. Reconciliação administrativa necessária; nenhum acesso será recriado.', 409);
  // Validate immutable file metadata against DB; uploaded names/hashes cannot redirect file reads.
  const manifest = new Map(current.files.map(f => [f.id, f]));
  for (const f of backup.files) if (digest(manifest.get(f.id) ?? null) !== digest(f)) fail('FILE_VERSION', 'Versão documental exige reconciliação.', 409);
  // Every business FK must stay inside the selected tenant, even legacy single-column FKs.
  for (const fk of FOREIGN_KEYS) {
    let targets;
    if (TABLES.includes(fk.target)) targets = backup.sections[fk.target].rows;
    else if (fk.target === 'tenants') targets = [current.tenant];
    else if (fk.target === 'usuarios') targets = current.references.usuarios;
    else if (fk.target === 'auth_identities') targets = current.references.identities;
    else fail('UNKNOWN_REFERENCE');
    const keys = new Set(targets.map(t => canonical(fk.targetColumns.map(c => t[c]))));
    for (const row of backup.sections[fk.table].rows) {
      const key = fk.columns.map(c => row[c]);
      if (key.every(v => v !== null) && !keys.has(canonical(key))) fail('FK', 'Referência inválida ou de outra empresa no backup.', 409);
    }
    // A malformed historical cross-tenant FK could cause SET NULL/CASCADE outside the target on delete.
    if (TABLES.includes(fk.target)) {
      const joinOn = fk.columns.map((c, i) => `s.${qi(c)}=d.${qi(fk.targetColumns[i])}`).join(' AND ');
      const [cross] = await rows(db, `SELECT EXISTS(SELECT 1 FROM ${qi(fk.table)} s JOIN ${qi(fk.target)} d ON ${joinOn}
        WHERE d.tenant_id=$1 AND s.tenant_id<>$1) bad`, [current.tenant.id]);
      if (cross.bad) fail('CROSS_TENANT_LEGACY', 'Vínculo legado entre empresas exige reconciliação antes do restore.', 409);
    }
  }
}
async function transaction(pool, mode, fn) {
  const db = await pool.connect();
  try {
    await db.query(mode); await db.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='5s'");
    const result = await fn(db); await db.query('COMMIT'); return result;
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
  finally { db.release(); }
}
export async function createBackup(pool, ctx, config) {
  const backup = await transaction(pool, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', async db => {
    await permissions(db, ctx, 'create');
    return snapshot(db, ctx.tenantId, config);
  });
  if (Buffer.byteLength(JSON.stringify(backup)) > MAX_BYTES) fail('SIZE', 'Backup excede 8 MB; use o procedimento operacional privado.', 413);
  await transaction(pool, 'BEGIN', db => audit(db, ctx, 'TENANT_BACKUP_CREATED', { checksum: backup.checksum, version: VERSION }));
  return backup;
}
export async function previewRestore(pool, ctx, backup, config) {
  validate(backup, ctx.tenantId);
  return transaction(pool, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', async db => {
    await permissions(db, ctx, 'restore'); const current = await snapshot(db, ctx.tenantId, config);
    await compatible(db, backup, current);
    return { checksum: backup.checksum, currentDigest: stateDigest(current), tenant: current.tenant.nome,
      counts: TABLES.map(t => ({ table: t, before: current.sections[t].count, after: backup.sections[t].count })),
      preserved: 'Identidades, memberships, perfis, convites, auditoria e aceites preservados; revisões técnicas avançam.' };
  });
}
export async function restoreReceipt(pool, ctx, attempt) {
  if (!/^[0-9a-f-]{36}$/.test(attempt)) fail('ATTEMPT');
  return transaction(pool, 'BEGIN READ ONLY', async db => {
    await permissions(db, ctx, 'restore');
    const [r] = await rows(db, "SELECT id,metadata,occurred_at FROM audit_events WHERE id=$1 AND tenant_id=$2 AND actor_identity_id=$3 AND action='TENANT_RESTORE_COMPLETED'", [attempt, ctx.tenantId, ctx.identityId]);
    return r ?? null;
  });
}
export async function restoreBackup(pool, ctx, backup, config, expectedDigest, attempt) {
  validate(backup, ctx.tenantId);
  if (!/^[0-9a-f-]{36}$/.test(attempt)) fail('ATTEMPT');
  if (!config.backupDir || !isAbsolute(config.backupDir)) fail('SAFETY_STORAGE', 'Volume privado de backups não configurado.', 503);
  try {
    // READ COMMITTED: acquire exclusive lock before taking the first data snapshot;
    // all writes on this tenant participate via database triggers.
    return await transaction(pool, 'BEGIN', async db => {
      await lock(db, ctx.tenantId); await permissions(db, ctx, 'restore', true);
      const [done] = await rows(db, "SELECT metadata FROM audit_events WHERE id=$1 AND tenant_id=$2 AND actor_identity_id=$3 AND action='TENANT_RESTORE_COMPLETED'", [attempt, ctx.tenantId, ctx.identityId]);
      if (done) { if (done.metadata.checksum !== backup.checksum) fail('ATTEMPT_REUSE'); return done.metadata; }
      const current = await snapshot(db, ctx.tenantId, config);
      if (stateDigest(current) !== expectedDigest) fail('STALE_PREVIEW', 'A empresa mudou após a prévia. Gere nova prévia antes de confirmar.', 409);
      await compatible(db, backup, current);
      // Durable pre-replace snapshot; retained even after a transaction rollback.
      await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
      const safety = join(config.backupDir, `${attempt}.json`);
      await writeFile(safety, JSON.stringify(current), { flag: 'wx', mode: 0o600, flush: true });
      if (digest(JSON.parse(await readFile(safety, 'utf8'))) !== digest(current)) fail('SAFETY_VERIFY');
      const revs = [...current.sections.lancamentos.rows, ...backup.sections.lancamentos.rows].map(r => BigInt(r.revisao));
      const revision = revs.reduce((a, b) => a > b ? a : b, BigInt(Date.now()) * 1000n) + 1n;
      for (const t of [...TABLES].reverse()) await db.query(`DELETE FROM public.${qi(t)} WHERE tenant_id=$1`, [ctx.tenantId]);
      for (const t of TABLES) {
        let data = backup.sections[t].rows;
        if (t === 'lancamentos') data = data.map(r => ({ ...r, revisao: revision.toString() }));
        if (data.length) await db.query(`INSERT INTO public.${qi(t)} (${COLUMNS[t].map(qi).join(',')})
          SELECT ${COLUMNS[t].map(qi).join(',')} FROM jsonb_populate_recordset(NULL::public.${qi(t)},$1::jsonb)`, [JSON.stringify(data)]);
      }
      await db.query('UPDATE tenants SET logo_url=$2,titulo_tabela_status=$3 WHERE id=$1', [ctx.tenantId, backup.tenant.logo_url, backup.tenant.titulo_tabela_status]);
      const receipt = { checksum: backup.checksum, safetyChecksum: current.checksum, version: VERSION, records: TABLES.reduce((n,t) => n + backup.sections[t].count, 0), attempt };
      await audit(db, ctx, 'TENANT_RESTORE_COMPLETED', receipt, attempt);
      return receipt;
    });
  } catch (e) {
    if (/^(23|22|40|55|P0001)/.test(e.code ?? '')) {
      await transaction(pool, 'BEGIN', db => audit(db, ctx, 'TENANT_RESTORE_REJECTED', { code: 'DATABASE_VALIDATION', attempt }, randomUUID(), 'FAILURE')).catch(() => {});
      fail('DATABASE_VALIDATION', 'Restauração não aplicada: integridade ou concorrência impediu a operação. Confira a prévia e tente novamente.', 409);
    }
    // Never report a presumed rollback on a network/commit failure. Receipt is authoritative.
    if (e.status && e.code && /^[A-Z_]+$/.test(e.code)) await transaction(pool, 'BEGIN', db => audit(db, ctx, 'TENANT_RESTORE_REJECTED', { code: e.code, attempt }, randomUUID(), 'FAILURE')).catch(() => {});
    throw e;
  }
}
