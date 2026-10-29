// LOCAL synthetic laboratory only; never reads a secret file or accepts a remote database.
import assert from 'node:assert/strict';import {Pool} from 'pg';import {createBackup,previewRestore,restoreBackup} from '../src/lib/backup/engine.mjs';import {signingConfig,authenticateBackup} from '../src/lib/backup/provenance.mjs';import {digest} from '../src/lib/backup/format.mjs';import {openExperimentToken,experimentTokenMatches} from '../src/lib/experiment-link-crypto.ts';import {randomUUID} from 'node:crypto';
let input='';for await(const part of process.stdin)input+=part;const cfg=JSON.parse(input);input='';
const u=new URL(process.env.DATABASE_URL);assert(u.hostname==='127.0.0.1'&&u.pathname==='/special_invite_lab');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),checks=[];const ok=(n,v)=>{assert(v,n);checks.push(n);};
try{
 const q=(s,a=[])=>pool.query(s,a);
 const c=(await q("SELECT m.tenant_id,m.identity_id,m.id FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id JOIN tenant_contractual_responsibles r ON r.membership_id=m.id AND r.tenant_id=m.tenant_id WHERE t.nome='LOCAL PILOTO CONTRATUAL' AND m.role='OWNER' AND m.status='ACTIVE' LIMIT 1")).rows[0];assert(c);
 const ctx={tenantId:c.tenant_id,identityId:c.identity_id,membershipId:c.id},config={sourceCommit:'LOCAL-FOLLOWUP',termDir:cfg.termDir,backupDir:cfg.backupDir,signing:signingConfig(cfg.backupEnv)};
 const state=async()=>digest((await q('SELECT to_jsonb(t) j FROM experiment_invitations t ORDER BY id')).rows);
 const before=await state(),backup=await createBackup(pool,ctx,config);ok('current tenant backup ledger5 excludes global token data',backup.migrations.length===5&&!backup.sections.experiment_invitations&&!JSON.stringify(backup).includes('encrypted_token'));
 for(const version of [3,4]){const {checksum,historicalReferences,...body}=structuredClone(backup);body.migrations=body.migrations.slice(0,version);const old=authenticateBackup(body,config.signing),preview=await previewRestore(pool,ctx,old,config);await restoreBackup(pool,ctx,old,config,preview.currentDigest,randomUUID());ok('authentic ledger'+version+' restore to ledger5',true);ok('global invitations unchanged after restore '+version,before===await state());}
 const row=(await q("SELECT id,token_hash,encrypted_token FROM experiment_invitations WHERE encrypted_token IS NOT NULL AND recipient_name LIKE 'PILOTO QA%' LIMIT 1")).rows[0];assert(row);const token=openExperimentToken(row.encrypted_token,row.id,row.token_hash,cfg.recoveredKeyEnv);ok('separate recovered key decrypts original and validates hash',experimentTokenMatches(token,row.token_hash));
 ok('common business backup excludes encryption key',!Object.values(JSON.parse(cfg.recoveredKeyEnv.SPECIAL_INVITATION_LINK_KEYS)).some(key=>JSON.stringify(backup).includes(key)));
 console.log(JSON.stringify({state:'EXPERIMENT_BACKUP_RECOVERY_LAB_PASSED',checks}));
}catch(e){console.log(JSON.stringify({state:'EXPERIMENT_BACKUP_RECOVERY_LAB_FAILED',error:e.name,check:e.message,code:e.code}));process.exitCode=1;}finally{await pool.end();}
