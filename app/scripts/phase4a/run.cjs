const fs=require('node:fs'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const {smoke}=require('./smoke.cjs');
async function main(){
  const url=new URL(process.env.DATABASE_URL),lab=process.env.PHASE4A_LAB==='1';
  assert.equal(url.hostname,lab?'10s-phase4a-pg':'hd9a0oz02vexqe9u8qadzg6k');
  assert.equal(url.pathname,lab?'/phase4a_lab':'/gestar_financeira_homolog');
  assert.equal(url.searchParams.get('schema')||'public','public');
  assert.equal(process.env.ACCESS_AUTH_MODE,'identity');
  assert.equal(process.env.APP_PUBLIC_URL,lab?'http://10s-phase4a-app:3000':'https://homolog.dezsolucoes.com.br');
  assert.equal(process.env.NEXTAUTH_URL,process.env.APP_PUBLIC_URL);
  const metadata=JSON.parse(fs.readFileSync('/app/build-metadata.json','utf8'));
  assert.match(process.env.PHASE4A_EXPECTED_SHA||'',/^[a-f0-9]{40}$/);
  assert.equal(metadata.sourceCommit,process.env.PHASE4A_EXPECTED_SHA);
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
  try {
    const [database]=await db.$queryRawUnsafe('SELECT current_database() AS name');assert.equal('/'+database.name,url.pathname);
    const [ledger]=await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');assert.equal(ledger.n,14);
    assert.equal(await db.lancamento.count(),0,'Nonempty database: stop and review legitimate work');
    assert.equal(await db.tenant.count(),2);assert.equal(await db.authIdentity.count(),8);assert.equal(await db.platformAdmin.count(),2);
    const before=await db.$queryRawUnsafe("SELECT id,md5(to_jsonb(a)::text) AS digest FROM auth_identities a WHERE email NOT LIKE '%@example.invalid' ORDER BY id");
    const accessBefore=await db.$queryRawUnsafe("SELECT 'memberships' AS kind,md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS digest FROM tenant_memberships t UNION ALL SELECT 'profiles',md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM access_profiles t UNION ALL SELECT 'admins',md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM platform_admins t");
    if(!process.argv.includes('--apply')){console.log(JSON.stringify({state:'GUARDED',database:database.name,ledger:ledger.n,syntheticOnly:true}));return;}
    const tests=await smoke(db,process.env.APP_PUBLIC_URL);
    assert.deepEqual(await db.$queryRawUnsafe("SELECT id,md5(to_jsonb(a)::text) AS digest FROM auth_identities a WHERE email NOT LIKE '%@example.invalid' ORDER BY id"),before);
    assert.deepEqual(await db.$queryRawUnsafe("SELECT 'memberships' AS kind,md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS digest FROM tenant_memberships t UNION ALL SELECT 'profiles',md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM access_profiles t UNION ALL SELECT 'admins',md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM platform_admins t"),accessBefore);
    console.log(JSON.stringify({state:'OPERATIONS_VERIFIED',tests,realIdentitiesUnchanged:true,permissionsUnchanged:true}));
  } finally {await db.$disconnect();}
}
main().catch(error=>{console.error(error.message?.startsWith('CHECK_FAILED:')?error.message:'PHASE4A_ABORTED:'+(error.code||error.name));if(global.phase4aLastCheck)console.error('LAST_CHECK:'+global.phase4aLastCheck);process.exitCode=1;});
