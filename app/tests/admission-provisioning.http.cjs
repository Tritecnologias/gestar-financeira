// Real built Next + Prisma + PG18, exclusively in the disposable network-none A.2 lab.
const assert = require('node:assert/strict');
const {randomUUID,randomBytes,createHash,createDecipheriv} = require('node:crypto');
const {readFile,writeFile,mkdir} = require('node:fs/promises');
const {Pool} = require('pg');
const {PrismaClient} = require('@prisma/client');
const {PrismaPg} = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
const {admissionLab,labHeaders} = require('./admission-lab-helpers.cjs');
const cfg={environment:'ADMISSION_LOCAL',base:'http://localhost:3020',password:'Synthetic-only-A23-password!',expectedMigrationCount:8};
assert(admissionLab(cfg));
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const fixture=new Pool({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab'});
const runtime=new Pool({connectionString:process.env.DATABASE_URL});
const checks=[],secrets=[cfg.password,'Synthetic-only-A22-password!'];
const pass=(name,value=true)=>{assert(value,name);checks.push(name);console.log('PASS '+name);};
const sql=(text,values=[])=>fixture.query(text,values),one=async(text,values)=>(await sql(text,values)).rows[0];
const jar=()=>new Map(), clone=j=>new Map([...j].map(([k,v])=>[k,{...v}]));
async function q(j,path,method='GET',body,options={}){
  const headers={Origin:options.origin??cfg.base,...labHeaders(cfg,j,23),
    Cookie:[...j].filter(([,v])=>path.startsWith(v.path)).map(([k,v])=>k+'='+v.value).join('; '),
    ...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'}),...options.headers};
  const r=await fetch(cfg.base+path,{method,headers,redirect:'manual',...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
  if(options.save!==false)for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],n=pair.indexOf('=');j.set(pair.slice(0,n),{value:pair.slice(n+1),path:/;\s*Path=([^;]+)/i.exec(c)?.[1]||'/'});}
  return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
}
async function login(j,email,password=cfg.password){
  const c=await q(j,'/api/auth/csrf');
  const r=await q(j,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password,callbackUrl:cfg.base+'/adesao'}));
  assert.notEqual(r.status,429,'real login rate limit');
  const user=(await q(j,'/api/auth/session')).body.user;assert(user?.id,'real Credentials session');return user;
}
let hash,admin,adminJar=jar(),step="start";
async function actor(label){
  const identity=await p.authIdentity.create({data:{email:`a23-${label}-${randomUUID()}@example.invalid`,nome:'SINTETICO A23 '+label,senhaHash:hash}});
  const j=jar(),session=await login(j,identity.email);return {identity,j,session};
}
async function approval(email){
  const invitation=await p.experimentInvitation.create({data:{recipientName:'SINTETICO A23',tokenHash:createHash('sha256').update(randomBytes(32)).digest('hex'),
    createdByIdentityId:admin.id,expiresAt:new Date(Date.now()+24*3600000),interestAt:new Date()}});
  const r=await q(adminJar,`/api/platform/experiment-invitations/${invitation.id}/admission`,'POST',{email});
  assert.equal(r.status,201,'administrative authorization');assert.equal(r.body.delivery,'SIMULATED','synthetic encrypted transport');
  return {id:r.body.id,invitationId:invitation.id,email};
}
async function verify(g,j){
  const challenge=await p.admissionChallenge.findFirstOrThrow({where:{admissionId:g.id},orderBy:{issuedAt:'desc'}});
  const encoded=await readFile('/tmp/a2-mail/'+challenge.id+'.mail','utf8'),data=Buffer.from(encoded,'base64url');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),data.subarray(0,12));
  cipher.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));cipher.setAuthTag(data.subarray(12,28));
  const mail=JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
  const params=new URLSearchParams(new URL(/http:\/\/localhost:3020\/adesao#[^\s]+/.exec(mail.text)[0]).hash.slice(1));
  const token=params.get('token');secrets.push(token);
  assert.equal((await q(j,`/api/admissions/${g.id}/verify`,'POST',{challengeId:challenge.id,token})).status,200,'email verification');
  return challenge.id;
}
const path=g=>`/api/admissions/${g.id}/provision`;
const provision=(g,j,body={nome:'EMPRESA SINTETICA A23'},options={})=>q(j,path(g),'POST',body,options);
async function ready(label){const a=await actor(label),g=await approval(a.identity.email);await verify(g,a.j);return {...a,g};}
const tables=['tenants','access_profiles','tenant_memberships','usuarios','legacy_user_access_maps','access_owner_events','audit_events','admissions','admission_challenges','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding'];
async function digest(names=tables){const result={};for(const table of names)result[table]=(await one(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) hash FROM ${table} t`)).hash;return result;}
async function aclDigest(){return (await one(`SELECT md5(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text)) hash
  FROM information_schema.column_privileges t WHERE table_schema='public' AND grantee='a2_runtime'`)).hash;}
async function age(g,seconds){
  const c=await fixture.connect();try{await c.query('BEGIN');
    await c.query(`UPDATE admissions SET authorized_at=authorized_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second',
      email_verified_at=email_verified_at-$2*interval '1 second',provisioned_at=provisioned_at-$2*interval '1 second' WHERE id=$1`,[g.id,seconds]);
    await c.query(`UPDATE admission_challenges SET issued_at=issued_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second',
      consumed_at=consumed_at-$2*interval '1 second',last_attempt_at=last_attempt_at-$2*interval '1 second',revoked_at=revoked_at-$2*interval '1 second' WHERE admission_id=$1`,[g.id,seconds]);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function deniedCase(label,mutate,expected=409){
  const a=await ready(label);await mutate(a);const before=await digest();
  const r=await provision(a.g,a.j);pass(label+' denied',r.status===expected);assert.deepEqual(await digest(),before);pass(label+' creates no partial records');return a;
}
async function main(){
  step="hash";hash=await bcrypt.hash(cfg.password,12);
  step='admin read';admin=await p.authIdentity.findUniqueOrThrow({where:{email:'a22-admin@example.invalid'}});
  step='admin login';await login(adminJar,admin.email,'Synthetic-only-A22-password!');step='term fixtures';
  // Prepare fresh, explicitly synthetic PDF versions for this disposable regression database.
  // Existing receipts and document bytes are retained; only their synthetic publication is superseded.
  await mkdir(process.env.TERM_STORAGE_DIR,{recursive:true});await mkdir(process.env.TENANT_BACKUP_DIR,{recursive:true});
  const receiptsBefore=await digest(['term_acceptances']);
  for(const documentId of ['doc-u','doc-c']){
    const data=require('./synthetic-pdf.cjs')(),key=randomUUID()+'.pdf';
    await writeFile(process.env.TERM_STORAGE_DIR+'/'+key,data,{mode:0o600});
    const c=await fixture.connect();try{await c.query('BEGIN');
      await c.query("UPDATE term_versions SET status='RETIRED' WHERE document_id=$1 AND status='PUBLISHED'",[documentId]);
      await c.query(`INSERT INTO term_versions(id,document_id,version,title,storage_key,mime_type,byte_size,sha256,status,published_at,published_by_identity_id)
        VALUES($1,$2,'synthetic-a23','SINTETICO A23 SEM VALOR CONTRATUAL',$3,'application/pdf',$4,$5,'PUBLISHED',now(),$6)`,
      [randomUUID(),documentId,key,data.length,createHash('sha256').update(data).digest('hex'),admin.id]);await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  assert.deepEqual(await digest(['term_acceptances']),receiptsBefore);pass('synthetic PDF fixtures preserve all prior receipts');
  const ledger=await digest(['_prisma_migrations']);
  const originalAcl=await aclDigest();
  const oldTenants=JSON.stringify(await p.tenant.findMany({where:{id:{in:['tenant-a','tenant-b']}},include:{memberships:true,usuarios:true}}));
  const acl=await runtime.query(`SELECT current_user role,has_schema_privilege(current_user,'public','CREATE') ddl,
    has_column_privilege(current_user,'admissions','status','UPDATE') transition,
    has_column_privilege(current_user,'admissions','authorized_email','UPDATE') email,
    has_column_privilege(current_user,'admissions','authorized_by_identity_id','UPDATE') issuer,
    has_table_privilege(current_user,'admissions','DELETE') del,has_table_privilege(current_user,'_prisma_migrations','INSERT') ledger,
    has_table_privilege(current_user,'audit_events','UPDATE') audit_update,has_table_privilege(current_user,'term_acceptances','UPDATE') receipt_update`);
  pass('minimum existing runtime ACL unchanged',acl.rows[0].role==='a2_runtime'&&acl.rows[0].transition&&['ddl','email','issuer','del','ledger','audit_update','receipt_update'].every(k=>!acl.rows[0][k]));
  await assert.rejects(runtime.query("UPDATE admissions SET authorized_email='tampered@example.invalid' WHERE false"),{code:'42501'});
  pass('actual SQL rejects runtime email rewriting');
  const manualName='SINTETICO MANUAL A23 '+randomUUID();
  const manual=await q(adminJar,'/api/tenants','POST',{nome:manualName,email:'  MANUAL@example.invalid ',plano:'anual'});
  pass('shared tenant primitive preserves manual administrative response',manual.status===201&&manual.body.nome===manualName&&manual.body.email==='manual@example.invalid'&&manual.body.plano==='anual'&&Object.keys(manual.body).sort().join(',')==='email,id,nome,plano,slug');
  pass('manual creation does not automatically assign OWNER',await p.tenantMembership.count({where:{tenantId:manual.body.id}})===0);
  pass('manual duplicate slug still rejected',(await q(adminJar,'/api/tenants','POST',{nome:manualName,email:'other@example.invalid'})).status===409);

  const existing=await actor('existing'),other=await actor('other');
  // Coherent prior synthetic memberships, established before provisioning; credentials are the same verifier.
  const prior=[];
  for(let n=0;n<2;n++){
    const tenant=await p.tenant.create({data:{nome:'SINTETICO ANTERIOR '+n,slug:'a23-prior-'+randomUUID(),email:existing.identity.email,escolhaModalidadePendente:false}});
    const profile=await p.accessProfile.create({data:{tenantId:tenant.id,nome:'ANTERIOR',permissoes:['fluxo.lancamentos.view']}});
    const m=await p.tenantMembership.create({data:{tenantId:tenant.id,identityId:existing.identity.id,role:'MEMBER',profileId:profile.id}});
    const u=await p.usuario.create({data:{tenantId:tenant.id,nome:existing.identity.nome,email:existing.identity.email,senhaHash:hash}});
    await p.legacyUserAccessMap.create({data:{tenantId:tenant.id,identityId:existing.identity.id,membershipId:m.id,legacyUsuarioId:u.id}});prior.push(tenant.id);
  }
  const priorBefore=JSON.stringify(await p.tenantMembership.findMany({where:{identityId:existing.identity.id},orderBy:{id:'asc'}}));
  const identityBefore=await p.authIdentity.findUniqueOrThrow({where:{id:existing.identity.id}}),g=await approval(existing.identity.email);
  pass('anonymous cannot provision',(await provision(g,jar())).status===401);
  pass('authenticated matching identity without mail proof denied',(await provision(g,existing.j)).status===401);
  await verify(g,existing.j);
  const wrong=clone(other.j);wrong.set('dez-admission-'+g.id,existing.j.get('dez-admission-'+g.id));
  pass('valid proof cannot authorize a different logged-in identity',(await provision(g,wrong)).status===403);
  pass('cross-origin provisioning denied',(await provision(g,existing.j,undefined,{origin:'https://evil.invalid'})).status===403);
  for(const field of ['email','identityId','tenantId','role','status','authorizedByAdminId'])pass('browser cannot choose '+field,(await provision(g,existing.j,{nome:'SINTETICO', [field]:field==='role'?'OWNER':'forged'})).status===400);
  for(const name of ['support_context','advisory_context']){const j=clone(existing.j);j.set(name,{value:'forged-context',path:'/'});pass(name+' forbidden',(await provision(g,j)).status===403);}
  pass('name is bounded',(await provision(g,existing.j,{nome:'a'.repeat(161)})).status===400);
  const simultaneous=await Promise.all(Array.from({length:8},()=>provision(g,clone(existing.j))));
  pass('eight real HTTP requests all converge',simultaneous.every(r=>[200,201].includes(r.status)));
  pass('exactly one transaction creates tenant',simultaneous.filter(r=>r.status===201&&r.body.created).length===1&&new Set(simultaneous.map(r=>r.body.tenantId)).size===1);
  const result=simultaneous[0].body;assert(result.tenantId&&result.membershipId);
  const replay=await provision(g,existing.j,{nome:'REPETICAO NAO RENOMEIA'});
  pass('replay returns same committed ids and timestamp',replay.status===200&&!replay.body.created&&replay.body.tenantId===result.tenantId&&replay.body.membershipId===result.membershipId&&replay.body.provisionedAt===result.provisionedAt);
  pass('handoff uses current existing tenant-context cookie and onboarding path',replay.body.nextPath==='/onboarding'&&decodeURIComponent(existing.j.get('tenant_context').value)===`${existing.identity.id}:${existing.session.loginNonce}:${result.tenantId}`&&replay.headers.get('cache-control').includes('no-store'));
  const stored=await p.admission.findUniqueOrThrow({where:{id:g.id}});
  const tenant=await p.tenant.findUniqueOrThrow({where:{id:result.tenantId}}),membership=await p.tenantMembership.findUniqueOrThrow({where:{id:result.membershipId}});
  const profile=await p.accessProfile.findUniqueOrThrow({where:{id:membership.profileId}}),mapping=await p.legacyUserAccessMap.findFirstOrThrow({where:{membershipId:membership.id}});
  const usuario=await p.usuario.findUniqueOrThrow({where:{id:mapping.legacyUsuarioId}});
  pass('Admission final result exact and owner active',stored.status==='PROVISIONED'&&stored.identityId===existing.identity.id&&stored.tenantId===tenant.id&&stored.membershipId===membership.id&&membership.role==='OWNER'&&membership.status==='ACTIVE');
  pass('tenant remains trial with pending PF/PJ and original first name',tenant.plano==='trial'&&tenant.modalidade===null&&tenant.escolhaModalidadePendente&&tenant.nome==='EMPRESA SINTETICA A23'&&tenant.slug==='adesao-'+g.id);
  pass('profile and compatibility links belong to same identity and tenant',profile.tenantId===tenant.id&&profile.nome==='ADMINISTRAÇÃO'&&profile.ativo&&mapping.tenantId===tenant.id&&mapping.identityId===existing.identity.id&&usuario.tenantId===tenant.id&&usuario.email===g.email&&usuario.senhaHash===hash&&usuario.papel==='admin');
  pass('existing identity credentials and data byte-equivalent',JSON.stringify(await p.authIdentity.findUniqueOrThrow({where:{id:existing.identity.id}}))===JSON.stringify(identityBefore));
  pass('prior two memberships preserved',JSON.stringify(await p.tenantMembership.findMany({where:{identityId:existing.identity.id,tenantId:{in:prior}},orderBy:{id:'asc'}}))===priorBefore);
  pass('no global or support privileges created',await p.platformAdmin.count({where:{identityId:existing.identity.id}})===0&&await p.supportOperator.count({where:{identityId:existing.identity.id}})===0);
  pass('no implicit terms, contractual responsible or onboarding decision',await p.termAcceptance.count({where:{identityId:existing.identity.id}})===0&&await p.tenantContractualResponsible.count({where:{tenantId:tenant.id}})===0&&await p.tenantContractualOnboarding.count({where:{tenantId:tenant.id}})===0);
  pass('OWNER cannot administer platform',(await q(existing.j,'/api/platform/tenants')).status===403);
  pass('unrelated tenant selection denied',(await q(existing.j,'/api/tenants/switch','POST',{tenantId:'tenant-b'})).status===403);
  const events=await p.auditEvent.findMany({where:{OR:[{tenantId:tenant.id},{resourceId:tenant.id}]}});
  for(const action of ['TENANT_CREATED','PERMISSION_PROFILE_CREATED','OWNER_ASSIGNED','MEMBERSHIP_ACTIVATED','ADMISSION_PROVISIONED'])pass('atomic audit '+action,events.filter(e=>e.action===action).length===1);
  const completion=events.find(e=>e.action==='ADMISSION_PROVISIONED');
  pass('audit ties beneficiary to legitimate authorizer and origin',completion.actorIdentityId===existing.identity.id&&completion.actorMembershipId===membership.id&&completion.metadata.invitationId===g.invitationId&&completion.metadata.authorizedByIdentityId===admin.id&&!!completion.requestId);
  pass('OWNER assignment event immutable and attributed',await p.accessOwnerEvent.count({where:{tenantId:tenant.id,actorIdentityId:admin.id,targetIdentityId:existing.identity.id,targetMembershipId:membership.id}})===1);
  await assert.rejects(sql('UPDATE admissions SET membership_id=$1 WHERE id=$2',['member-b',g.id]),{code:'23503'});pass('database composite FK rejects foreign tenant membership');
  await assert.rejects(sql(`INSERT INTO admissions(id,source,source_reference,experiment_invitation_id,authorized_email,authorized_by_admin_id,authorized_by_identity_id,authorized_at,expires_at,status)
    SELECT $1,source,source_reference,experiment_invitation_id,authorized_email,authorized_by_admin_id,authorized_by_identity_id,authorized_at,expires_at,'AUTHORIZED' FROM admissions WHERE id=$2`,[randomUUID(),g.id]),{code:'23505'});pass('database unique source rejects duplicate authorization');
  await assert.rejects(sql("UPDATE admissions SET source='VALIDATED_PAYMENT' WHERE id=$1",[g.id]),{code:'23514'});pass('paid source remains impossible in this package');

  // Second distinct authorization for the same identity after a synthetic cooldown.
  await age(g,61);const second=await approval(existing.identity.email),secondJar=clone(existing.j);await verify(second,secondJar);
  const secondResult=await provision(second,secondJar);pass('distinct authorization gives same identity a separate tenant',secondResult.status===201&&secondResult.body.tenantId!==tenant.id&&await p.tenantMembership.count({where:{identityId:existing.identity.id}})===4);
  const fresh=jar();await login(fresh,existing.identity.email);
  pass('provisioned state resumes in fresh authenticated browser without mail cookie',(await q(fresh,`/api/admissions/${second.id}`)).body.tenantId===secondResult.body.tenantId);
  pass('fresh browser repeats same provisioned result',(await provision(second,fresh)).body.tenantId===secondResult.body.tenantId);
  pass('provisioned state hidden from other identity',(await q(other.j,`/api/admissions/${second.id}`)).status===403);
  pass('wrong identity cannot replay provisioned result',(await provision(second,other.j)).status===403);
  await age(second,25*3600);await p.experimentInvitation.update({where:{id:second.invitationId},data:{revokedAt:new Date()}});
  const adminAuthority=await p.platformAdmin.findUniqueOrThrow({where:{identityId:admin.id}});
  await p.platformAdmin.update({where:{id:adminAuthority.id},data:{status:'INACTIVE'}});
  pass('completed result survives original expiry and issuer deactivation',(await provision(second,fresh)).body.tenantId===secondResult.body.tenantId);
  await p.platformAdmin.update({where:{id:adminAuthority.id},data:{status:'ACTIVE'}});
  pass('completed authorization cannot be cancelled',(await q(adminJar,`/api/platform/experiment-invitations/${second.invitationId}/admission`,'DELETE',{reason:'SINTETICO A23'})).status===409);
  for(const [model,id,field,inactive,active] of [['tenantMembership',secondResult.body.membershipId,'status','INACTIVE','ACTIVE'],['tenant',secondResult.body.tenantId,'ativo',false,true],['accessProfile',(await p.tenantMembership.findUniqueOrThrow({where:{id:secondResult.body.membershipId}})).profileId,'ativo',false,true]]){
    await p[model].update({where:{id},data:{[field]:inactive}});pass(model+' revocation prevents context recovery',(await provision(second,fresh)).status===403);await p[model].update({where:{id},data:{[field]:active}});
  }
  pass('reactivation resumes original tenant without recreation',(await provision(second,fresh)).body.tenantId===secondResult.body.tenantId);

  await deniedCase('expired',a=>age(a.g,25*3600));
  await deniedCase('cancelled',async a=>{assert.equal((await q(adminJar,`/api/platform/experiment-invitations/${a.g.invitationId}/admission`,'DELETE',{reason:'CANCELAMENTO SINTETICO'})).status,200)});
  await deniedCase('revoked-source',a=>p.experimentInvitation.update({where:{id:a.g.invitationId},data:{revokedAt:new Date()}}));
  await deniedCase('expired-source',a=>p.experimentInvitation.update({where:{id:a.g.invitationId},data:{createdAt:new Date(Date.now()-3600000),expiresAt:new Date(Date.now()-1000)}}));
  await deniedCase('no-interest',a=>p.experimentInvitation.update({where:{id:a.g.invitationId},data:{interestAt:null}}));
  const inactiveAdmin=await ready('inactive-admin');await p.platformAdmin.update({where:{id:adminAuthority.id},data:{status:'INACTIVE'}});
  const authorityBefore=await digest();pass('inactive administrative authority prevents first provisioning',(await provision(inactiveAdmin.g,inactiveAdmin.j)).status===403);assert.deepEqual(await digest(),authorityBefore);
  await p.platformAdmin.update({where:{id:adminAuthority.id},data:{status:'ACTIVE'}});
  await p.authIdentity.update({where:{id:admin.id},data:{status:'INACTIVE'}});
  pass('inactive authorizer identity also prevents first provisioning',(await provision(inactiveAdmin.g,inactiveAdmin.j)).status===403);
  await p.authIdentity.update({where:{id:admin.id},data:{status:'ACTIVE'}});
  pass('restored authority permits same authorization',(await provision(inactiveAdmin.g,inactiveAdmin.j)).status===201);
  await deniedCase('wrong-email',a=>p.authIdentity.update({where:{id:a.identity.id},data:{email:'changed-'+randomUUID()+'@example.invalid'}}),403);
  await deniedCase('inactive-identity',a=>p.authIdentity.update({where:{id:a.identity.id},data:{status:'INACTIVE'}}),401);
  await deniedCase('missing-proof',async a=>{a.j.delete('dez-admission-'+a.g.id)},401);
  await deniedCase('tampered-proof',async a=>{a.j.set('dez-admission-'+a.g.id,{value:'tampered',path:'/api/admissions/'+a.g.id})},401);
  await deniedCase('missing-canonical-proof',a=>sql('UPDATE admissions SET verified_challenge_id=NULL,email_verified_at=NULL WHERE id=$1',[a.g.id]),401);
  const cookieExpired=await deniedCase('expired-browser-proof',a=>age(a.g,31*60),401);
  pass('expired browser proof retains canonical verification',(await p.admission.findUniqueOrThrow({where:{id:cookieExpired.g.id}})).emailVerifiedAt!==null);

  for(const [label,revoke,grant] of [
    ['late final-state write','REVOKE UPDATE(status) ON admissions FROM a2_runtime','GRANT UPDATE(status) ON admissions TO a2_runtime'],
    ['compatibility mapping','REVOKE INSERT ON legacy_user_access_maps FROM a2_runtime','GRANT INSERT ON legacy_user_access_maps TO a2_runtime'],
    ['audit write','REVOKE INSERT ON audit_events FROM a2_runtime','GRANT INSERT ON audit_events TO a2_runtime'],
  ]){
    const a=await ready('rollback'),before=await digest();await sql(revoke);
    try{pass(label+' fault returns retryable failure',(await provision(a.g,a.j)).status===503)}finally{await sql(grant)}
    assert.deepEqual(await digest(),before);pass(label+' rolls back every tenant, link, event and authorization write');
    const recovered=await provision(a.g,a.j);pass(label+' recovers using same authorization and proof',recovered.status===201&&recovered.body.id===a.g.id);
  }
  const race=await ready('cancel-race');
  const racing=await Promise.all([provision(race.g,race.j),q(adminJar,`/api/platform/experiment-invitations/${race.g.invitationId}/admission`,'DELETE',{reason:'CORRIDA SINTETICA'})]);
  const winner=await p.admission.findUniqueOrThrow({where:{id:race.g.id}});
  pass('cancel/provision race has one legal terminal state',winner.status==='PROVISIONED'?racing[0].status===201&&racing[1].status===409:racing[0].status===409&&racing[1].status===200&&winner.tenantId===null);

  // A genuinely new identity is created by the existing A.2.2 HTTP endpoint, then authenticates normally.
  const newGrant=await approval('a23-new-'+randomUUID()+'@example.invalid'),newJar=jar();await verify(newGrant,newJar);
  pass('new identity creation preserves A22 HTTP contract',(await q(newJar,`/api/admissions/${newGrant.id}/identity`,'POST',{password:cfg.password})).body.created===true);
  const newUser=await login(newJar,newGrant.email),newResult=await provision(newGrant,newJar);
  pass('new identity provisions through real authenticated session',newResult.status===201&&newResult.body.identityId===newUser.id);
  pass('operational API gated after provisioning',(await q(newJar,'/api/lancamentos')).status===428);
  pass('handoff first requests user terms',(await q(newJar,'/onboarding')).headers.get('location')==='/termos/aceite');
  pass('PF/PJ cannot precede user terms',(await q(newJar,'/api/onboarding/modalidade','POST',{modalidade:'PF'})).status===428);
  pass('responsible cannot precede user terms',(await q(newJar,'/api/onboarding/contractual','POST',{action:'self'})).status===428);
  let terms=(await q(newJar,'/api/terms/pending')).body.pending;
  const userTerm=terms.find(t=>t.audience==='USUARIO'),contract=terms.find(t=>t.audience==='CONTRATANTE');
  const pdf=await q(newJar,`/api/terms/versions/${userTerm.versionId}/file`);pass('synthetic PDF served with integrity verification',pdf.status===200&&pdf.body.startsWith('%PDF-'));
  pass('explicit user term accepted through existing route',(await q(newJar,'/api/terms/accept','POST',{versionId:userTerm.versionId,agreed:true})).status===200);
  pass('existing handoff next requests PF/PJ',(await q(newJar,'/onboarding')).headers.get('location')==='/onboarding/modalidade');
  pass('explicit PF choice succeeds',(await q(newJar,'/api/onboarding/modalidade','POST',{modalidade:'PF'})).status===200);
  pass('contract still blocked before responsible',(await q(newJar,'/api/terms/accept','POST',{versionId:contract.versionId,agreed:true})).status===403);
  pass('explicit self designation succeeds',(await q(newJar,'/api/onboarding/contractual','POST',{action:'self'})).status===200);
  pass('operational API remains gated before contract',(await q(newJar,'/api/lancamentos')).status===428);
  pass('safe contractual return preserved',(await q(newJar,'/api/onboarding/contractual','POST',{action:'back'})).status===200);
  pass('stale contract cannot be accepted after return',(await q(newJar,'/api/terms/accept','POST',{versionId:contract.versionId,agreed:true})).status===403);
  assert.equal((await q(newJar,'/api/onboarding/contractual','POST',{action:'self'})).status,200);
  pass('explicit contract acceptance releases business',(await q(newJar,'/api/terms/accept','POST',{versionId:contract.versionId,agreed:true})).status===200&&(await q(newJar,'/api/lancamentos')).status===200);
  pass('formalized contract cannot reopen',(await q(newJar,'/api/onboarding/contractual','POST',{action:'back'})).status===409);
  pass('completed onboarding hands off to inicio',(await q(newJar,'/onboarding')).headers.get('location')==='/inicio');
  const backup=await q(newJar,'/api/backups');pass('new tenant backup uses approved H8 candidate',backup.status===200&&backup.body.format==='10s-tenant-backup/3'&&backup.body.migrations.length===8);
  pass('tenant backup excludes global admission governance',!Object.keys(backup.body.sections).some(k=>k.includes('admission'))&&!Object.keys(backup.body.references).some(k=>k.includes('admission')));
  const preserve=await digest(['admissions','admission_challenges','tenant_memberships','legacy_user_access_maps','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding']);
  const preview=await q(newJar,'/api/backups','POST',backup.body);assert.equal(preview.status,200);
  const restoreOptions={headers:{'x-backup-confirm':newResult.body.tenantId,'x-backup-preview':preview.body.preview.currentDigest,'x-backup-attempt':randomUUID()}};
  pass('existing tenant restore succeeds',(await q(newJar,'/api/backups?action=restore','POST',backup.body,restoreOptions)).status===200);
  pass('existing restore receipt is idempotent',(await q(newJar,'/api/backups?action=restore','POST',backup.body,restoreOptions)).status===200);
  assert.deepEqual(await digest(['admissions','admission_challenges','tenant_memberships','legacy_user_access_maps','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding']),preserve);
  pass('tenant restore cannot roll back authorization, ownership or formalized evidence');
  pass('post-restore provisioning replay cannot duplicate tenant',(await provision(newGrant,newJar)).body.tenantId===newResult.body.tenantId);
  const forged=clone(newJar);forged.set('tenant_context',{value:`${newUser.id}:${newUser.loginNonce}:${tenant.id}`,path:'/'});
  pass('forged tenant cookie gives no foreign business access',[403,409].includes((await q(forged,'/api/lancamentos')).status));
  assert.deepEqual(await digest(['_prisma_migrations']),ledger);pass('ledger unchanged after all provisioning and restore operations');
  pass('all runtime column and table privileges restored after fault injection',await aclDigest()===originalAcl);
  pass('preexisting foundation tenants and links unchanged',JSON.stringify(await p.tenant.findMany({where:{id:{in:['tenant-a','tenant-b']}},include:{memberships:true,usuarios:true}}))===oldTenants);
  const audit=JSON.stringify(await p.auditEvent.findMany()),logs=await readFile('/tmp/a2-app.log','utf8');
  pass('raw tokens and passwords absent from logs and audit',secrets.every(s=>!audit.includes(s)&&!logs.includes(s)));
  cfg.permissions=profile.permissoes;await writeFile('/tmp/a23-regression-config.json',JSON.stringify(cfg),{mode:0o600});
  return {state:'PASSED',phase:'A.2.3',checks,checkCount:checks.length,syntheticOnly:true,realEmail:false,concurrentRequests:8,partialRecords:0,schemaChanges:0,ledgerChanges:0};
}
main().then(async result=>{await writeFile('/tmp/a23-http-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({state:result.state,checks:result.checkCount}));})
  .catch(async e=>{const result={state:'FAILED',checks,checkCount:checks.length,step,error:e.code??e.name,driverKind:e.cause?.kind,driverCode:e.cause?.originalCode,message:['AssertionError','DriverAdapterError'].includes(e.name)?secrets.reduce((m,s)=>m.split(s).join('[redacted]'),e.message):'sanitized',location:e.stack?.split('\n').find(l=>l.includes('admission-provisioning.http'))};await writeFile('/tmp/a23-http-result.json',JSON.stringify(result,null,2));console.error(JSON.stringify(result));process.exitCode=1;})
  .finally(async()=>{await fixture.end();await runtime.end();await p.$disconnect();});
