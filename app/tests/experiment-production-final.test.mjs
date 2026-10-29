import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{ExperimentAbuseBudget}from'../src/lib/experiment-abuse-budget.ts';import{readExperimentBody}from'../src/lib/experiment-request-body.ts';
import{generateKeyPairSync,randomBytes}from'node:crypto';import{sealInvitationKeyring,recoverInvitationKeyring}from'../scripts/ops/invitation-key-escrow.mjs';
const request=body=>new Request('http://localhost/test',{method:'POST',headers:{'Content-Type':'application/json'},body});
test('JSON input bounded in bytes, with and without length; invalid input stays generic',async()=>{
 assert.equal((await readExperimentBody(request(JSON.stringify({recipientName:'á'.repeat(160)})))).recipientName.length,160);
 for(const body of ['x'.repeat(2049),'"'+'á'.repeat(1100)+'"'])await assert.rejects(readExperimentBody(request(body)),{status:413});
 let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(2049));},cancel(){cancelled=true;}});
 await assert.rejects(readExperimentBody(new Request('http://localhost/test',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})),{status:413});assert(cancelled);
 for(const body of ['{','[]','null',new Uint8Array([255])])await assert.rejects(readExperimentBody(request(body)),{status:400});
 await assert.rejects(readExperimentBody(new Request('http://localhost/test',{method:'POST',body:'{}'})),{status:415});
});
test('abuse limits isolate verified clients and tokens; anonymous users do not share an IP quota',()=>{
 const b=new ExperimentAbuseBudget();for(let i=0;i<120;i++)assert(b.request('ip-one',1));assert(!b.request('ip-one',2));assert(b.request('ip-two',2));assert(b.request('ip-one',300002));
 const anon=new ExperimentAbuseBudget();for(let i=0;i<600;i++)assert(anon.request(null,1));assert(!anon.request(null,2));assert(anon.request(null,60002));
 const tokens=new ExperimentAbuseBudget();for(let i=0;i<40;i++)assert(tokens.token('a',1));assert(!tokens.token('a',2));assert(tokens.token('b',2));assert(tokens.token('a',300002));
 const bounded=new ExperimentAbuseBudget(1);assert(bounded.token('a',1));assert(!bounded.token('b',2));assert(bounded.token('b',300002));
});
test('portable custody recovers exact keyring; wrong recipient, weak key and tampering fail closed',()=>{
 const recovery=generateKeyPairSync('rsa',{modulusLength:3072}),pem={public:recovery.publicKey.export({type:'spki',format:'pem'}),private:recovery.privateKey.export({type:'pkcs8',format:'pem'})};
 const ring={activeId:'synthetic-prod-v2',keys:{'synthetic-prod-v1':randomBytes(32).toString('hex'),'synthetic-prod-v2':randomBytes(32).toString('hex')}},envelope=sealInvitationKeyring(ring,pem.public);
 assert.deepEqual(recoverInvitationKeyring(envelope,pem.private),ring);for(const key of Object.values(ring.keys))assert(!JSON.stringify(envelope).includes(key));
 for(const field of ['format','recipientSha256','wrappedKey','iv','ciphertext','tag'])assert.throws(()=>recoverInvitationKeyring({...envelope,[field]:'x'+envelope[field]},pem.private),/Custódia indisponível/);
 const wrong=generateKeyPairSync('rsa',{modulusLength:3072});assert.throws(()=>recoverInvitationKeyring(envelope,wrong.privateKey.export({type:'pkcs8',format:'pem'})),/Custódia indisponível/);
 const weak=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>sealInvitationKeyring(ring,weak.publicKey.export({type:'spki',format:'pem'})),/Custódia indisponível/);
 assert.throws(()=>sealInvitationKeyring({...ring,keys:{bad:'not-a-key'}},pem.public),/Custódia indisponível/);
});
test('release keeps platform-only entry, same-origin guard and environment-selected favicons',()=>{
 const page=readFileSync('src/app/experimentacao/route.ts','utf8'),link=readFileSync('src/app/api/platform/experiment-invitations/[id]/link/route.ts','utf8'),api=readFileSync('src/app/api/experimentacao/route.ts','utf8');
 assert(page.includes('environmentIconPaths(homolog)'));assert(page.includes('replace(/\\s*<link rel="icon"'));assert(page.includes("connect-src 'self'"));
 assert(link.includes('`${origin}/experimentacao#convite=${token}`'));assert(!link.includes('surface.origin'));assert(api.includes('experimentSameOrigin(req)'));assert(!api.includes('Access-Control-Allow-Origin'));
 assert(!readFileSync('public/experimentacao/pilot.js','utf8').includes('Experiência de HOMOLOG'));
});
