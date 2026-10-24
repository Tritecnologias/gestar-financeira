#!/usr/bin/env python3
"""HOMO-only master backup + proven isolated restore. No application/PROD writes.
Run on the authorized HOMO VPS. Artifacts contain confidential database data.
No SMTP/password values are included in the configuration manifest.
"""
import subprocess,json,hashlib,pathlib,datetime,os,argparse,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--expected-sha',required=True);p.add_argument('--migrations',type=int,required=True);args=p.parse_args()
assert len(args.expected_sha)==40 and all(c in '0123456789abcdef' for c in args.expected_sha)
assert args.migrations>=15

def run(a,input=None,binary=False):
 p=subprocess.run(a,input=input,capture_output=True,text=not binary)
 if p.returncode: raise RuntimeError('BACKUP_COMMAND_FAILED:'+a[0])
 return p.stdout if binary else p.stdout.strip()
db='hd9a0oz02vexqe9u8qadzg6k';name='gestar_financeira_homolog'
c=json.loads(run(['docker','inspect',db]))[0];e=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
assert e['POSTGRES_DB']==name,'DATABASE_GUARD'
u=e['POSTGRES_USER'];base=['docker','exec','-i',db,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U',u]
def q(database,s):return run(base+['-d',database],s)
assert q(name,"SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")==str(args.migrations)
names=[n for n in run(['docker','ps','--format','{{.Names}}']).splitlines() if n.startswith('aeij7divhlbom3taovbdegbh-')];assert len(names)==1
app=names[0];inspect=run(['docker','inspect',app]);appcfg=json.loads(inspect)[0];ae=dict(x.split('=',1) for x in appcfg['Config']['Env'] if '=' in x)
assert ae['SOURCE_COMMIT']==args.expected_sha and ae['SOURCE_BRANCH']=='homologacao' and ae['ACCESS_AUTH_MODE']=='identity'
assert any(m['Source']=='/data/10s-homolog/terms' and m['Destination']=='/var/lib/10s/terms' for m in appcfg['Mounts'])

url=urllib.parse.urlparse(ae['DATABASE_URL']);assert url.path=='/'+name and url.hostname==db
assert ae['NEXTAUTH_URL']==ae['APP_PUBLIC_URL']=='https://homolog.dezsolucoes.com.br'
assert q(name,"SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")=='0'

tag=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
folder=pathlib.Path('/root/phase7-homo-private')/tag;folder.mkdir(mode=0o700,parents=True,exist_ok=False)
os.chmod(folder.parent,0o700)
backup=folder/'homo-before.dump'
with backup.open('xb') as f:
 os.chmod(backup,0o600)
 p=subprocess.run(['docker','exec',db,'pg_dump','-U',u,'-d',name,'-Fc'],stdout=f,stderr=subprocess.PIPE)
 assert p.returncode==0,'PG_DUMP_FAILED'
blob=backup.read_bytes();digest=hashlib.sha256(blob).hexdigest()
listing=run(['docker','exec','-i',db,'pg_restore','--list'],blob,binary=True)
(folder/'restore-list.txt').write_bytes(listing);os.chmod(folder/'restore-list.txt',0o600)
restore='phase7_restore_'+tag.lower()
assert restore.startswith('phase7_restore_') and restore!=name
q('postgres','CREATE DATABASE '+restore)
run(['docker','exec','-i',db,'pg_restore','--exit-on-error','-U',u,'-d',restore],blob,binary=True)
tables=json.loads(q(name,"SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'"))
def snapshot(database):
 items=[]
 for t in tables:
  assert t.replace('_','').isalnum()
  items.append("SELECT '"+t+"' t,count(*) n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text) COLLATE \"C\"),'')) d FROM public.\""+t+'\" x')
 return json.loads(q(database,"BEGIN READ ONLY; SET LOCAL timezone='UTC'; SELECT json_object_agg(t,json_build_object('count',n,'digest',d)) FROM ("+' UNION ALL '.join(items)+') s; ROLLBACK;'))
a=snapshot(name);b=snapshot(restore);assert a==b,'RESTORE_DATA_MISMATCH'

query="-- Structural inventory only. No rows, credentials or sequence current values.\n-- Use a READ ONLY transaction and search_path=public,pg_catalog when auditing.\nSELECT jsonb_build_object(\n  'columns', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE \"C\", col COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname tab,a.attname col,format_type(a.atttypid,a.atttypmod) type,\n      a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_expr,\n      a.attidentity AS identity,a.attgenerated AS generated\n    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace\n    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum\n    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped\n  ) x),\n  'constraints', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE \"C\", name COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname tab,con.conname name,con.contype type,pg_get_constraintdef(con.oid) definition,con.convalidated validated\n    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace\n    WHERE n.nspname='public' AND c.relname<>'_prisma_migrations'\n  ) x),\n  'indexes', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename COLLATE \"C\", indexname COLLATE \"C\"),'[]') FROM (\n    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations'\n  ) x),\n  'triggers', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE \"C\", name COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname tab,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition\n    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace\n    WHERE n.nspname='public' AND NOT t.tgisinternal\n  ) x),\n  'functions', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE \"C\", args COLLATE \"C\"),'[]') FROM (\n    SELECT p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition\n    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'\n      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')\n  ) x),\n  'enums', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE \"C\", position),'[]') FROM (\n    SELECT t.typname name,e.enumlabel label,e.enumsortorder position FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid\n    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'\n  ) x),\n  'policies', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename COLLATE \"C\", policyname COLLATE \"C\"),'[]') FROM (SELECT * FROM pg_policies WHERE schemaname='public') x),\n  'relations', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname name,c.relkind kind,c.relrowsecurity rls,c.relforcerowsecurity force_rls\n    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'\n      AND c.relkind IN ('r','p','v','m','f') AND c.relname<>'_prisma_migrations'\n  ) x),\n  'views', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname name,pg_get_viewdef(c.oid) definition,c.reloptions options\n    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')\n  ) x),\n  'sequences', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE \"C\"),'[]') FROM (\n    SELECT c.relname name,format_type(s.seqtypid,NULL) type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle\n    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'\n  ) x)\n)"

def signature(database):return json.loads(q(database,"BEGIN READ ONLY; SET LOCAL search_path=public,pg_catalog; SELECT to_json(md5(v::text)) FROM ("+query+") a(v); ROLLBACK;"))
assert signature(name)==signature(restore),'RESTORE_CATALOG_MISMATCH'

image=appcfg['Image']
private=folder/'configuration-manifest.json';private.write_text(json.dumps({'sourceCommit':ae['SOURCE_COMMIT'],'sourceBranch':ae['SOURCE_BRANCH'],'urls':{'NEXTAUTH_URL':ae['NEXTAUTH_URL'],'APP_PUBLIC_URL':ae['APP_PUBLIC_URL']},'accessMode':ae['ACCESS_AUTH_MODE'],'requiredSecretNames':['DATABASE_URL','NEXTAUTH_SECRET','SMTP_PASSWORD'],'mounts':[{'source':m['Source'],'destination':m['Destination']} for m in appcfg['Mounts']]}));os.chmod(private,0o600)
rollback_tag='10s-homo-phase7-rollback:'+tag.lower()
run(['docker','tag',image,rollback_tag])
# Backup and restore only immutable, UUID-named PDFs referenced by this database snapshot.
import re,tarfile,io
source=pathlib.Path('/data/10s-homolog/terms');dest=folder/'restored-terms';dest.mkdir(mode=0o700);os.chown(dest,1001,1001)
versions=json.loads(q(restore,"SELECT json_agg(json_build_object('key',storage_key,'sha256',sha256,'id',id)) FROM term_versions"))
assert versions is not None
archive=folder/'terms.tar'
with tarfile.open(archive,'w') as tar:
 for v in versions:
  key=v['key'];assert re.fullmatch(r'[0-9a-f-]{36}\.pdf',key)
  original=source/key;assert original.is_file() and not original.is_symlink()
  assert hashlib.sha256(original.read_bytes()).hexdigest()==v['sha256'];tar.add(original,arcname=key,recursive=False)
os.chmod(archive,0o600)
with tarfile.open(archive,'r') as tar:
 for entry in tar.getmembers():
  assert entry.isfile() and any(entry.name==v['key'] for v in versions)
  p=dest/entry.name;p.write_bytes(tar.extractfile(entry).read());os.chmod(p,0o600);os.chown(p,1001,1001)
for v in versions:assert hashlib.sha256((dest/v['key']).read_bytes()).hexdigest()==v['sha256']
assert q(restore,'SELECT count(*) FROM term_acceptances a JOIN term_versions v ON v.id=a.term_version_id WHERE a.document_hash<>v.sha256')=='0'
node="const fs=require('fs'),c=require('crypto');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{for(const v of JSON.parse(s)){if(c.createHash('sha256').update(fs.readFileSync('/terms/'+v.key)).digest('hex')!==v.sha256)process.exit(1)}console.log('RUNTIME_READ_OK')})"
assert run(['docker','run','--rm','-i','--network','none','--mount','type=bind,source='+str(dest)+',target=/terms,readonly',image,'node','-e',node],json.dumps(versions))=='RUNTIME_READ_OK'
storageResult={'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'restoredDirectory':str(dest),'documents':len(versions),'runtimeUid1001Read':True,'acceptanceHashesEqual':True}
# Disable connections to the verified temporary restore; preserve it privately for rollback review.
q('postgres','ALTER DATABASE '+restore+' ALLOW_CONNECTIONS false')
roles=json.loads(q(name,"SELECT coalesce(json_agg(x),'[]') FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin FROM pg_roles ORDER BY rolname) x"))
serverVersion=q(name,'SHOW server_version')
owners=json.loads(q(name,"SELECT json_agg(x) FROM (SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename) x"))
result={'roles':roles,'owners':owners,'serverVersion':serverVersion,'migrations':args.migrations,'sourceCommit':args.expected_sha,'storage':storageResult,'backup':str(backup),'bytes':len(blob),'sha256':digest,'listingValidated':True,'restoreDatabase':restore,'restoreDataEqual':True,'restoreCatalogEqual':True,'restoreConnectionsAllowed':False,'snapshot':a,'rollbackImage':image,'rollbackTag':rollback_tag,'privateConfiguration':str(private)}
meta=folder/'backup-validation.json';meta.write_text(json.dumps(result,indent=2));os.chmod(meta,0o600)
print(json.dumps({'summary':{k:v for k,v in result.items() if k!='snapshot'},'details':result}))

