const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const base='http://localhost:3020';
async function emit(page,pass){
  const label='A25 SINTETICO '+randomUUID(),email='a25-'+randomUUID()+'@example.invalid';
  await page.goto(base+'/plataforma/convites-especiais');
  await page.getByLabel('Nome do destinatário',{exact:true}).fill(label);
  const issued=page.waitForResponse(r=>r.url()===base+'/api/platform/experiment-invitations'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Criar convite',exact:true}).click();const response=await issued;assert.equal(response.status(),201);
  const data=await response.json();await page.getByRole('searchbox').fill(label);
  const copied=page.waitForResponse(r=>r.url().endsWith('/'+data.id+'/link')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Copiar link de '+label,exact:true}).click();const linkResponse=await copied;assert.equal(linkResponse.status(),200);
  const {link}=await linkResponse.json();assert.equal(new URL(link).origin,base);
  pass('A25 Special Invitation issued and original link recovered through PlatformAdmin UI');
  return{id:data.id,label,email,link,token:new URLSearchParams(new URL(link).hash.slice(1)).get('convite')};
}
async function interest(context,invitation,pass,shot){
  const page=await context.newPage();await page.goto(invitation.link);
  await page.getByRole('button',{name:'Quero conhecer a DEZ Soluções',exact:true}).click();
  const registered=page.waitForResponse(r=>r.url()===base+'/api/experimentacao'&&r.request().postDataJSON()?.action==='interest');
  await page.getByRole('button',{name:'Quero experimentar a plataforma',exact:true}).click();assert.equal((await registered).status(),200);
  assert.equal(new URL(page.url()).hash,'');assert.equal((await context.request.get(base+'/api/lancamentos')).status(),401);
  pass('A25 visitor registers interest through real invitation UI without authentication or operational access');
  await shot(page,'a25-special-interest');await page.close();
}
async function bypass(context,stage,pass){
  const page=await context.newPage();
  for(const route of ['/inicio','/onboarding','/onboarding/modalidade']){
    await page.goto(base+route);
    const destination=new URL(page.url()).pathname;
    assert(stage==='terms'?destination==='/termos/aceite':['/login','/selecionar-tenant'].includes(destination),stage+' '+route+' -> '+destination);
  }
  const r=await context.request.get(base+'/api/lancamentos');assert(stage==='terms'?r.status()===428:[401,403,409].includes(r.status()));
  if(stage==='terms')for(const [url,data] of [['/api/onboarding/modalidade',{modalidade:'PJ'}],['/api/onboarding/contractual',{action:'self'}]]){
    assert.equal((await context.request.post(base+url,{headers:{Origin:base},data})).status(),428);
  }
  await page.close();pass('A25 direct URLs and APIs cannot bypass '+stage+' requirements');
}
module.exports={emit,interest,bypass};
