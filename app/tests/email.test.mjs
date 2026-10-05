import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, emailEqualsNormalized, unambiguousLegacyAccount } from "../src/lib/email.ts";

test("criação, edição, consulta e login compartilham normalização", () => {
  assert.equal(normalizeEmail("  Pessoa@EXEMPLO.COM  "), "pessoa@exemplo.com");
  assert.deepEqual(emailEqualsNormalized("  Pessoa@EXEMPLO.COM  "), {
    equals: "pessoa@exemplo.com", mode: "insensitive",
  });
});

test("login legado não escolhe arbitrariamente entre contas de tenants diferentes", () => {
  assert.equal(unambiguousLegacyAccount([]), null);
  assert.deepEqual(unambiguousLegacyAccount([{ id: "A" }]), { id: "A" });
  assert.equal(unambiguousLegacyAccount([{ id: "A" }, { id: "B" }]), null);
});
