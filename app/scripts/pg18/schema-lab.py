"""Local Docker-only synthetic schema proof. No env loader, remote DSN or real data."""
import subprocess, pathlib, json, time, hashlib, sys, re
app=pathlib.Path(__file__).resolve().parents[2]
repo=app.parent
out=pathlib.Path(sys.argv[1]).resolve()
assert out.is_absolute()
out.mkdir(parents=True,exist_ok=True)
net="phase10b-local"
pg="phase10b-baseline-pg18"
image="postgres:18.6-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5"
report={"checks":[],"epoch":"PG18 BASELINE V1","syntheticOnly":True}
def run(args,input=None,check=True):
 p=subprocess.run(args,input=input,text=True,capture_output=True,timeout=180)
 if check and p.returncode:raise RuntimeError(str(args[:3])+":"+p.stderr[-1500:])
 return p
ctx=json.loads(run(["docker","context","inspect"]).stdout)[0]
assert ctx["Endpoints"]["docker"]["Host"].startswith("npipe://")
network=json.loads(run(["docker","network","inspect",net]).stdout)[0]
assert network["Internal"] and network["Labels"]["purpose"]=="phase10b-local"
assert run(["docker","inspect",pg],check=False).returncode!=0,"NEW_LAB_CONTAINER_REQUIRED"
run(["docker","run","-d","--pull=never","--name",pg,"--network",net,"--label","purpose=phase10b-schema",
 "--mount","type=tmpfs,destination=/var/lib/postgresql","--memory","768m","-e","POSTGRES_HOST_AUTH_METHOD=trust",image])
