const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const base='http://localhost:3020';
async function emit(page,pass,recipient){
  const label='A25 SINTETICO '+randomUUID(),email=recipient||'a25-'+randomUUID()+'@example.invalid';
  await page.goto(base+'/plataforma/convites-especiais');
  await page.getByLabel('Nome do destinatário',{exact:true}).fill(label);
  await page.getByLabel('E-mail autorizado',{exact:true}).fill(email);
  const issued=page.waitForResponse(r=>r.url()===base+'/api/platform/experiment-invitations'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Criar convite',exact:true}).click();const response=await issued;assert.equal(response.status(),201);
  const data=await response.json();await page.getByRole('searchbox').fill(label);
  const copied=page.waitForResponse(r=>r.url().endsWith('/'+data.id+'/link')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Copiar link de '+label,exact:true}).click();const linkResponse=await copied;assert.equal(linkResponse.status(),200);
  const {link}=await linkResponse.json();assert.equal(new URL(link).origin,base);
  pass('Individual Special Invitation authorized at issuance through PlatformAdmin UI');
  return{id:data.id,admissionId:data.admissionId,label,email,link,token:new URLSearchParams(new URL(link).hash.slice(1)).get('convite')};
}
async function interest(context,invitation,pass,shot){
  const page=await context.newPage();await page.goto(base+'/primeiro-acesso');
  await page.getByLabel('Link do convite',{exact:true}).fill(invitation.link);
  await page.getByRole('button',{name:'Continuar com meu convite',exact:true}).click();
  const acknowledged=page.waitForResponse(r=>r.url()===base+'/api/experimentacao'&&r.request().postDataJSON()?.action==='acknowledge');
  await page.getByRole('button',{name:'Quero conhecer a DEZ Soluções',exact:true}).click();assert.equal((await acknowledged).status(),200);
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.id==='convite-especial');
  assert.equal(await page.locator('#convite-especial').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('main #convite-especial').count(),1);
  assert.equal(await page.locator('#perguntas-frequentes details').count(),6);
  assert(await page.getByRole('heading',{name:'Uso pessoal',exact:true}).count());
  for(const a of await page.getByRole('link',{name:'Acessar plataforma'}).all())assert.equal(await a.getAttribute('href'),base+'/login');
  for(const mobile of [false,true]){
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1366,height:900});
    await page.getByRole('link',{name:'Ir para o convite',exact:true}).click();
    assert.equal(await page.locator('#convite-especial').evaluate(e=>e===document.activeElement),true);
    const box=await page.locator('#convite-especial').boundingBox();assert(box&&box.y>=0&&box.y<200);
    await shot(page,mobile?'special-invitation-mobile':'special-invitation-desktop');
  }
  await page.getByText('Recebi um Convite Especial. Como faço para começar?',{exact:true}).click();
  assert.equal(await page.locator('#perguntas-frequentes details[open]').count(),1);
  await page.getByRole('link',{name:'Ir para o convite',exact:true}).click();
  pass('Special Invitation routes from First Access; correct section focus, live landing FAQ and login destinations on desktop/mobile');
  assert.equal(await page.getByRole('button',{name:'Quero experimentar a plataforma',exact:true}).count(),0);
  const started=page.waitForResponse(r=>r.url()===base+'/api/experimentacao'&&r.request().postDataJSON()?.action==='startAdmission');
  await page.getByRole('button',{name:'Iniciar minha adesão',exact:true}).click();const response=await started;assert.equal(response.status(),200);
  await page.waitForURL(u=>u.pathname==='/adesao');await page.getByRole('heading',{name:'Confirme sua identidade',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('dez-admission-id')),invitation.admissionId);
  assert.equal(new URL(page.url()).hash,'');assert.equal((await context.request.get(base+'/api/lancamentos')).status(),401);
  pass('Private link redeems once and opens identity without email, interest prerequisite or second approval');
  assert.equal(await page.getByRole('button',{name:'Confirmar meu e-mail',exact:true}).count(),0);
  assert.equal(await page.getByRole('textbox',{name:'E-mail autorizado',exact:true}).count(),0);
  assert(await page.getByText(invitation.email,{exact:true}).count());
  await shot(page,'special-private-redemption');await page.close();
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
