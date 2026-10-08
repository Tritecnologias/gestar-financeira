import test from "node:test";
import assert from "node:assert/strict";
import { buildAccess2Plan } from "../scripts/access2/analysis.mjs";

const tenant = { id: "A", ativo: true };
const user = (id, overrides = {}) => ({
  id, tenantId: "A", tenant, nome: "Pessoa Teste", email: `${id}@example.invalid`,
  senhaHash: "hash-test", papel: "admin", ativo: true, ...overrides,
});

test("email único e completo gera candidato seguro com role e estado preservados", () => {
  const result = buildAccess2Plan([user("one", { email: " ONE@EXAMPLE.INVALID " })], [], []);
  assert.equal(result.report.safe, 1);
  assert.deepEqual({ email: result.safe[0].email, role: result.safe[0].role, status: result.safe[0].status },
    { email: "one@example.invalid", role: "ADMIN", status: "ACTIVE" });
});

test("email repetido jamais une usuários automaticamente", () => {
  const a = user("A", { email: "same@example.invalid" });
  const b = user("B", { email: " SAME@example.invalid ", tenantId: "B", tenant: { id: "B", ativo: true } });
  const manual = buildAccess2Plan([a, b], [], []);
  assert.equal(manual.report.safe, 0);
  assert.equal(manual.report.manualReview, 2);
  const conflict = buildAccess2Plan([a, { ...b, senhaHash: "different" }], [], []);
  assert.equal(conflict.report.safe, 0);
  assert.equal(conflict.report.conflict, 2);
  assert.equal(conflict.report.repeatedEmailGroups.differentHashes, 1);
  const divergent = buildAccess2Plan([a, { ...b, nome: "Outro Nome", ativo: false, papel: "membro" }], [], []);
  assert.equal(divergent.report.repeatedEmailGroups.differentNames, 1);
  assert.equal(divergent.report.repeatedEmailGroups.differentStates, 1);
  assert.equal(divergent.report.repeatedEmailGroups.differentRoles, 1);
});

test("admin global, dados incompletos e colisão existente não viram membership", () => {
  const users = [
    user("global", { papel: "admin_global" }),
    user("missing", { senhaHash: "" }),
    user("existing"),
  ];
  const result = buildAccess2Plan(users, [{ id: "identity", email: "existing@example.invalid" }], []);
  assert.deepEqual([result.report.safe, result.report.manualReview, result.report.incomplete], [0, 2, 1]);
  assert.equal(result.report.dataQuality.missingHash, 1);
  assert.equal(result.report.dataQuality.existingIdentityCollision, 1);
});

test("mapping explícito íntegro torna rerun idempotente; drift vira conflito", () => {
  const original = user("one");
  const map = {
    legacyUsuarioId: original.id, identityId: "identity", tenantId: "A", membershipId: "membership",
    platformAdminId: null,
    identity: { id: "identity", email: "one@example.invalid", nome: original.nome,
      senhaHash: original.senhaHash, status: "ACTIVE" },
    membership: { id: "membership", identityId: "identity", tenantId: "A", status: "ACTIVE", role: "ADMIN" },
  };
  const first = buildAccess2Plan([original], [{ id: "identity", email: "one@example.invalid" }], [map]);
  assert.equal(first.report.alreadyMapped, 1);
  assert.equal(first.report.safe, 0);
  const changed = buildAccess2Plan([{ ...original, papel: "membro" }], [{ id: "identity", email: "one@example.invalid" }], [map]);
  assert.equal(changed.report.conflict, 1);
});
