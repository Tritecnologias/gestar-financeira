const assert = require('node:assert/strict'), path = require('node:path');

async function main() {
  let raw = ''; for await (const s of process.stdin) raw += s;
  const c = JSON.parse(raw); raw = '';
  assert(['http://localhost:3020', 'https://homolog.dezsolucoes.com.br'].includes(c.base));
  const {chromium} = require(c.playwrightModule);
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const base = c.base, f = c.fixture, checks = [];
  let step = 'setup', creator;
  let integrityChecked=false,loginAttempts=0;
  const api = (context, url, method='GET', data) => context.request.fetch(base + url,
    {method, headers:{Origin:base}, ...(data===undefined ? {} : {data})});
  const context = () => browser.newContext({viewport:{width:1366,height:864}, permissions:['clipboard-read','clipboard-write']});
  async function login(ctx, email) {
    const p = await ctx.newPage(); p.setDefaultTimeout(60000);
    await p.goto(base + '/login'); assert.equal(await p.locator('form').getAttribute('method'), 'post');
    await p.getByLabel('E-mail',{exact:true}).fill(email); await p.getByLabel('Senha',{exact:true}).fill(c.password);
    loginAttempts++;await p.getByRole('button',{name:'Entrar',exact:true}).click(); await p.waitForURL(u=>u.pathname!='/login'); return p;
  }
  async function invite(ctx,t,email) {
    const r=await api(ctx,'/api/platform/tenants/'+t.id+'/owner-invitations','POST',
      {nome:'OWNER SINTÉTICO BROWSER 12A',email,confirm:true,channel:'MANUAL_SHARE'});
    assert.equal(r.status(),201); return (await r.json()).share.link;
  }
  async function activate(link) {
    const ctx=await context(),p=await ctx.newPage();p.setDefaultTimeout(60000);await p.goto(link);
    const create=p.getByLabel('Crie sua senha',{exact:true}),confirm=p.getByLabel('Confirme sua senha',{exact:true});
    await create.focus();await p.keyboard.press('Tab');assert(await confirm.evaluate(e=>e===document.activeElement));
    await p.keyboard.press('Tab');assert(await p.getByRole('button',{name:'Confirmar acesso',exact:true}).evaluate(e=>e===document.activeElement));
    await create.focus();await p.keyboard.press('Alt+Shift+v');assert.equal(await create.getAttribute('type'),'text');
    await p.keyboard.press('Alt+Shift+v');assert.equal(await create.getAttribute('type'),'password');
    await p.locator('.password-toggle').first().click();assert.equal(await create.getAttribute('type'),'text');
    await p.locator('.password-toggle').first().click();assert.equal(await create.getAttribute('type'),'password');
    assert.equal(await create.getAttribute('aria-describedby'),'activation-password-help');
    assert.equal(await p.getByText('Use Tab para ir da senha à confirmação',{exact:false}).count(),0);
    assert.deepEqual(await p.locator('.activation-fields .activation-muted').allTextContents(),['A senha é definida apenas por você. O aceite dos documentos obrigatórios será solicitado depois.']);
    assert.equal(await p.locator('#activation-password-help').evaluate(e=>getComputedStyle(e).clipPath),'inset(50%)');
    await shots(p,'activation');
    await create.fill(c.password);await confirm.fill(c.password);
    loginAttempts++;await p.getByRole('button',{name:'Confirmar acesso',exact:true}).click();
    await p.waitForURL(u=>!['/ativar-acesso','/login'].includes(u.pathname));assert.equal(new URL(p.url()).hash,'');return{ctx,p};
  }
  async function accept(ctx,p,audience) {
    for(let i=0;i<8;i++) {
      const pending=(await(await api(ctx,'/api/terms/pending')).json()).pending.filter(t=>t.audience===audience&&t.actionable);
      if(!pending.length)return;
      assert(pending.every(t=>t.documentCode==='TERM_'+audience));
      const userIntro='Este é o seu Termo de Uso da DEZ Soluções. Ele identifica você como usuário da plataforma e estabelece as condições de acesso, utilização e responsabilidades, contribuindo para a segurança das suas informações.';
      const contractIntro='Este é o Termo de Contratação da DEZ Soluções. Ele estabelece as condições de utilização do espaço contratado e as responsabilidades assumidas pelo responsável contratual, garantindo clareza e segurança na relação entre as partes.';
      await p.getByText(audience==='USUARIO'?userIntro:contractIntro,{exact:true}).waitFor();
      assert.equal(await p.getByText(audience==='USUARIO'?contractIntro:userIntro,{exact:true}).count(),0);
      if(audience==='USUARIO'&&!integrityChecked) {
        await p.route('**/api/terms/versions/*/file',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'x-term-sha256':'0'.repeat(64)}});});
        await p.getByRole('button',{name:'Ler e aceitar documento',exact:true}).click();
        const broken=p.getByRole('dialog');await broken.getByRole('alert').filter({hasText:'integridade'}).waitFor();
        assert.equal(await broken.getByRole('checkbox').isEnabled(),false);assert.equal(await broken.getByRole('button',{name:'Aceitar documento',exact:true}).isEnabled(),false);
        await broken.getByRole('button',{name:'Fechar documento',exact:true}).click();await p.unroute('**/api/terms/versions/*/file');integrityChecked=true;checks.push('PDF integrity mismatch still blocks acceptance');
      }
      const d=p.getByRole('dialog');if(!await d.isVisible())await p.getByRole('button',{name:'Ler e aceitar documento',exact:true}).click();
      await d.getByRole('heading',{name:pending[0].title,exact:true}).waitFor();
      await d.getByRole('checkbox').check();
      const done=p.waitForResponse(r=>r.url()===base+'/api/terms/accept'&&r.request().method()==='POST');
      await d.getByRole('button',{name:'Aceitar documento',exact:true}).click();assert.equal((await done).status(),200);
      await p.waitForLoadState('networkidle');
    }
    throw Error('TOO_MANY_DOCUMENTS');
  }
  async function shots(p,label,dialog=false) {
    const s=await(await p.context().request.get(base+'/api/auth/session')).json(),id=s?.user?.id??null;
    for(const mobile of [false,true])for(const mode of ['light','dark']) {
      await p.setViewportSize(mobile?{width:414,height:896}:{width:1366,height:864});
      if(!id){await p.evaluate(mode=>localStorage.setItem('theme',mode),mode);await p.reload();}
      else await p.evaluate(({id,mode})=>{localStorage.setItem('10s:appearance:v1:identity:'+id,JSON.stringify({version:1,mode,
        palette:{primary:'#2563EB',accent:'#0E7490',background:'#F3F7FA',surface:'#FFFFFF',sidebar:'#FFFFFF',text:'#0F172A',secondary:'#475569',border:'#D5DFE8'}}));window.dispatchEvent(new StorageEvent('storage'));},{id,mode});
      await p.waitForFunction(m=>document.documentElement.dataset.theme===m,mode);
      assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
      const buttons=dialog?p.getByRole('dialog').getByRole('button'):p.locator('.contractual-choices button');
      for(const b of await buttons.all()) {
        const box=await b.boundingBox();assert(box&&box.height>=44&&box.x>=0&&box.x+box.width<=(mobile?414:1366));
      }
      if(dialog){const box=await p.getByRole('dialog').boundingBox();assert(box&&box.height<=(mobile?896:864));}
      await p.screenshot({animations:'disabled',path:path.join(c.output,`${'LOCAL'}-${label}-${mobile?'414':'1366'}-${mode}.png`)});
    }
  }
  const shareDialog = p => p.getByRole('dialog',{name:'Convite pronto para compartilhar',exact:true});
  async function copyContractual(p) {
    await shareDialog(p).getByRole('button',{name:'Copiar link',exact:true}).click();
    await shareDialog(p).waitFor({state:'detached'});
    await p.getByText('Link copiado. Compartilhe somente com a pessoa indicada.',{exact:true}).waitFor();
    const link=await p.evaluate(()=>navigator.clipboard.readText());assert(link.startsWith(base+'/ativar-acesso#token='));return link;
  }
  async function nominate(p,name) {
    await p.getByRole('button',{name:'Outra pessoa',exact:true}).click();
    await p.getByLabel('Nome',{exact:true}).fill(name);await p.getByLabel('E-mail',{exact:true}).fill(f.nomineeEmail);
    const response=p.waitForResponse(r=>r.url()===base+'/api/onboarding/contractual'&&r.request().method()==='POST');
    await p.getByRole('button',{name:'Enviar convite',exact:true}).click();const created=await response;
    assert.equal(created.status(),201);const data=await created.json();assert.equal(data.share.role,'OWNER');
    await shareDialog(p).waitFor();return data;
  }
  try {
    const pa=await context(),pp=await login(pa,f.adminEmail);
    step='administrative dialog keeps role profile labels and explicit close';
    await pp.goto(base+'/plataforma');
    const row=pp.getByRole('row').filter({hasText:f.self.nome});
    await row.getByRole('button',{name:'Designar Proprietário',exact:true}).click();
    let d=pp.getByRole('dialog');await d.getByLabel('Nome (para convite)',{exact:true}).fill('OWNER SINTÉTICO BROWSER 12A');
    await d.getByLabel('Email',{exact:true}).fill(f.selfEmail);pp.once('dialog',dialog=>dialog.accept());
    await d.getByRole('button',{name:'Confirmar',exact:true}).click();
    d=pp.getByRole('dialog',{name:'Convite criado',exact:true});await d.waitFor();
    assert((await d.locator('dt').allTextContents()).includes('Função'));assert((await d.locator('dt').allTextContents()).includes('Perfil'));
    await d.getByRole('button',{name:'Copiar link de convite',exact:true}).click();
    await d.getByText('Link copiado. Envie-o somente ao destinatário deste convite.',{exact:true}).waitFor();assert(await d.isVisible());
    const selfLink=await pp.evaluate(()=>navigator.clipboard.readText());await d.getByRole('button',{name:'Fechar',exact:true}).click();checks.push(step);
    step='new OWNER accepts own official USER before chooser';
    const a=await activate(selfLink);
    await a.p.getByText('Este é o seu Termo de Uso da DEZ Soluções. Ele identifica você como usuário da plataforma e estabelece as condições de acesso, utilização e responsabilidades, contribuindo para a segurança das suas informações.',{exact:true}).waitFor();
    assert.equal(await a.p.getByRole('button',{name:'Atualizar documentos',exact:true}).count(),0);await shots(a.p,'user-terms');
    await accept(a.ctx,a.p,'USUARIO');await a.p.waitForURL(u=>u.pathname==='/onboarding/modalidade');
    await a.p.getByRole('radio',{name:'Gestão Pessoal — PF Organizar minhas finanças pessoais.'}).check();await shots(a.p,'modality-pf');
    await a.p.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
    await a.p.getByRole('heading',{name:'Responsável Contratual',exact:true}).waitFor();assert.equal((await api(a.ctx,'/api/lancamentos')).status(),428);checks.push(step);
    step='SELF chooser desktop mobile light dark keyboard';await shots(a.p,'self');
    await a.p.getByRole('button',{name:'Sou eu',exact:true}).focus();await a.p.keyboard.press('Enter');
    await a.p.waitForURL(u=>u.pathname==='/termos/aceite');checks.push(step);
    step='contract PDF back returns to actual chooser before acceptance';
    await a.p.getByRole('button',{name:'Ler e aceitar documento',exact:true}).click();let reader=a.p.getByRole('dialog');
    await reader.getByRole('checkbox').waitFor();await reader.getByRole('link',{name:'Baixar PDF',exact:true}).waitFor();
    assert.equal(await reader.getByRole('link',{name:'Baixar PDF',exact:true}).locator('svg').count(),1);
    await shots(a.p,'contract-reader',true);
    await reader.getByRole('button',{name:'Voltar',exact:true}).click();await a.p.waitForURL(u=>u.pathname==='/onboarding');
    await a.p.getByRole('button',{name:'Outra pessoa',exact:true}).click();assert.equal(await a.p.getByLabel('E-mail',{exact:true}).inputValue(),'');
    assert.equal(await a.p.getByLabel('Nome',{exact:true}).inputValue(),'');await a.p.getByRole('button',{name:'Voltar à escolha',exact:true}).click();
    assert.equal(await a.p.getByLabel('E-mail',{exact:true}).count(),0);await a.p.getByRole('button',{name:'Sou eu',exact:true}).click();
    await a.p.waitForURL(u=>u.pathname==='/termos/aceite');await a.p.getByRole('button',{name:'Ler e aceitar documento',exact:true}).click();
    await a.p.keyboard.press('Escape');await a.p.waitForURL(u=>u.pathname==='/onboarding');
    await a.p.getByRole('button',{name:'Sou eu',exact:true}).click();await a.p.waitForURL(u=>u.pathname==='/termos/aceite');checks.push(step);
    step='SELF official contract receipt releases business';await accept(a.ctx,a.p,'CONTRATANTE');
    assert.equal((await api(a.ctx,'/api/onboarding/contractual','POST',{action:'back'})).status(),409);
    await a.p.waitForURL(u=>u.pathname==='/inicio');assert.equal((await api(a.ctx,'/api/lancamentos')).status(),200);checks.push(step);
    step='OTHER OWNER USER acceptance and natural redirect';
    const b=await activate(await invite(pa,f.other,f.otherEmail));creator=b.p;await accept(b.ctx,b.p,'USUARIO');
    await b.p.waitForURL(u=>u.pathname==='/onboarding/modalidade');await b.p.getByRole('radio',{name:'Gestão Empresarial — PJ Organizar a gestão da minha empresa.'}).check();
    await shots(b.p,'modality-pj');await b.p.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
    await b.p.getByRole('heading',{name:'Responsável Contratual',exact:true}).waitFor();
    step='OTHER form only two fields and simplified confirmation four fields';
    await b.p.getByRole('button',{name:'Outra pessoa',exact:true}).click();assert.equal(await b.p.locator('.contractual-form input').count(),2);
    await shots(b.p,'other');await b.p.getByLabel('Nome',{exact:true}).fill('RESPONSÁVEL SINTÉTICO 12A');await b.p.getByLabel('E-mail',{exact:true}).fill(f.nomineeEmail);
    const created=b.p.waitForResponse(r=>r.url()===base+'/api/onboarding/contractual'&&r.request().method()==='POST');
    await b.p.getByRole('button',{name:'Enviar convite',exact:true}).click();assert.equal((await created).status(),201);
    d=shareDialog(b.p);await d.waitFor();assert.deepEqual(await d.locator('dt').allTextContents(),['Nome','E-mail','Empresa','Validade']);
    assert.deepEqual(await d.getByRole('button').allTextContents(),['Enviar pelo WhatsApp','Copiar link','Fechar']);
    assert(!/convite enviado|e-mail enviado|mensagem enviada/i.test(await d.innerText()));await shots(b.p,'confirmation',true);checks.push(step);
    step='clipboard failure keeps dialog open and allows retry';
    await b.p.evaluate(()=>{window.__realCopy=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('SYNTHETIC_DENIAL');};});
    await d.getByRole('button',{name:'Copiar link',exact:true}).click();await d.getByRole('status').filter({hasText:'Não foi possível copiar'}).waitFor();assert(await d.isVisible());
    await b.p.evaluate(()=>{navigator.clipboard.writeText=window.__realCopy;delete window.__realCopy;});checks.push(step);
    step='successful copy auto-closes with neutral notice and waiting controls';
    const firstLink=await copyContractual(b.p);
    await b.p.getByRole('heading',{name:'Aguardando Responsável Contratual',exact:true}).waitFor();
    assert((await b.p.locator('.terms-wait').innerText()).includes('Você indicou RESPONSÁVEL SINTÉTICO 12A'));
    assert(!/aguardando aprovação/i.test(await b.p.locator('main').innerText()));
    await b.p.getByRole('button',{name:'Enviar novamente',exact:true}).waitFor();await b.p.getByRole('button',{name:'Trocar responsável',exact:true}).waitFor();
    assert.equal((await api(b.ctx,'/api/lancamentos')).status(),428);
    assert(!await b.p.evaluate(secret=>Object.values(localStorage).some(x=>x.includes(secret))||Object.values(sessionStorage).some(x=>x.includes(secret)),new URL(firstLink).hash.slice(7)));
    await b.p.reload();await b.p.getByRole('heading',{name:'Aguardando Responsável Contratual',exact:true}).waitFor();
    assert.equal(await b.p.getByRole('button',{name:'Copiar link',exact:true}).count(),0);
    assert.equal((await api(b.ctx,'/api/lancamentos')).status(),428);await shots(b.p,'waiting');checks.push(step);
    step='fresh login returns to waiting without operational access';
    const returning=await context(),returnPage=await login(returning,f.otherEmail);
    await returnPage.getByRole('heading',{name:'Aguardando Responsável Contratual',exact:true}).waitFor();
    assert.equal((await api(returning,'/api/lancamentos')).status(),428);checks.push(step);
    step='resend rotates token WhatsApp auto-closes without delivery claim';
    await b.p.getByRole('button',{name:'Enviar novamente',exact:true}).click();d=shareDialog(b.p);await d.waitFor();
    assert.equal((await api(b.ctx,'/api/access/invitations/inspect','POST',{token:new URL(firstLink).hash.slice(7)})).status(),410);
    await b.p.evaluate(()=>{window.__p12aOpen=[];window.open=(...args)=>{window.__p12aOpen.push(args);return null;};});
    await d.getByRole('button',{name:'Enviar pelo WhatsApp',exact:true}).click();await d.waitFor({state:'detached'});
    const opened=await b.p.evaluate(()=>window.__p12aOpen);assert.equal(opened.length,1);const wa=new URL(opened[0][0]);assert.equal(wa.origin,'https://wa.me');assert(!wa.searchParams.has('phone'));assert.equal(opened[0][2],'noopener,noreferrer');
    const secondLink=wa.searchParams.get('text').match(/https?:\/\/[^\s]+\/ativar-acesso#token=[A-Za-z0-9_-]{43}/)[0];
    assert.notEqual(secondLink,firstLink);await b.p.getByText('Conclua o envio no WhatsApp. A plataforma não confirma o envio ou a entrega da mensagem.',{exact:true}).waitFor();checks.push(step);
    step='change responsible cancellation preserves current invitation';
    const before=await(await api(b.ctx,'/api/onboarding/contractual')).json();b.p.once('dialog',dialog=>dialog.dismiss());
    await b.p.getByRole('button',{name:'Trocar responsável',exact:true}).click();
    assert.equal((await(await api(b.ctx,'/api/onboarding/contractual')).json()).invitation.id,before.invitation.id);
    assert.equal((await api(b.ctx,'/api/access/invitations/inspect','POST',{token:new URL(secondLink).hash.slice(7)})).status(),200);checks.push(step);
    step='confirmed change uses existing revoke and a fresh explicit nomination';
    b.p.once('dialog',dialog=>dialog.accept());await b.p.getByRole('button',{name:'Trocar responsável',exact:true}).click();
    await b.p.getByRole('heading',{name:'Responsável Contratual',exact:true}).waitFor();
    assert.equal((await api(b.ctx,'/api/access/invitations/inspect','POST',{token:new URL(secondLink).hash.slice(7)})).status(),410);
    await nominate(b.p,'RESPONSÁVEL SINTÉTICO 12A REINDICADO');const link=await copyContractual(b.p);
    assert.notEqual(link,secondLink);assert.equal((await api(b.ctx,'/api/lancamentos')).status(),428);checks.push(step);
    step='nominee activated USER then automatically CONTRACT no repeated chooser';
    const nominee=await activate(link);await accept(nominee.ctx,nominee.p,'USUARIO');
    assert.equal(await nominee.p.getByRole('radio',{name:/Gestão Pessoal/}).count(),0);
    const st=await(await api(nominee.ctx,'/api/onboarding/contractual')).json();assert.equal(st.status,'AWAITING_CONTRACT');assert.equal(st.canAcceptContract,true);
    await nominee.p.waitForURL(u=>u.pathname==='/termos/aceite');assert.equal(await nominee.p.getByRole('button',{name:'Sou eu',exact:true}).count(),0);checks.push(step);
    step='nominee contract unlocks both sessions without creator login';
    await accept(nominee.ctx,nominee.p,'CONTRATANTE');await b.p.waitForURL(u=>u.pathname==='/inicio',{timeout:45000});
    await returnPage.waitForURL(u=>u.pathname==='/inicio',{timeout:45000});
    assert.equal((await api(b.ctx,'/api/lancamentos')).status(),200);assert.equal((await api(nominee.ctx,'/api/lancamentos')).status(),200);
    assert.equal((await api(returning,'/api/lancamentos')).status(),200);checks.push(step);
    step='same identity second tenant without account duplication';
    const extraResponse=await api(pa,'/api/tenants','POST',{nome:'MODO DEV UX04 SECOND '+Date.now(),email:'shared-contact@example.invalid'});assert.equal(extraResponse.status(),201);const extra=await extraResponse.json();
    const extraLink=await invite(pa,extra,f.selfEmail),existing=await context(),ex=await login(existing,f.selfEmail);await ex.goto(extraLink);
    assert.equal(await ex.getByLabel('Crie sua senha',{exact:true}).count(),0);await ex.getByRole('button',{name:'Confirmar acesso',exact:true}).click();
    await ex.waitForURL(u=>u.pathname==='/onboarding/modalidade');await ex.getByRole('radio',{name:/Gestão Empresarial/}).check();await ex.getByRole('button',{name:'Confirmar e continuar',exact:true}).click();
    await ex.getByRole('button',{name:'Sou eu',exact:true}).click();await ex.waitForURL(u=>u.pathname==='/termos/aceite');await accept(existing,ex,'CONTRATANTE');
    assert.equal((await api(existing,'/api/tenants/switch','POST',{tenantId:f.self.id})).status(),200);assert.equal((await api(existing,'/api/lancamentos')).status(),200);checks.push(step);
    console.log(JSON.stringify({state:'UX04_BROWSER_PASSED',environment:'LOCAL',checks,desktopMobile:true,lightDark:true,
      loginAttempts,actualMessagesSent:0,rawSecretsPrinted:false,administrativeVariantPreserved:true}));
  } catch(e) {
    const uiHeadings=creator?await creator.locator('.terms-card h1,.terms-card h2').allTextContents().catch(()=>[]):[];
    console.log(JSON.stringify({state:'UX04_BROWSER_FAILED',step,type:e.name,
      safeError:String(e.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[url]').slice(0,150),uiHeadings,
      location:e.stack?.split('\n').find(line=>line.includes('ux04-first-access.browser.cjs:')),checks}));process.exitCode=1;
  } finally {
    if(creator)await creator.evaluate(()=>navigator.clipboard.writeText('')).catch(()=>{});await browser.close();c.password=undefined;
  }
}
main().catch(e=>{console.log(JSON.stringify({state:'UX04_BROWSER_ABORTED',type:e.name,code:e.code}));process.exitCode=1;});
