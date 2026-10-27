// Synthetic historical-reference topology; never reads another environment.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
async function main(){
 const u=new URL(process.env.DATABASE_URL);assert.equal(process.env.PG18_LAB,'1');assert.equal(u.hostname,'phase10b-functional-pg');assert.equal(u.pathname,'/phase10b_financial');
 const pool=new Pool({connectionString:u.href}),q=async(s,p=[])=>(await pool.query(s,p)).rows,id=()=>crypto.randomUUID();
 try{
  const tenants=(await q('SELECT id FROM tenants ORDER BY id')).map(r=>r.id);assert.equal(tenants.length,8);
  assert.equal((await q('SELECT count(*)::int n FROM lancamentos l JOIN usuarios u ON u.id=l.criado_por WHERE l.tenant_id<>u.tenant_id'))[0].n,0);
  const users=[];
  for(const t of tenants){const user=id();users.push(user);await q("INSERT INTO usuarios(id,tenant_id,nome,email,senha_hash,ativo) VALUES($1,$2,'SYNTHETIC HISTORICAL USER',$3,'disabled-synthetic-no-credential',false)",[user,t,'history-'+user+'@example.invalid']);}
  for(let i=0;i<8;i++){
   let seq=(await q('SELECT coalesce(max(seq),0)::int n FROM lancamentos WHERE tenant_id=$1',[tenants[i]]))[0].n;
   for(let n=0;n<(i===7?3:4);n++)await q("INSERT INTO lancamentos(id,tenant_id,seq,descricao,valor,criado_por) VALUES($1,$2,$3,'PG18 SYNTHETIC HISTORY',$4,$5)",[id(),tenants[i],++seq,[null,0,.01][n%3],users[(i+1)%8]]);
  }
  for(let i=0;i<2;i++)await q("INSERT INTO layouts_colunas(id,tenant_id,usuario_id,nome,colunas) VALUES($1,$2,$3,'PG18 SYNTHETIC LAYOUT','[]'::jsonb)",[id(),tenants[3],users[i]]);
  console.log(JSON.stringify({state:'SYNTHETIC_HISTORY_SEEDED',crossAuthors:31,crossLayouts:2,humanData:0}));
 }finally{await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({state:'FAILED',code:e.code||e.name}));process.exitCode=1});
