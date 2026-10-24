// Run only through the guarded private SSH/local lab wrapper. This is not an API.
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
const { guardEnvironment, provision } = require('./provision.cjs');
const { smoke } = require('./smoke.cjs');

async function main() {
  const url = guardEnvironment(process.env);
  const metadata = JSON.parse(fs.readFileSync('/app/build-metadata.json','utf8'));
  assert.match(process.env.PHASE3A_EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(metadata.sourceCommit,process.env.PHASE3A_EXPECTED_SHA);
  const allPermissions = JSON.parse(fs.readFileSync('/app/phase3a/permissions.json','utf8'));
  const db = new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
  let labPlatformPasswords = null;
  try {
    if(process.env.PHASE3A_LAB === '1') {
      assert.equal(await db.authIdentity.count(),0);
      labPlatformPasswords = {};
      for(const key of ['principal','institutional']) {
        const password=randomBytes(32).toString('base64url');
        labPlatformPasswords[key]=password;
        const identity=await db.authIdentity.create({data:{nome:'Synthetic '+key,email:key+'@example.invalid',senhaHash:await bcrypt.hash(password,12)}});
        await db.platformAdmin.create({data:{identityId:identity.id}});
      }
    }
    const apply=process.argv.includes('--apply');
    const setup=await provision(db,{env:process.env,allPermissions,apply});
    if(!apply) { console.log(JSON.stringify(setup)); return; }
    const result=await smoke(db,setup,{base:process.env.APP_PUBLIC_URL,labPlatformPasswords});
    // Refuse accidental duplication instead of changing an existing fixture on rerun.
    let repeated=false;
    try { await provision(db,{env:process.env,allPermissions,apply:true}); } catch { repeated=true; }
    assert.ok(repeated,'Rerun must fail closed');
    const counts={};
    for(const model of ['tenant','authIdentity','platformAdmin','tenantMembership','usuario','legacyUserAccessMap','accessProfile','accessInvite','lancamento','auditEvent']) counts[model]=await db[model].count();
    console.log(JSON.stringify({state:'PROVISIONED_AND_TESTED',plan:setup.plan,counts,rerunBlocked:true,
      tests:result,tenants:setup.tenants.map(t=>({id:t.id,nome:t.nome,slug:t.slug})),
      memberships:await db.tenantMembership.findMany({select:{role:true,status:true,tenant:{select:{nome:true}},identity:{select:{email:true}},profile:{select:{nome:true}}}})}));
  } finally { await db.$disconnect(); }
}
main().catch(error=>{ console.error(error.message?.startsWith('CHECK_FAILED:') ? error.message :
  `PHASE3A_ABORTED:${error.code || error.name || 'UNKNOWN'}`);process.exitCode=1; });
