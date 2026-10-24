import test from 'node:test';
import assert from 'node:assert/strict';
import { planIdentities } from '../scripts/schema-reconciliation/identity-plan.mjs';

const user = (overrides = {}) => ({ id: 'u1', email: 'person@example.invalid', tenantId: 't1', role: 'membro', active: true, tenantActive: true, authorship: 0, crossTenantAuthorship: 0, ...overrides });
test('unambiguous candidates still require human review and never imply grants', () => {
  const plan = planIdentities([user()]);
  assert.deepEqual(plan.groups[0].categories, ['A', 'E']);
  assert.equal(plan.writes, 0);
  assert.equal(plan.inferredMemberships + plan.inferredOwners + plan.inferredPlatformAdmins, 0);
});
test('normalization joins multiple tenants for review without merging their membership decisions', () => {
  const plan = planIdentities([user(), user({ id: 'u2', tenantId: 't2', email: ' PERSON@EXAMPLE.INVALID ' })]);
  assert.equal(plan.groups.length, 1);
  assert.deepEqual(plan.groups[0].categories, ['B', 'E']);
  assert.equal(plan.groups[0].users.length, 2);
});
test('same-tenant normalization collision and malformed email fail closed', () => {
  const plan = planIdentities([user(), user({ id: 'u2', email: ' PERSON@example.invalid ' }), user({ id: 'u3', email: 'invalid' })]);
  assert.equal(plan.summary.D, 2);
  assert.equal(plan.summary.A, 0);
});
test('administrators, inactive records and historical authorship are explicit review flags', () => {
  const plan = planIdentities([user({ role: 'admin_global', active: false, crossTenantAuthorship: 31 })]);
  assert.deepEqual(plan.groups[0].categories, ['C', 'E']);
  assert.ok(plan.groups[0].reasons.includes('PRESERVE_HISTORICAL_AUTHORSHIP'));
  assert.ok(plan.groups[0].reasons.includes('INACTIVE_USER_OR_TENANT'));
  assert.equal(plan.groups[0].users[0].crossTenantAuthorship, 31);
});
test('existing identity does not authorize overwrite, PlatformAdmin or financial membership', () => {
  const plan = planIdentities([user()], [{ email: 'person@example.invalid' }]);
  assert.deepEqual(plan.groups[0].categories, ['E']);
  assert.equal(plan.platformAdminImpliesTenantAccess, false);
  assert.deepEqual(plan.groups[0].proposedWrites, []);
});
test('report omits email, IDs, names, hashes and other private input fields', () => {
  const plan = planIdentities([user({ id: 'private-id', nome: 'private-name', senhaHash: 'private-hash' })]);
  const serialized = JSON.stringify(plan);
  for (const forbidden of ['person@example.invalid', 'private-id', 'private-name', 'private-hash']) assert.ok(!serialized.includes(forbidden));
  assert.equal(plan.groups[0].users[0].reference, 'U001');
});
