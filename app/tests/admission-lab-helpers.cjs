// Test-only adapter for the disposable A.2 laboratory. No production fallback.
const assert = require('node:assert/strict');
function admissionLab(cfg) {
  if (!['ADMISSION_LOCAL','ADMISSION_REGRESSION_LOCAL'].includes(cfg.environment)) return false;
  const regression=cfg.environment==='ADMISSION_REGRESSION_LOCAL';
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.href, regression?'postgresql://a2_runtime@127.0.0.1:55432/gestar_vf_dev':'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab');
  assert.equal(cfg.base, regression?'http://localhost:3017':'http://localhost:3020');
  assert.equal(process.env.ADMISSION_LAB_ENABLED, regression?'false':'true');
  assert.equal(process.env.DEPLOYMENT_PROFILE, 'local');
  assert.equal(process.env.EMAIL_PROVIDER, regression?'disabled':'mock');
  assert.match(process.env.TRUSTED_PROXY_TOKEN, /^[a-f0-9]{64}$/);
  return true;
}
const clients = new WeakMap(); let next = 1;
function labHeaders(cfg, jar, group) {
  if (!admissionLab(cfg)) return {};
  if (!clients.has(jar)) clients.set(jar, next++);
  // Real middleware authenticates this synthetic proxy evidence; limits remain enabled.
  return { 'x-10s-proxy-token': process.env.TRUSTED_PROXY_TOKEN, 'x-real-ip': `198.18.${group}.${clients.get(jar)}` };
}
module.exports = { admissionLab, labHeaders };
