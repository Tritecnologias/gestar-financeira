import {readFileSync,writeFileSync,existsSync,rmSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PRIVATE_HOMOLOG_MIGRATIONS,PRIVATE_PRODUCTION_MIGRATIONS,PORTABLE_ADMISSION_MIGRATION,PRIVATE_INVITATION_MIGRATION,PRE_EXPERIMENT_MIGRATIONS} from '../../src/lib/backup/schema-contract.mjs';

// One build contains every approved lineage. Runtime selects the Prisma path;
// SQL independently proves the connection, roles, ACLs and ledger.
export function prepareProfile(root,profile='portable',source=process.cwd()) {
  if(profile!=='portable')throw Error('ENVIRONMENT_IS_RUNTIME_CONFIGURATION');
  root=resolve(root);source=resolve(source);
  if(root===source||!existsSync(join(root,'server.js'))||!existsSync(join(root,'build-metadata.json')))throw Error('SEPARATE_RUNTIME_ARTIFACT_REQUIRED');
  const target=join(root,'prisma','migrations'),inside=relative(root,target);
  if(isAbsolute(inside)||inside.startsWith('..'))throw Error('ARTIFACT_PATH');
  const profiles={local:PRIVATE_HOMOLOG_MIGRATIONS,homolog:PRIVATE_HOMOLOG_MIGRATIONS,production:PRIVATE_PRODUCTION_MIGRATIONS};
  const prepared=Object.entries(profiles).map(([name,list])=>({name,list,files:list.map(m=>{
    const folder=[PORTABLE_ADMISSION_MIGRATION.name,PRIVATE_INVITATION_MIGRATION.name].includes(m.name)?'portable-migrations':
      name==='production'&&!PRE_EXPERIMENT_MIGRATIONS.some(x=>x.name===m.name)?'production-migrations':'migrations';
    const bytes=readFileSync(join(source,'prisma',folder,m.name,'migration.sql'));
    if(createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw Error('MIGRATION_CHECKSUM:'+m.name);
    return {...m,bytes};
  })}));
  rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
  for(const lane of prepared){
    for(const m of lane.files){mkdirSync(join(target,lane.name,m.name),{recursive:true});writeFileSync(join(target,lane.name,m.name,'migration.sql'),m.bytes);}
    cpSync(join(source,'prisma/migrations/migration_lock.toml'),join(target,lane.name,'migration_lock.toml'));
  }
  for(const alternate of ['production-migrations','homolog-migrations','portable-migrations'])rmSync(join(root,'prisma',alternate),{recursive:true,force:true});
  const acl=readFileSync(join(source,'scripts/admission/portable-runtime-acl.sql'));
  writeFileSync(join(target,'manual_admission_runtime_acl.sql'),acl);
  // Official Prisma config, not a deployment executor. No filesystem rewrite.
  writeFileSync(join(root,'prisma.config.cjs'),`const path=require('node:path');
const profile=process.env.DEPLOYMENT_PROFILE;
if(!['local','homolog','production'].includes(profile))throw Error('EXPLICIT_MIGRATION_PROFILE_REQUIRED');
module.exports={schema:path.join(__dirname,'prisma/schema.prisma'),migrations:{path:path.join(__dirname,'prisma/migrations',profile)},datasource:{url:process.env.DATABASE_URL||''}};
`);
  const metadata=JSON.parse(readFileSync(join(root,'build-metadata.json'),'utf8'));
  metadata.deploymentProfile='portable';metadata.migrationProfiles=profiles;
  metadata.admissionAclSha256=createHash('sha256').update(acl).digest('hex');
  delete metadata.migrations;delete metadata.excludedHomologAssets;
  writeFileSync(join(root,'build-metadata.json'),JSON.stringify(metadata,null,2)+'\n');return metadata;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const metadata=prepareProfile(process.argv[2],process.argv[3]);
  console.log(JSON.stringify({state:'PORTABLE_ARTIFACT_PREPARED',profiles:Object.keys(metadata.migrationProfiles)}));
}
