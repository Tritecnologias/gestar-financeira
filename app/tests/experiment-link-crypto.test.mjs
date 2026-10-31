import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';
import {sealExperimentToken,openExperimentToken,experimentTokenMatches,tokenFromOriginalExperimentLink} from '../src/lib/experiment-link-crypto.ts';
import {compatibleBackupMigrations,PRE_RETURN_HOMOLOG_MIGRATIONS as REQUIRED_MIGRATIONS,EXPERIMENT_LEDGER4,PRE_EXPERIMENT_MIGRATIONS} from '../src/lib/backup/schema-contract.mjs';
const env={SPECIAL_INVITATION_LINK_KEY_ID:'test-v1',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({'test-v1':randomBytes(32).toString('hex')})};
const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),id='synthetic-invitation';
test('AES-GCM recovers exact original with fresh nonce and never stores plaintext',()=>{
 const one=sealExperimentToken(token,id,hash,env),two=sealExperimentToken(token,id,hash,env);assert.notEqual(one,two);assert(!one.includes(token));assert.equal(openExperimentToken(one,id,hash,env),token);assert(experimentTokenMatches(token,hash));
});
test('tampering, wrong invite, wrong hash, absent/wrong key fail closed',()=>{
 const cipher=sealExperimentToken(token,id,hash,env),parts=cipher.split('.');parts[3]=(parts[3][0]==='a'?'b':'a')+parts[3].slice(1);
 for(const call of [()=>openExperimentToken(parts.join('.'),id,hash,env),()=>openExperimentToken(cipher,'different-id',hash,env),()=>openExperimentToken(cipher,id,'0'.repeat(64),env),()=>openExperimentToken(cipher,id,hash,{}),()=>openExperimentToken(cipher,id,hash,{...env,SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({'test-v1':'0'.repeat(64)})})])assert.throws(call,{status:503});
});
test('key rotation retains previous key without rewriting original tokens',()=>{
 const cipher=sealExperimentToken(token,id,hash,env),keys={...JSON.parse(env.SPECIAL_INVITATION_LINK_KEYS),'test-v2':randomBytes(32).toString('hex')},next={SPECIAL_INVITATION_LINK_KEY_ID:'test-v2',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify(keys)};
 assert.equal(openExperimentToken(cipher,id,hash,next),token);assert(sealExperimentToken(token,id,hash,next).startsWith('v1.test-v2.'));
});
test('legacy binding accepts only same-origin original opaque link',()=>{
 const origin='https://homolog.dezsolucoes.com.br',link=origin+'/experimentacao#convite='+token;assert.equal(tokenFromOriginalExperimentLink(link,origin),token);
 for(const other of [link.replace('homolog.','app.'),link.replace('/experimentacao','/login'),link.replace('#convite','?x=1#convite'),link+'&convite='+token,link.replace('https://','https://u:p@'),token])assert.equal(tokenFromOriginalExperimentLink(other,origin),null);
});
test('only exact approved ledger3/4 forward to ledger5; reverse and unknown rejected',()=>{
 const rows=list=>list.map(m=>({migration_name:m.name,checksum:m.sha256})),current=rows(REQUIRED_MIGRATIONS);
 for(const previous of [PRE_EXPERIMENT_MIGRATIONS,EXPERIMENT_LEDGER4,REQUIRED_MIGRATIONS])assert(compatibleBackupMigrations(rows(previous),current));
 assert(!compatibleBackupMigrations(current,rows(EXPERIMENT_LEDGER4)));assert(!compatibleBackupMigrations(current.map(m=>({...m,checksum:'0'.repeat(64)})),current));
});
