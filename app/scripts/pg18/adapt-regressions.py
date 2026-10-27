"""Reuse established assertions in fresh PG18-only laboratories.

Only environment/ledger/envelope expectations change. Exact replacements fail if
the original harness changes; no behavioral assertion is silently dropped.
Generated runners and their source digests are evidence, never runtime artifacts.
"""
import pathlib, sys, hashlib, json
app = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
manifest = []
def replace(s, old, new, count=1):
    assert s.count(old) == count, (old[:100], s.count(old), count)
    return s.replace(old, new)
for name, source in [('excel1', 'phase5a/run.cjs'), ('excel2', 'phase5b/run.cjs'),
                     ('financial', 'phase92a/zero-http-lab.cjs'), ('support', 'phase93/support-http-lab.cjs'),
                     ('restore', 'phase7/tenant-lab.cjs'), ('history','phase91/restore-lab.cjs')]:
    original = (app/'scripts'/source).read_text(encoding='utf-8')
    s = original
    if name in ['excel1', 'excel2']:
        s = s.replace('10s-phase5a-pg', 'phase10b-functional-pg').replace('/phase5a_lab', '/phase10b_excel').replace('10s-phase5a-app', 'phase10b-functional-app')
        if name == 'excel1': s = replace(s, 'assert.equal(ledger.n,15)', 'assert.equal(ledger.n,1)')
        else:
            s = replace(s, "homo=process.argv.includes('--homo')", "homo=false;assert(!process.argv.includes('--homo'));const unused=false")
            s = replace(s, 'assert.equal(m.n,15)', 'assert.equal(m.n,1)')
    elif name in ['financial', 'support']:
        s = s.replace('phase9-prod-clone-pg', 'phase10b-functional-pg')
        s = replace(s, r'/^\/phase91_restore_r\d+$/', r'/^\/phase10b_financial$/')
        s = replace(s, r'/^http:\/\/phase91-lab-app-r\d+:3000$/', r'/^http:\/\/phase10b-functional-app:3000$/')
        if name == 'financial':
            s = replace(s, "const ledger=Number(process.env.PHASE_LAB_LEDGER??18);assert([18,19].includes(ledger));", 'const ledger=1;')
            s = s.replace('10s-tenant-backup/2', '10s-tenant-backup/3').replace('backup-v2-ledger', 'backup-v3-baseline-ledger')
            s = replace(s, "const previous=JSON.parse(await fs.readFile(`/private/phase91/backup${ledger-1}.json`,'utf8'));assert.equal(previous.migrations.length,ledger-1);", "const previous=structuredClone(backup);previous.format='10s-tenant-backup/2'; // Explicit obsolete envelope rejection, no conversion.")
            s = replace(s, "rejected17.code==='SCHEMA_VERSION'", "rejected17.code==='VERSION'")
            s = replace(s, "(await r.json()).code==='SCHEMA_VERSION'", "(await r.json()).code==='VERSION'")
            s = s.replace('genuine-unaltered-backup${ledger-1}-preview-fails-schema${ledger}', 'old-envelope-v2-preview-rejected')
            s = s.replace('genuine-backup${ledger-1}-restore-fails-schema${ledger}', 'old-envelope-v2-restore-rejected')
            # Clean Prisma creates TEXT IDs client-side; the historical clone had
            # a UUID server default. Supply the ID to exercise the intended CHECK.
            s = replace(s, "INSERT INTO lancamentos(tenant_id,seq,descricao,valor) VALUES($1,$2,'F92A SQL NEGATIVE',-1)", "INSERT INTO lancamentos(id,tenant_id,seq,descricao,valor) VALUES(gen_random_uuid()::text,$1,$2,'F92A SQL NEGATIVE',-1)")
            s = replace(s, "ok(true,'real-http-zero-not-automatic-paid');", "ok(true,'real-http-zero-not-automatic-paid'); for(const path of ['/api/fluxo-caixa/relatorio?inicio=2026-10-26&medida=REALIZADO','/api/fluxo-caixa/relatorio?inicio=2026-10-26&medida=PREVISTO','/api/fluxo-caixa/analises?visao=MENSAL&periodo=2026-10&medida=COMPARAR']){const response=await request(jar,path);assert.equal(response.status,200);assert(!(await response.json()).error);}ok(true,'real-http-reports-and-analytics-with-partial-null-zero-rows');")
        else: s = replace(s, 'ledger:19', 'ledger:1')
    elif name=='history':
        s = replace(s, "process.env.PHASE91_LAB,'1'", "process.env.PG18_LAB,'1'")
        s = replace(s, "url.hostname,'phase9-prod-clone-pg'", "url.hostname,'phase10b-functional-pg'")
        s = replace(s, r'/^\/phase91_restore(?:_r\d+)?$/', r'/^\/phase10b_financial$/')
        s = replace(s, r'/^http:\/\/phase91-lab-app(?:-r\d+)?:3000$/', r'/^http:\/\/phase10b-functional-app:3000$/')
        s = replace(s, "await previewRestore(pool,ctx,old(b),cfg);ok(true,tag+'-v1-exact-live-history-preview');", "await assert.rejects(previewRestore(pool,ctx,old(b),cfg),{code:'VERSION'});ok(true,tag+'-v1-rejected-even-with-exact-live-history');")
        s = s.replace("{code:'HISTORY_UNPROVEN'}", "{code:'VERSION'}")
        s = replace(s, "'HISTORY_UNPROVEN','v1-fabricated-reference-denied'", "'VERSION','v1-fabricated-reference-denied'")
        s = replace(s, "const legacy=old(b),lp=await previewRestore(pool,ctx,legacy,cfg);await restoreBackup(pool,ctx,legacy,cfg,lp.currentDigest,id());ok(true,'v1-live-history-full-restore');", "await rejected(old(b),ctx,'VERSION','v1-live-history-preview-and-restore-rejected');")
        s = s.replace('-v2-backup','-v3-backup')
        s = s.replace('Historical restores use the actual isolated PostgreSQL clone.', 'Historical-reference topology is entirely synthetic on clean PG18, not copied historical data.')
    else:
        s = replace(s, "if(process.env.PHASE7_LAB!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/phase7_lab')", "if(process.env.PHASE7_LAB!=='1'||new URL(process.env.DATABASE_URL).hostname!=='phase10b-functional-pg'||new URL(process.env.DATABASE_URL).pathname!=='/phase10b_restore')")
        s = replace(s, "['20261024_lancamento_optional_fields','20261024_z_tenant_restore_lock']", "['20261027_pg18_baseline']")
        s = replace(s, "b.format==='10s-tenant-backup/2'", "b.format==='10s-tenant-backup/3'")
        s = replace(s, "m.migration_name!=='20261024_lancamento_optional_fields'", "m.migration_name!=='20261027_pg18_baseline'")
    # Guard each adapted script before it creates a connection or fixture.
    prefix = "if(process.env.PG18_LAB!=='1'||new URL(process.env.DATABASE_URL).hostname!=='phase10b-functional-pg')throw Error('PG18_LOCAL_LAB_ONLY');\n"
    s = prefix + s
    target = out/(name+'.cjs'); target.write_text(s, encoding='utf-8', newline='\n')
    manifest.append({'runner':name,'source':source,'sourceSHA256':hashlib.sha256(original.encode()).hexdigest(),'adaptedSHA256':hashlib.sha256(s.encode()).hexdigest()})
(out/'adaptation-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'state':'ADAPTED','runners':[x['runner'] for x in manifest]}))
