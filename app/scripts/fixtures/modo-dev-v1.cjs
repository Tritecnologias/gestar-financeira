// Synthetic logical scenario. No credentials, personal data, cross-environment sync or fixed tenant IDs.
const { createHash } = require('node:crypto');
const VERSION = 'MODO DEV — CENÁRIO PADRÃO V1';
const ROWS = Object.freeze([
  {key:'ausencia',descricao:'MODO DEV V1 — ausência',valor:null,valorPrevisto:null,tipo:null,dataLanc:null,status:'realizado'},
  {key:'zero',descricao:'MODO DEV V1 — zero explícito',valor:0,valorPrevisto:0,tipo:null,dataLanc:null,status:'realizado'},
  {key:'previsto-entrada',descricao:'MODO DEV V1 — entrada prevista',valor:null,valorPrevisto:100,tipo:'ENTRADA',dataLanc:'2026-10-01',status:'previsto'},
  {key:'previsto-saida',descricao:'MODO DEV V1 — saída prevista',valor:null,valorPrevisto:40,tipo:'SAIDA',dataLanc:'2026-10-01',status:'previsto'},
  {key:'realizado-entrada',descricao:'MODO DEV V1 — entrada realizada',valor:80,valorPrevisto:80,tipo:'ENTRADA',dataLanc:'2026-10-01',dataPagamento:'2026-10-02',status:'realizado'},
  {key:'realizado-saida',descricao:'MODO DEV V1 — saída realizada',valor:20,valorPrevisto:20,tipo:'SAIDA',dataLanc:'2026-10-01',dataPagamento:'2026-10-02',status:'realizado'},
  {key:'centavo',descricao:'MODO DEV V1 — centavo',valor:0.01,valorPrevisto:null,tipo:null,dataLanc:null,status:'realizado'},
]);
function id(tenant,kind,key){const h=createHash('sha256').update(VERSION+'|'+tenant+'|'+kind+'|'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
async function applyScenario(p,{tenantId,identityId,expectedDatabase,confirm}){
 if(confirm!==VERSION||!['phase11b_lab','gestar_homolog_pg18'].includes(expectedDatabase))throw Error('FIXTURE_EXPLICIT_ENVIRONMENT_REQUIRED');
 return p.$transaction(async tx=>{
  const [env]=await tx.$queryRawUnsafe('SELECT current_database() AS name');if(env.name!==expectedDatabase)throw Error('FIXTURE_DATABASE_MISMATCH');
  const tenant=await tx.tenant.findUnique({where:{id:tenantId}});if(!tenant||tenant.slug!=='modo-dev'||tenant.nome!=='MODO DEV'||!tenant.ativo)throw Error('FIXTURE_SYNTHETIC_TENANT_ONLY');
  const member=await tx.tenantMembership.findFirst({where:{tenantId,identityId,role:'OWNER',status:'ACTIVE',identity:{status:'ACTIVE'}}});if(!member)throw Error('FIXTURE_EXPLICIT_OWNER_REQUIRED');
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text",'lancamento-seq:'+tenantId);
  const receipt=id(tenantId,'audit','applied');if(await tx.auditEvent.findUnique({where:{id:receipt}}))return {alreadyApplied:true,version:VERSION};
  for(const model of ['categoria','planoContas','areaNegocio','centroCusto','cliente','fornecedor'])if(await tx[model].count({where:{tenantId,codigo:{in:['90','91','90.001','91.001','DEVV1']}}}))throw Error('FIXTURE_CODE_COLLISION');
  const area=await tx.areaNegocio.create({data:{id:id(tenantId,'area','1'),tenantId,codigo:'DEVV1',nome:'Área sintética V1'}});
  await tx.centroCusto.create({data:{id:id(tenantId,'cc','1'),tenantId,codigo:'DEVV1',nome:'Centro sintético V1',areaId:area.id}});
  for(const [codigo,nome,tipo] of [['90','Receitas sintéticas V1','RECEITA'],['91','Despesas sintéticas V1','DESPESA']]){
   const c=await tx.categoria.create({data:{id:id(tenantId,'categoria',codigo),tenantId,codigo,nome,tipo}});
   await tx.planoContas.create({data:{id:id(tenantId,'conta',codigo),tenantId,codigo:codigo+'.001',descricao:nome,tipo,categoriaId:c.id}});
  }
  await tx.cliente.create({data:{id:id(tenantId,'cliente','1'),tenantId,codigo:'DEVV1',nome:'Cliente sintético V1'}});
  await tx.fornecedor.create({data:{id:id(tenantId,'fornecedor','1'),tenantId,codigo:'DEVV1',nome:'Fornecedor sintético V1'}});
  let seq=((await tx.lancamento.aggregate({where:{tenantId},_max:{seq:true}}))._max.seq??0)+1;
  for(const {key,...row} of ROWS)await tx.lancamento.create({data:{...row,id:id(tenantId,'lancamento',key),tenantId,seq:seq++,cont:'1',criadoPorIdentityId:identityId,
    dataLanc:row.dataLanc?new Date(row.dataLanc+'T12:00:00Z'):null,dataPagamento:row.dataPagamento?new Date(row.dataPagamento+'T12:00:00Z'):null}});
  await tx.auditEvent.create({data:{id:receipt,tenantId,actorIdentityId:identityId,actorMembershipId:member.id,accessMode:'SYSTEM',action:'SYNTHETIC_SCENARIO_APPLIED',resourceType:'Fixture',result:'SUCCESS',metadata:{version:VERSION,launches:ROWS.length}}});
  return {alreadyApplied:false,version:VERSION,launches:ROWS.length};
 },{timeout:30000});
}
module.exports={VERSION,ROWS,id,applyScenario};
