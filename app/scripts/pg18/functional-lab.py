"""Fresh PG18/real Prisma/HTTP regression. Docker Desktop only; synthetic data.
Secrets are random per run, passed through process environment, never evidence.
No host/network/DSN supplied by an environment file is accepted.
"""
import pathlib, subprocess, json, secrets, os, time, sys, re
app = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(sys.argv[1]).resolve(); out.mkdir(parents=True, exist_ok=True)
image = sys.argv[2] if len(sys.argv) > 2 else '10s-phase10b:lab-builder'
assert image.startswith('10s-phase10b:')
suite = sys.argv[3] if len(sys.argv)>3 else 'all'
assert suite in ['all','excel','financial','restore']
pg, web, net = 'phase10b-functional-pg', 'phase10b-functional-app', 'phase10b-local'
report = {'checks': [], 'syntheticOnly': True, 'image': image, 'suite': suite}
pgpass, runtimepass, migratorpass = secrets.token_hex(32), secrets.token_hex(32), secrets.token_hex(32)
env = dict(os.environ, POSTGRES_PASSWORD=pgpass, PG18_LAB='1', NODE_PATH='/app/node_modules',
    ACCESS_AUTH_MODE='identity', AUTH_TRUST_HOST='true', NODE_ENV='production', APP_PUBLIC_URL='http://'+web+':3000', NEXTAUTH_URL='http://'+web+':3000',
    NEXTAUTH_SECRET=secrets.token_hex(32), TENANT_BACKUP_INSTANCE_ID='pg18-local-lab',
    TENANT_BACKUP_SIGNING_KEY_ID='lab', TENANT_BACKUP_SIGNING_KEYS=json.dumps({'lab': secrets.token_hex(32)}),
    TERM_STORAGE_DIR='/private/phase91/terms', TENANT_BACKUP_DIR='/private/phase91/safety',
    PHASE5A_EXPECTED_SHA='0'*40, PHASE5B_EXPECTED_SHA='0'*40, PHASE91_LAB_URL='http://'+web+':3000',
    PHASE92A_LAB='1', PHASE93_LAB='1', PHASE7_LAB='1', NEXT_TELEMETRY_DISABLED='1')
secretValues = [pgpass, runtimepass, migratorpass, env['NEXTAUTH_SECRET'], *json.loads(env['TENANT_BACKUP_SIGNING_KEYS']).values()]
def run(args, data=None, check=True, timeout=300):
    p = subprocess.run(args, input=data, text=True, encoding='utf-8', errors='replace', capture_output=True, env=env, timeout=timeout)
    if check and p.returncode: raise RuntimeError('COMMAND_FAILED: '+str(args[:3])+' '+sanitize(p.stderr+p.stdout)[-2500:])
    return p
def sanitize(text):
    for value in secretValues: text = text.replace(value, '[REDACTED]')
    return re.sub(r'postgres(?:ql)?://[^\s\"\x27]+', '[DSN REDACTED]', text)
def record(name, p):
    (out/(name+'.log')).write_text(sanitize(p.stdout+p.stderr), encoding='utf-8')
    assert p.returncode == 0, name+' FAILED: '+sanitize(p.stdout+p.stderr)[-2000:]
    report['checks'].append(name); print(json.dumps({'passed':name}), flush=True)
assert json.loads(run(['docker','context','inspect']).stdout)[0]['Endpoints']['docker']['Host'].startswith('npipe://')
n = json.loads(run(['docker','network','inspect',net]).stdout)[0]
assert n['Internal'] and n['Labels']['purpose']=='phase10b-local'
for c in [pg,web]: assert run(['docker','inspect',c],check=False).returncode != 0, 'FRESH_CONTAINER_REQUIRED'
assert run(['docker','volume','inspect','phase10b-functional-data'],check=False).returncode != 0, 'FRESH_VOLUME_REQUIRED'
run([sys.executable,str(app/'scripts/pg18/adapt-regressions.py'),str(out/'runners')])
run(['docker','volume','create','--label','purpose=phase10b-functional','phase10b-functional-data'])
cfg = out/'prisma.config.cjs'; cfg.write_text("module.exports={schema:'/app/prisma/schema.prisma',migrations:{path:'/app/prisma/migrations'},datasource:{url:process.env.DATABASE_URL}};\n")
mounts = ['-v',str(app/'scripts')+':/app/scripts:ro','-v',str(out/'runners')+':/lab:ro',
          '-v',str(cfg)+':/private/prisma.config.cjs:ro','-v',str(app/'src/lib/backup')+':/private/phase91/engine:ro',
          '-v',str(app/'src/lib/backup')+':/app/backup:ro']
names = ['DATABASE_URL','PG18_LAB','NODE_PATH','ACCESS_AUTH_MODE','AUTH_TRUST_HOST','NODE_ENV','APP_PUBLIC_URL','NEXTAUTH_URL','NEXTAUTH_SECRET',
         'TENANT_BACKUP_INSTANCE_ID','TENANT_BACKUP_SIGNING_KEY_ID','TENANT_BACKUP_SIGNING_KEYS','TERM_STORAGE_DIR','TENANT_BACKUP_DIR',
         'PHASE5A_EXPECTED_SHA','PHASE5B_EXPECTED_SHA','PHASE91_LAB_URL','PHASE92A_LAB','PHASE93_LAB','PHASE7_LAB']
