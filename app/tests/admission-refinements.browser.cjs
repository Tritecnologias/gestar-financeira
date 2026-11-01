const assert = require('node:assert/strict');

const introductions = {
  USUARIO: 'Este é o seu Termo de Uso da DEZ Soluções. Ele identifica você como usuário da plataforma e estabelece as condições de acesso, utilização e responsabilidades, contribuindo para a segurança das suas informações.',
  CONTRATANTE: 'Este é o Termo de Contratação da DEZ Soluções. Ele estabelece as condições de utilização do espaço contratado e as responsabilidades assumidas pelo responsável contratual, garantindo clareza e segurança na relação entre as partes.',
};
async function termCopy(page, document) {
  assert.equal(document.documentCode, document.audience === 'USUARIO' ? 'TERM_USUARIO' : 'TERM_CONTRATANTE');
  assert.equal(await page.locator('.terms-card > header > p').innerText(), introductions[document.audience]);
  assert.equal(document.title, 'SINTETICO A23 SEM VALOR CONTRATUAL');
}
async function choiceCopy(page, type) {
  if (type === 'modality') {
    await page.getByRole('heading', {name:'Como você deseja utilizar este espaço?',exact:true}).waitFor();
    for (const text of ['Gestão Pessoal — PF','Organizar minhas finanças pessoais.','Gestão Empresarial — PJ','Organizar a gestão da minha empresa.'])
      assert.equal(await page.getByText(text,{exact:true}).count(),1);
  } else {
    assert.equal(await page.locator('.contractual-onboarding h2').innerText(), 'Quem assumirá a responsabilidade pela contratação deste espaço?');
    assert.equal(await page.getByText('A pessoa indicada será responsável por formalizar a contratação com a DEZ Soluções, aceitar os termos contratuais e responder pela relação contratual.',{exact:true}).count(),1);
  }
}
const typeIs = (page,id,type) => page.waitForFunction(({id,type})=>document.getElementById(id)?.type===type,{id,type});
async function passwordControls(page, pass, shot) {
  let posts=0;
  const observe=r=>{if(r.method()==='POST'&&/\/(identity|provision|callback\/credentials)$/.test(new URL(r.url()).pathname))posts++;};
  page.on('request',observe);
  const cdp=await page.context().newCDPSession(page);
  for(const mode of ['light','dark'])for(const mobile of [false,true]) {
    await page.evaluate(mode=>sessionStorage.setItem('a24-test-theme',mode),mode);
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1366,height:900});await page.reload();
    await page.getByLabel('Crie sua senha',{exact:true}).waitFor();
    await page.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode);
    for(const id of ['admission-password','admission-confirmation']) {
      const field=page.locator('#'+id),eye=page.locator(`button[aria-controls="${id}"]`);
      assert.equal(await eye.getAttribute('type'),'button');assert.equal(await eye.getAttribute('tabindex'),'-1');
      await field.fill('Synthetic-control-check!');await field.focus();await eye.scrollIntoViewIfNeeded();
      let box=await eye.boundingBox();assert(box.width>=44&&box.height>=44);
      const center=()=>({x:box.x+box.width/2,y:box.y+box.height/2});
      await page.mouse.move(center().x,center().y);await page.mouse.down();await typeIs(page,id,'text');
      assert.equal(await field.evaluate(e=>e===document.activeElement),true);
      await page.mouse.up();await typeIs(page,id,'password');
      await page.mouse.down();await typeIs(page,id,'text');await page.mouse.move(1,1);await typeIs(page,id,'password');await page.mouse.up();
      await field.focus();await page.keyboard.down('Alt');await page.keyboard.down('Shift');await page.keyboard.down('v');await typeIs(page,id,'text');
      await page.keyboard.up('Shift');await typeIs(page,id,'password');await page.keyboard.up('v');await page.keyboard.up('Alt');
      for(const key of ['Space','Enter']) {await eye.focus();await page.keyboard.down(key);await typeIs(page,id,'text');await page.keyboard.up(key);await typeIs(page,id,'password');}
      await eye.focus();await page.keyboard.down('Space');await typeIs(page,id,'text');await field.focus();await typeIs(page,id,'password');await page.keyboard.up('Space');
      await field.focus();await eye.scrollIntoViewIfNeeded();box=await eye.boundingBox();
      await page.mouse.move(center().x,center().y);await page.mouse.down();await typeIs(page,id,'text');
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await typeIs(page,id,'password');await page.mouse.up();
      if(mobile) {
        await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
        await field.focus();await eye.scrollIntoViewIfNeeded();box=await eye.boundingBox();
        for(const ending of ['touchEnd','touchCancel']) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...center(),id:1}]});await typeIs(page,id,'text');
          assert.equal(await field.evaluate(e=>e===document.activeElement),true);
          await cdp.send('Input.dispatchTouchEvent',{type:ending,touchPoints:[]});await typeIs(page,id,'password');
        }
        await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
      }
      assert.equal(await field.inputValue(),'Synthetic-control-check!');
    }
    await page.locator('#admission-password').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'admission-confirmation');await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'Confirmar identidade',exact:true}).evaluate(e=>e===document.activeElement),true);
    assert.equal(posts,0);assert.equal(new URL(page.url()).pathname,'/adesao');
    pass(`hold controls: mouse keyboard ${mobile?'touch release/cancel mobile':'desktop'} ${mode}, unchanged focus and no submit`);
    await page.evaluate(()=>window.scrollTo(0,0));await shot(page,`refined-password-${mobile?'mobile':'desktop'}-${mode}`);
  }
  await cdp.detach();page.off('request',observe);
  await page.evaluate(()=>sessionStorage.removeItem('a24-test-theme'));
  await page.setViewportSize({width:1366,height:900});await page.reload();await page.getByLabel('Crie sua senha',{exact:true}).waitFor();
}
async function handoff(page,admissionId,pass,shot,label) {
  await page.locator('.terms-admission-status').getByText('Identidade confirmada. Seu espaço foi criado automaticamente.',{exact:true}).waitFor();
  assert.equal(await page.locator('.terms-admission-status').getByText('Siga com os documentos e as etapas contratuais obrigatórias para liberar o acesso.',{exact:true}).count(),1);
  await shot(page,`refined-handoff-${label}`);
  assert.equal(new URL(page.url()).pathname,'/termos/aceite');
  if(label==='desktop-light') {
    const falseId='00000000-0000-4000-8000-000000000099';
    await page.evaluate(id=>sessionStorage.setItem('dez-admission-id',id),falseId);
    const denied=page.waitForResponse(r=>r.url().endsWith('/api/admissions/'+falseId));await page.reload();assert(!(await denied).ok());
    assert.equal(await page.locator('.terms-admission-status').count(),0);
    await page.getByRole('button',{name:'Ler e aceitar documento',exact:true}).waitFor();
    await page.evaluate(id=>sessionStorage.setItem('dez-admission-id',id),admissionId);await page.reload();
    await page.locator('.terms-admission-status').waitFor();pass('handoff notice requires server-confirmed admission; stored reference alone cannot claim success');
  }
  pass('provisioning confirmation appears inside mandatory user terms without an extra step: '+label);
}
module.exports={passwordControls,termCopy,choiceCopy,handoff};
