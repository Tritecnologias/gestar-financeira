import test from 'node:test';import assert from 'node:assert/strict';
import {selectExperimentInvitations as select} from '../src/lib/experiment-admin-list.ts';
const now=Date.parse('2026-10-29T12:00:00Z');
const item=(id,name,status='ACTIVE',interestAt=null,expiresAt='2026-11-01T12:00:00Z')=>({id,recipientName:name,status,interestAt,expiresAt,createdAt:'2026-10-29T10:00:00Z',revokedAt:status==='REVOKED'?'2026-10-29T11:00:00Z':null,viewedAt:null,acknowledgedAt:null,linkRecoverable:true,canCopyLink:status==='ACTIVE'});
const rows=[item('canceled-first','Bruno cancelado','REVOKED','2026-10-29T11:00:00Z'),item('abcd1234-5678','Lourenço'),item('expired','Bruno expirado','ACTIVE',null,'2026-10-29T11:30:00Z'),item('interested','Bruno ativo','ACTIVE','2026-10-29T11:00:00Z'),item('canceled-last','Bruno sem interesse','REVOKED')];
test('search matches normalized recipient and partial/full reference; does not mutate input',()=>{
 assert.deepEqual(select(rows,'  LOURENCO ','ALL','ALL',now).map(r=>r.id),['abcd1234-5678']);
 assert.deepEqual(select(rows,'1234-5678','ALL','ALL',now).map(r=>r.id),['abcd1234-5678']);
 assert.equal(rows[0].id,'canceled-first');assert.equal(rows[2].status,'ACTIVE');
});
test('situation and interest are independent and combine with search',()=>{
 assert.deepEqual(select(rows,'Bruno','REVOKED','REGISTERED',now).map(r=>r.id),['canceled-first']);
 assert.deepEqual(select(rows,'Bruno','REVOKED','WAITING',now).map(r=>r.id),['canceled-last']);
 assert.deepEqual(select(rows,'','EXPIRED','WAITING',now).map(r=>r.id),['expired']);
 assert.deepEqual(select(rows,'Bruno','ACTIVE','REGISTERED',now).map(r=>r.id),['interested']);
 assert.equal(select(rows,'missing','ALL','ALL',now).length,0);
});
test('cancelled items stay at the end and newest-first server order is stable within groups',()=>{
 assert.deepEqual(select(rows,'','ALL','ALL',now).map(r=>r.id),['abcd1234-5678','expired','interested','canceled-first','canceled-last']);
});
test('expiry immediately disables recovery without erasing interest or masking cancellation',()=>{
 const r=select([item('a','A','ACTIVE','2026-10-29T11:00:00Z','2026-10-29T12:00:00Z'),item('b','B','REVOKED',null,'2026-10-29T11:00:00Z')],'','ALL','ALL',now);
 assert.equal(r[0].status,'EXPIRED');assert.equal(r[0].canCopyLink,false);assert(r[0].interestAt);assert.equal(r[1].status,'REVOKED');assert.equal(r[1].canCopyLink,false);
});
