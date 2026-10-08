import test from "node:test";
import assert from "node:assert/strict";
import { buildPlatformAdminPlan } from "../scripts/access3b/analysis.mjs";

const tenant = { ativo: true };
const user = (id, overrides = {}) => ({
  id, tenantId: "tenant-a", tenant, nome: "Admin fixture", email: `${id}@example.invalid`,
  senhaHash: "hash-fixture", papel: "admin_global", ativo: true, ...overrides,
});

test("global seguro cria identidade e PlatformAdmin sem membership", () => {
  const plan = buildPlatformAdminPlan([user("one")], [], []);
  assert.equal(plan.report.safeCreate, 1);
  assert.equal(plan.safeCreate[0].status, "ACTIVE");
  assert.equal(plan.report.existingMemberships, 0);
});

test("usuário ou tenant inativo não ganha PlatformAdmin ativo", () => {
  const plan = buildPlatformAdminPlan([
    user("inactive", { ativo: false }),
    user("tenant-inactive", { tenant: { ativo: false } }),
  ], [], []);
  assert.deepEqual(plan.safeCreate.map(item => item.status), ["INACTIVE", "INACTIVE"]);
});

test("email duplicado ou identidade sem mapping explícito exige revisão", () => {
  const global = user("one");
  const duplicate = user("other", { papel: "admin", email: " ONE@example.invalid " });
  assert.equal(buildPlatformAdminPlan([global, duplicate], [], []).report.manualReview, 1);
  assert.equal(buildPlatformAdminPlan([global], [{ id: "identity", email: global.email }], [])
    .report.manualReview, 1);
});

test("mapping de plataforma íntegro é reconhecido no rerun", () => {
  const global = user("one");
  const platform = { id: "platform", identityId: "identity", status: "ACTIVE" };
  const identity = { id: "identity", email: global.email, nome: global.nome,
    senhaHash: global.senhaHash, status: "ACTIVE", platformAdmin: platform, memberships: [{ id: "business" }] };
  const map = { legacyUsuarioId: global.id, tenantId: global.tenantId,
    identityId: identity.id, membershipId: null, platformAdminId: platform.id, identity };
  const result = buildPlatformAdminPlan([global], [identity], [map]);
  assert.equal(result.report.alreadyMapped, 1);
  assert.equal(result.report.existingMemberships, 1);
});

test("mapping empresarial indevido ou divergente não é corrigido silenciosamente", () => {
  const global = user("one");
  const identity = { id: "identity", email: global.email, nome: global.nome,
    senhaHash: global.senhaHash, status: "ACTIVE", platformAdmin: null };
  const map = { legacyUsuarioId: global.id, tenantId: global.tenantId,
    identityId: identity.id, membershipId: "business", platformAdminId: null, identity };
  assert.equal(buildPlatformAdminPlan([global], [identity], [map]).report.conflict, 1);
});
