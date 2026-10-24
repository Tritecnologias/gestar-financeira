import test from 'node:test';
import assert from 'node:assert/strict';
import { withAccessRequest, accessRequestContext } from '../src/lib/access-request-context.ts';

test('parallel requests keep separate audit correlation; logs omit request secrets', async () => {
  const logs=[],original=console.info;console.info=v=>logs.push(JSON.parse(v));
  try {
    const handler=withAccessRequest('invite-test', async (tenant, secret) => {
      accessRequestContext(tenant);
      await new Promise(r=>setTimeout(r,tenant==='A'?10:1));
      return Response.json({ tenant:accessRequestContext().tenantId },{status:tenant==='A'?201:400});
    });
    const [a,b]=await Promise.all([handler('A','secret-A'),handler('B','secret-B')]);
    assert.equal((await a.json()).tenant,'A');assert.equal((await b.json()).tenant,'B');
    assert.notEqual(a.headers.get('X-Request-Id'),b.headers.get('X-Request-Id'));
    assert.equal(logs.length,2);assert.ok(logs.every(l=>/^[0-9a-f-]{36}$/.test(l.requestId)));
    assert.equal(logs.find(l=>l.tenantId==='A').result,'SUCCESS');
    assert.equal(logs.find(l=>l.tenantId==='B').result,'FAILURE');
    assert.ok(!JSON.stringify(logs).includes('secret-'));assert.equal(accessRequestContext(),undefined);
  }finally{console.info=original}
});

test('unexpected failure logs only safe metadata', async () => {
  const logs=[],original=console.info;console.info=v=>logs.push(JSON.parse(v));
  try {
    const handler=withAccessRequest('invite-test',async()=>{throw Error('private-token')});
    await assert.rejects(handler(),/private-token/);
    assert.equal(logs[0].status,500);assert.ok(!JSON.stringify(logs).includes('private-token'));
  }finally{console.info=original}
});
