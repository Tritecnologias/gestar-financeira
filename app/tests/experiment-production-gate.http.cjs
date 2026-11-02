// Read-only HTTP proof against the LOCAL network-none worker, never the public host.
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3021', origin = 'https://app.dezsolucoes.com.br';
assert.equal(process.env.DEPLOYMENT_PROFILE, 'production');
assert.equal(process.env.ADMISSION_PRODUCTION_ENABLED, 'false');
assert.equal(process.env.EMAIL_PROVIDER, 'mock');
async function main() {
  const checks = [];
  // A synthetic, locally signed edge-session fixture exercises the disabled route
  // itself. This is not a production credential and cannot leave network-none.
  const { encode } = await import('next-auth/jwt');
  const signed = await encode({ token: { sub: 'synthetic-disabled-gate' }, secret: process.env.NEXTAUTH_SECRET, salt: 'authjs.session-token', maxAge: 60 });
  const landing = await fetch(base + '/experimentacao');
  assert.equal(landing.status, 200);
  const html = await landing.text();
  assert(html.includes('id="perguntas-frequentes"'));
  assert.equal((html.match(/<details/g) || []).length, 6);
  assert.equal((html.match(/href="https:\/\/app.dezsolucoes.com.br\/login"/g) || []).length, 3);
  checks.push('same build serves current Experimentation and existing-user login in production configuration');
  for (const route of ['/login', '/primeiro-acesso']) assert.equal((await fetch(base + route)).status, 200);
  const id = '11111111-1111-4111-8111-111111111111';
  for (const [route, methods] of [
    ['/adesao', ['GET']],
    ['/api/admissions/' + id, ['GET']],
    ...['verify', 'identity', 'provision'].map(action => ['/api/admissions/' + id + '/' + action, ['POST']]),
    ['/api/admissions/resume', ['POST']],
    ['/api/platform/experiment-invitations/' + id + '/admission', ['GET', 'POST', 'DELETE']],
  ]) {
    for (const method of methods) {
      const headers = { Origin: origin, 'Content-Type': 'application/json' };
      if (route.startsWith('/api/platform/')) {
        assert.equal((await fetch(base + route, { method, headers, ...(method === 'GET' ? {} : { body: '{}' }) })).status, 401, 'anonymous middleware denial');
        headers.Cookie = 'authjs.session-token=' + signed;
      }
      const r = await fetch(base + route, { method, headers, ...(method === 'GET' ? {} : { body: '{}' }) });
      assert.equal(r.status, 404, method + ' ' + route);
    }
  }
  checks.push('production disabled gate rejects page, resume, verification, identity, provisioning and administrative authorization');
  assert.equal((await fetch(base + '/api/lancamentos')).status, 401);
  checks.push('existing-user entry remains available and protected APIs require authentication');
  console.log(JSON.stringify({ state: 'PASSED', syntheticOnly: true, network: 'none', realEmail: false, checks }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
