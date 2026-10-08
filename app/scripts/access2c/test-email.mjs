import assert from "node:assert/strict";
import test from "node:test";
import { invitationMessage, invitationUrl } from "../../src/lib/email-template.ts";

test("invitation URL uses configured public origin and keeps token in fragment", () => {
  const url = new URL(invitationUrl(new URL("https://example.invalid/"), "fixture-token"));
  assert.equal(url.origin, "https://example.invalid");
  assert.equal(url.pathname, "/ativar-acesso");
  assert.equal(url.search, "");
  assert.equal(url.hash, "#token=fixture-token");
});

test("invitation includes matching HTML and plain text without access details", () => {
  const link = "https://example.invalid/ativar-acesso#token=fixture-token";
  const message = invitationMessage("Empresa de Teste", link, new Date("2026-10-10T12:00:00Z"));
  assert.match(message.subject, /acesso ao 10S/);
  assert.match(message.text, /Empresa de Teste/);
  assert.match(message.text, /fixture-token/);
  assert.match(message.html, /Empresa de Teste/);
  assert.match(message.html, /fixture-token/);
  assert.doesNotMatch(message.text + message.html, /senha|perfil de acesso|OWNER|ADMIN/i);
});

test("tenant name is HTML-escaped and the link cannot inject markup", () => {
  const message = invitationMessage("<script>alert(1)</script>",
    "https://example.invalid/ativar-acesso#token=a\" onclick=\"evil", new Date());
  assert.doesNotMatch(message.html, /<script>|onclick="evil/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /&quot;/);
});
