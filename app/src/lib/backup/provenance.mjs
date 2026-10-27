import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { VERSION, canonical, digest, fail, seal } from './format.mjs';

// These references preserve history/ownership, never current access. No other FK is exempted.
export const HISTORICAL_RELATIONS = Object.freeze([
  Object.freeze({ table: 'lancamentos', column: 'criado_por' }),
  Object.freeze({ table: 'layouts_colunas', column: 'usuario_id' }),
]);
const identifier = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
function configuration(config, signing = false) {
  if (!config || !identifier(config.instanceId) || !config.keys || typeof config.keys !== 'object' || Array.isArray(config.keys) ||
      !Object.keys(config.keys).length || Object.entries(config.keys).some(([id, key]) => !identifier(id) || typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) ||
      (signing && (!identifier(config.activeKeyId) || !Object.hasOwn(config.keys, config.activeKeyId)))) {
    fail('BACKUP_SIGNING_CONFIG', 'Chave privada de backup não configurada corretamente. Contate a administração da plataforma.', 409);
  }
  return config;
}
export function signingConfig(env) {
  let keys;
  try { keys = JSON.parse(env.TENANT_BACKUP_SIGNING_KEYS ?? 'null'); } catch { /* sanitized below */ }
  const config = configuration({ instanceId: env.TENANT_BACKUP_INSTANCE_ID, activeKeyId: env.TENANT_BACKUP_SIGNING_KEY_ID, keys }, true);
  if (Object.values(config.keys).some(key => key === env.NEXTAUTH_SECRET || key === env.AUTH_SECRET)) {
    fail('BACKUP_SIGNING_CONFIG', 'Use uma chave exclusiva para backup, separada da autenticação.', 409);
  }
  return config;
}
export function historicalBindings(backup) {
  const localUsers = new Set(backup.references.usuarios.map(u => u.id));
  const bindings = [];
  for (const { table, column } of HISTORICAL_RELATIONS) {
    for (const row of backup.sections[table].rows) {
      if (row[column] !== null && !localUsers.has(row[column])) {
        bindings.push({ table, column, recordId: row.id, userId: row[column] });
      }
    }
  }
  return bindings.sort((a, b) => canonical(a).localeCompare(canonical(b), 'en'));
}
function signedPayload(backup) {
  const { checksum, historicalReferences, ...body } = backup;
  const { signature, ...manifest } = historicalReferences;
  return '10s-tenant-backup-provenance/v1\n' + canonical({ ...body, historicalReferences: manifest });
}
function signature(backup, key) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(signedPayload(backup)).digest('hex');
}
export function authenticateBackup(body, config) {
  configuration(config, true);
  if (body.format !== VERSION || Object.hasOwn(body, 'checksum') || Object.hasOwn(body, 'historicalReferences')) fail('FORMAT');
  const backup = { ...body, historicalReferences: {
    version: 1, instanceId: config.instanceId, keyId: config.activeKeyId, backupId: randomUUID(),
    bindings: historicalBindings(body),
  } };
  backup.historicalReferences.signature = signature(backup, config.keys[config.activeKeyId]);
  return seal(backup);
}
export function verifyProvenance(backup, config) {
  if (backup.format !== VERSION) fail('VERSION', 'Backup de outra geração não é compatível com esta instalação PG18.', 409);
  configuration(config);
  const manifest = backup.historicalReferences;
  const invalid = () => fail('HISTORY_PROOF', 'A autenticidade do backup não foi confirmada. Use o arquivo original e a configuração de origem correta.', 409);
  if (!manifest || manifest.version !== 1 || manifest.instanceId !== config.instanceId ||
      !Object.hasOwn(config.keys, manifest.keyId) || !/^[0-9a-f-]{36}$/.test(manifest.backupId) ||
      typeof manifest.signature !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.signature) ||
      canonical(Object.keys(manifest).sort()) !== canonical(['backupId', 'bindings', 'instanceId', 'keyId', 'signature', 'version']) ||
      !Array.isArray(manifest.bindings)) invalid();
  if (!timingSafeEqual(Buffer.from(manifest.signature, 'hex'), Buffer.from(signature(backup, config.keys[manifest.keyId]), 'hex'))) invalid();
  if (digest(manifest.bindings) !== digest(historicalBindings(backup))) invalid();
  return manifest.bindings;
}