flags = [item for name in names for item in ['-e',name]]
def sql(q, db='postgres'):
    assert db=='postgres' or db=='gestar_vf_dev' or re.fullmatch('phase10b_[a-z]+',db)
    return run(['docker','exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],q)
def node(script):
    return run(['docker','run','--rm','--network',net,'--memory','2g',*mounts,*flags,'--volumes-from',web,image,'node',script],check=False,timeout=900)
def start(db):
    env['DATABASE_URL']='postgresql://pg18_runtime:'+runtimepass+'@'+pg+':5432/'+db
    run(['docker','run','-d','--name',web,'--label','purpose=phase10b-functional','--network',net,'--memory','2g',
         '--mount','type=volume,source=phase10b-functional-data,destination=/private/phase91',*flags,image,'node','node_modules/next/dist/bin/next','start','-H','0.0.0.0'])
    run(['docker','exec',web,'mkdir','-p','/private/phase91/terms','/private/phase91/safety'])
    for _ in range(100):
        p=run(['docker','exec',web,'node','-e',"fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],check=False)
        if p.returncode==0:return
        time.sleep(.5)
    raise RuntimeError('APP_NOT_READY')
def stop():
    if run(['docker','inspect',web],check=False).returncode==0:
        run(['docker','stop','-t','5',web]);run(['docker','rm','-v',web])
try:
    run(['docker','run','-d','--name',pg,'--label','purpose=phase10b-functional','--network',net,'--memory','1g',
         '--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_PASSWORD',
         'postgres:18.6-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5'])
    for _ in range(90):
        if run(['docker','exec',pg,'pg_isready','-U','postgres'],check=False).returncode==0:break
        time.sleep(.5)
    sql("CREATE ROLE pg18_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+runtimepass+"';")
    sql("CREATE ROLE pg18_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+migratorpass+"';")
    for db in (['gestar_vf_dev','phase10b_restore','phase10b_excel','phase10b_financial'] if suite=='all' else ['phase10b_'+suite]):
        sql('CREATE DATABASE '+db)
        env['DATABASE_URL']='postgresql://postgres:'+pgpass+'@'+pg+':5432/'+db
        p=run(['docker','run','--rm','--network',net,*mounts,'-e','DATABASE_URL',image,'node','node_modules/prisma/build/index.js','migrate','deploy','--config','/private/prisma.config.cjs'],check=False)
        record('migrate-'+db,p)
        acl=(app/'scripts/pg18/runtime-acl.sql').read_text(encoding='utf-8').replace(":'runtime'","'pg18_runtime'").replace(":'migrator'","'pg18_migrator'")
        sql(acl,db)
        forbidden=sql("SELECT has_schema_privilege('pg18_runtime','public','CREATE') OR has_database_privilege('pg18_runtime',current_database(),'TEMP') OR has_table_privilege('pg18_runtime','_prisma_migrations','INSERT,UPDATE,DELETE') OR has_table_privilege('pg18_runtime','audit_events','UPDATE,DELETE') OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner='pg18_runtime'::regrole);",db).stdout.strip()
        assert forbidden=='f','RUNTIME_PRIVILEGE_GUARD'
    # Share ONLY the disposable DB network namespace: original localhost guards stay intact.
    if suite=='all':
        env['DATABASE_URL']='postgresql://postgres:'+pgpass+'@127.0.0.1:5432/gestar_vf_dev'
        unit=run(['docker','run','--rm','--network','container:'+pg,'--memory','2g',
            '-v',str(app/'tests')+':/app/tests:ro','-v',str(app/'scripts')+':/app/scripts:ro',
            '-v',str(app.parent/'docker-compose.yml')+':/docker-compose.yml:ro','-e','DATABASE_URL',
            '10s-phase10b:unit','node','--test',*['tests/'+p.name for p in (app/'tests').glob('*.test.mjs')]],check=False,timeout=600)
        record('unit-all-pg18',unit)
    for db,tests in [('phase10b_restore',['restore']),('phase10b_excel',['excel1','excel2']),('phase10b_financial',['financial','support','history'])]:
        if suite!='all' and db!='phase10b_'+suite:continue
        start(db)
        env['DATABASE_URL']='postgresql://postgres:'+pgpass+'@'+pg+':5432/'+db
        if db!='phase10b_restore': record('seed-'+db,node('/app/scripts/pg18/seed-lab.cjs'))
        for name in tests:
            if name=='history':record('seed-history',node('/app/scripts/pg18/seed-history-lab.cjs'))
            record(name,node('/lab/'+name+'.cjs'))
            # Restart only this lab process to avoid aggregating unrelated login-rate windows.
            if name in ['financial','support']:
                stop(); start(db);env['DATABASE_URL']='postgresql://postgres:'+pgpass+'@'+pg+':5432/'+db
        stop()
    report['state']='PASSED'
except Exception as e:
    report.update(state='FAILED',error=sanitize(str(e)))
    if run(['docker','inspect',web],check=False).returncode==0:
        logs=run(['docker','logs',web],check=False)
        (out/'app-failure.log').write_text(sanitize(logs.stdout+logs.stderr),encoding='utf-8')
finally:
    stop()
    if run(['docker','inspect',pg],check=False).returncode==0:
        run(['docker','stop','-t','5',pg]);run(['docker','rm','-v',pg])
    run(['docker','volume','rm','phase10b-functional-data'])
    (out/'functional-lab.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report),flush=True)
    if report.get('state')!='PASSED':sys.exit(1)
