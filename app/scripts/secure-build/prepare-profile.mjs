import {readFileSync,writeFileSync,existsSync,rmSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {REQUIRED_MIGRATIONS,PRODUCTION_MIGRATIONS,PRE_EXPERIMENT_MIGRATIONS} from '../../src/lib/backup/schema-contract.mjs';

export function prepareProfile(root,profile,source=process.cwd()) {
  if(!['homolog','production'].includes(profile))throw Error('EXPLICIT_ARTIFACT_PROFILE_REQUIRED');
  root=resolve(root);source=resolve(source);
  if(root===source||!existsSync(join(root,'server.js'))||!existsSync(join(root,'build-metadata.json')))throw Error('SEPARATE_RUNTIME_ARTIFACT_REQUIRED');
  const target=join(root,'prisma','migrations'),inside=relative(root,target);
  if(isAbsolute(inside)||inside.startsWith('..'))throw Error('ARTIFACT_PATH');
  const list=profile==='production'?PRODUCTION_MIGRATIONS:REQUIRED_MIGRATIONS;
  const paths=list.map(m=>{
    const production=profile==='production'&&!PRE_EXPERIMENT_MIGRATIONS.some(x=>x.name===m.name);
    const file=join(source,'prisma',production?'production-migrations':'migrations',m.name,'migration.sql');
    const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw Error('MIGRATION_CHECKSUM:'+m.name);
    return{...m,file};
  });
  rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
  for(const m of paths){mkdirSync(join(target,m.name));cpSync(m.file,join(target,m.name,'migration.sql'));}
  cpSync(join(source,'prisma','migrations','migration_lock.toml'),join(target,'migration_lock.toml'));
  rmSync(join(root,'prisma','production-migrations'),{recursive:true,force:true});
  const excluded=[];
  if(profile==='production')for(const name of ['homolog-yellow.svg','homolog-yellow.ico',...['16','32','48','192','512'].map(n=>'homolog-yellow-'+n+'.png')]){
    const file=join(root,'public','brand',name);if(existsSync(file)){rmSync(file);excluded.push(name);}
  }
  const metadata=JSON.parse(readFileSync(join(root,'build-metadata.json'),'utf8'));
  metadata.deploymentProfile=profile;metadata.migrations=list;metadata.excludedHomologAssets=excluded;
  writeFileSync(join(root,'build-metadata.json'),JSON.stringify(metadata,null,2)+'\n');return metadata;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const metadata=prepareProfile(process.argv[2],process.argv[3]);console.log(JSON.stringify({state:'ARTIFACT_PROFILE_PREPARED',profile:metadata.deploymentProfile,migrations:metadata.migrations.length,excludedHomologAssets:metadata.excludedHomologAssets.length}));
}