def sql(q,db="postgres",check=True):
 assert db=="postgres" or re.fullmatch("phase10b_[a-z_]+",db)
 return run(["docker","exec","-i",pg,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",db],q,check)
def query(q,db="postgres"):
 return json.loads(bytes.fromhex(sql("SET search_path=public,pg_catalog;SELECT encode(convert_to(("+q+")::text,'UTF8'),'hex');",db).stdout.strip()).decode())
def passed(label):report["checks"].append(label)
cfg=out/"prisma.config.cjs"
cfg.write_text("module.exports={schema:'/app/prisma/schema.prisma',migrations:{path:'/app/prisma/migrations'},datasource:{url:process.env.DATABASE_URL}};\n")
def migrate(db="postgres",verb="deploy"):
 return run(["docker","run","--rm","--network",net,"--memory","768m","-v",str(app/"prisma")+":/app/prisma:ro",
  "-v",str(cfg)+":/private/prisma.config.cjs:ro","-e","DATABASE_URL=postgresql://postgres@"+pg+":5432/"+db,
  "10s-phase8:validated","node","node_modules/prisma/build/index.js","migrate",verb,"--config","/private/prisma.config.cjs"],check=False)
baseline=(app/"prisma/migrations/20261027_pg18_baseline/migration.sql").read_text()
catalogSQL=(app/"scripts/schema-reconciliation/catalog.sql").read_text().rstrip(";\n")
def catalog(db="postgres"):return query("("+catalogSQL+")",db)
try:
 for _ in range(90):
  if run(["docker","exec",pg,"pg_isready","-U","postgres"],check=False).returncode==0:break
  time.sleep(.5)
 r=migrate();(out/"baseline-deploy.log").write_text(r.stdout+r.stderr)
 assert r.returncode==0,r.stderr[-1500:]
 ledger=query("(SELECT json_agg(x) FROM(SELECT migration_name,checksum,finished_at IS NOT NULL ok FROM _prisma_migrations)x)")
 assert len(ledger)==1 and ledger[0]["ok"] and ledger[0]["checksum"]==hashlib.sha256(baseline.encode()).hexdigest()
 passed("Prisma migrate deploy fresh: one complete exact-checksum baseline")
 r=migrate();assert r.returncode==0 and len(query("(SELECT json_agg(x) FROM _prisma_migrations x)"))==1
 assert migrate(verb="status").returncode==0
 passed("normal migrate deploy replay is a no-op; status current")
 actual=catalog()
 expected=json.loads((repo/"docs/pg18/schema19-canonical.json").read_text(encoding="utf-8"))
 raw=actual.copy()
 n=[c for c in actual["constraints"] if c["type"]=="n"]
 actual["constraints"]=[c for c in actual["constraints"] if c["type"]!="n"]
 diff={k:{"expected":expected[k],"actual":actual[k]} for k in expected if expected[k]!=actual[k]}
 (out/"schema-diff.json").write_text(json.dumps(diff,ensure_ascii=False,indent=2),encoding="utf-8")
 assert not diff,"CANONICAL_SCHEMA_DIFFERENCE"
 required={(x["tab"],x["col"]) for x in expected["columns"] if x["required"]}
 metadata=query("(SELECT json_agg(x ORDER BY tab,col) FROM(SELECT c.relname tab,a.attname col,con.conname,con.convalidated,con.conenforced,"
  "con.conislocal,con.coninhcount,con.connoinherit,con.conparentid=0 no_parent,array_length(con.conkey,1) key_count,a.attnotnull "
  "FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=con.conkey[1] "
  "WHERE con.connamespace='public'::regnamespace AND con.contype='n' AND con.conrelid<>'_prisma_migrations'::regclass)x)")
 assert len(n)==len(metadata)==len(required) and {(x["tab"],x["col"]) for x in metadata}==required
 assert all(x["convalidated"] and x["conenforced"] and x["attnotnull"] and x["conislocal"] and
  x["coninhcount"]==0 and not x["connoinherit"] and x["no_parent"] and x["key_count"]==1 for x in metadata)
 passed("all ten canonical object sections equal; PG18 NOT NULL verified bidirectionally, validated and enforced")
 tables=[t["name"] for t in actual["relations"] if t["kind"]=="r"]
 assert all(sql('SELECT count(*) FROM "'+t+'"').stdout.strip()=="0" for t in tables)
 passed("all 38 application tables empty: no seeded accounts, permissions or historical data")
 sql("CREATE DATABASE phase10b_wrong_schema")
 sql("CREATE SCHEMA other;","phase10b_wrong_schema")
 r=sql("SET search_path=other,public;"+baseline,"phase10b_wrong_schema",False)
 assert r.returncode!=0 and "PG18_BASELINE_REQUIRES_PUBLIC" in r.stderr
 assert not catalog("phase10b_wrong_schema")["relations"]
 passed("wrong initial schema rejected before setting search_path or creating application objects")
 r=sql(baseline,check=False);assert r.returncode!=0 and "PG18_BASELINE_REQUIRES_EMPTY_SCHEMA" in r.stderr
 passed("manual reapplication rejects nonempty application schema")
 sql("CREATE DATABASE phase10b_rollback")
 r=sql(baseline.replace("\nCOMMIT;","\nDO $$ BEGIN RAISE EXCEPTION 'LAB_INJECTED_FAILURE'; END $$;\nCOMMIT;"),"phase10b_rollback",False)
 assert r.returncode!=0 and "LAB_INJECTED_FAILURE" in r.stderr
 assert not catalog("phase10b_rollback")["relations"] and not catalog("phase10b_rollback")["functions"]
 passed("injected late failure rolls back all application DDL")
 sql("CREATE DATABASE phase10b_unknown")
 sql("CREATE TABLE unknown_object(id int);","phase10b_unknown")
 r=sql(baseline,"phase10b_unknown",False)
 assert r.returncode!=0 and "PG18_BASELINE_REQUIRES_EMPTY_SCHEMA" in r.stderr
 passed("unexpected preexisting object rejected without mutation")
 sql("CREATE DATABASE phase10b_old_ledger")
 sql("CREATE TABLE _prisma_migrations(migration_name text,finished_at timestamp,rolled_back_at timestamp);"
     "INSERT INTO _prisma_migrations VALUES('0_legacy_baseline',now(),NULL);","phase10b_old_ledger")
 r=sql(baseline,"phase10b_old_ledger",False)
 assert r.returncode!=0 and "PG18_BASELINE_INCOMPATIBLE_LEDGER" in r.stderr
 passed("old ledger rejected without editing or resolving history")
 semantic={"catalog":actual,"notNull":metadata,"epoch":"PG18 BASELINE V1"}
 report.update({"state":"PASSED","version":sql("SHOW server_version").stdout.strip(),"ledger":ledger,
  "objects":{k:len(v) for k,v in actual.items()},"notNull":len(metadata),
  "fingerprintSHA256":hashlib.sha256(json.dumps(semantic,sort_keys=True,separators=(",",":")).encode()).hexdigest()})
 (out/"pg18-semantic-catalog.json").write_text(json.dumps(semantic,ensure_ascii=False,indent=2),encoding="utf-8")
except Exception as e:
 report.update({"state":"FAILED","error":str(e)[:2000]})
finally:
 run(["docker","stop","-t","5",pg]);run(["docker","rm","-v",pg])
 (out/"schema-lab.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
 print(json.dumps(report))
 if report.get("state")!="PASSED":sys.exit(1)
