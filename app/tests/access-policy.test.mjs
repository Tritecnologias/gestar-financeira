import test from "node:test";
import assert from "node:assert/strict";
import {
  canAssignLegacyRole,
  canManageLegacyUser,
  canUseActiveTenant,
  isActiveLegacySession,
  tenantOverrideCookieOptions,
} from "../src/lib/access-policy.ts";

test("inativo, tenant inativo e tenant ausente não mantêm sessão", () => {
  assert.equal(isActiveLegacySession(null), false);
  assert.equal(isActiveLegacySession({ ativo: false, tenant: { ativo: true } }), false);
  assert.equal(isActiveLegacySession({ ativo: true, tenant: { ativo: false } }), false);
  assert.equal(isActiveLegacySession({ ativo: true }), false);
  assert.equal(isActiveLegacySession({ ativo: true, tenant: { ativo: true } }), true);
});

test("admin do tenant não administra admin global nem outro tenant", () => {
  const admin = { papel: "admin", tenantId: "A" };
  assert.equal(canManageLegacyUser(admin, { papel: "membro", tenantId: "A" }), true);
  assert.equal(canManageLegacyUser(admin, { papel: "admin_global", tenantId: "A" }), false);
  assert.equal(canManageLegacyUser(admin, { papel: "membro", tenantId: "B" }), false);
  assert.equal(canAssignLegacyRole("admin", "admin_global"), false);
  assert.equal(canAssignLegacyRole("admin", "admin"), true);
  assert.equal(canUseActiveTenant("admin", "A", "B", true), false);
  assert.equal(canUseActiveTenant("admin", "A", "A", false), false);
});

test("admin global legado não opera em outro tenant", () => {
  const global = { papel: "admin_global", tenantId: "A" };
  assert.equal(canManageLegacyUser(global, { papel: "admin_global", tenantId: "B" }), false);
  assert.equal(canAssignLegacyRole(global.papel, "admin_global"), false);
  assert.equal(canUseActiveTenant(global.papel, "A", "B", true), false);
  assert.equal(canUseActiveTenant(global.papel, "A", "A", true), true);
  assert.equal(canUseActiveTenant(global.papel, "A", "B", false), false);
});

test("cookie de override usa proteção de produção", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.deepEqual(tenantOverrideCookieOptions(), {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 8 * 60 * 60, path: "/",
    });
    process.env.NODE_ENV = "development";
    assert.equal(tenantOverrideCookieOptions().secure, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
