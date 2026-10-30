// Presentation regression: synthetic session/choices intercepted in LOCAL only.
// No real login, database, memberships or backend operations are used here.
const assert = require('node:assert/strict'), path = require('node:path');
async function main() {
  let input=''; for await(const chunk of process.stdin) input+=chunk;
  const c=JSON.parse(input); input=''; assert(['http://127.0.0.1:3034','http://127.0.0.1:3035'].includes(c.base));
  const {chromium}=require(c.playwrightModule),browser=await chromium.launch({channel:'msedge',headless:true});
  const checks=[], errors=[]; let step='setup';
  const makeChoices=n=>Array.from({length:n},(_,i)=>({id:'synthetic-'+i,nome:`Empresa sintética ${i+1}`,kind:'MEMBERSHIP',role:['OWNER','ADMIN','MEMBER'][i%3],isActive:i===0}));
  async function setup({count=6,admin=true,width=1366,height=1000,mode='light',mixed=false,missingEmail=false,failure=false}={}) {
    const ctx=await browser.newContext({viewport:{width,height}}),p=await ctx.newPage(),posts=[];
    p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.name));
    await ctx.addCookies([{name:'authjs.session-token',value:c.cookie,url:c.base,httpOnly:true}]);
    await ctx.addInitScript(({mode})=>localStorage.setItem('10s:appearance:v1:identity:ux01-local',JSON.stringify({version:1,mode,palette:{primary:'#2563EB',accent:'#0E7490',background:'#F3F7FA',surface:'#FFFFFF',sidebar:'#FFFFFF',text:'#0F172A',secondary:'#475569',border:'#D5DFE8'}})),{mode});
    const choices=makeChoices(count);
    if(mixed&&count>=6){choices[0].nome='Empresa sintética com nome longo para conferir quebra de linha sem perder o nome completo';choices[4]={...choices[4],kind:'ADVISORY',advisoryGrantId:'advisory-synthetic'};choices[5]={...choices[5],kind:'SUPPORT_GRANT',grantId:'grant-synthetic',accessLevel:'READ_ONLY',expiresAt:'2099-01-01T12:00:00Z',entryPath:'/suporte'};}
    await ctx.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      const json=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(body)});
      if(url.pathname==='/api/auth/session')return json({user:{id:'ux01-local',authMode:'identity',name:'Pessoa Sintética UX 01',...(!missingEmail?{email:'ux01@example.invalid'}:{}),tenantNome:'NÃO EXIBIR COMO IDENTIDADE'},expires:'2099-01-01T00:00:00Z'});
      if(url.pathname==='/api/tenants')return failure?json({error:'Synthetic failure'},503):json(choices,200,{'X-Platform-Admin':String(admin),'X-Support-Operator':'false'});
      if(req.method()==='POST'){posts.push({path:url.pathname,body:req.postDataJSON()});if(url.pathname==='/api/auth/signout')return json({url:c.base+'/login'});return json({active:true,cleared:true});}
      if(url.pathname==='/api/auth/csrf')return json({csrfToken:'synthetic-local-csrf'});
      throw Error('UNEXPECTED_API:'+url.pathname);
    });
    for(const destination of ['/inicio','/plataforma','/suporte','/minha-conta','/login'])await ctx.route(c.base+destination,route=>route.fulfill({contentType:'text/html',body:'<h1>Destino sintético</h1>'}));
    await p.goto(c.base+'/selecionar-tenant');await p.getByRole('heading',{name:'Selecionar empresa',exact:true}).waitFor();
    await p.getByText('Pessoa Sintética UX 01',{exact:true}).waitFor();
    if(count&&!failure)await p.locator('.tenant-selection-choice').last().waitFor();
    await p.waitForTimeout(150);return{ctx,p,posts,choices};
  }
  try {
    for(const count of [0,1,5,6,12]){
      step='choice count '+count;const x=await setup({count}),{p}=x;
      assert.equal(await p.locator('.tenant-selection-choice').count(),count);
      assert.equal(await p.locator('.tenant-selection-brand').getAttribute('src'),'/experimentacao/assets/brand-approved.png');
      assert.equal(await p.getByRole('link',{name:'Administração da Plataforma',exact:true}).getAttribute('href'),'/plataforma');
      assert(await p.getByText('ux01@example.invalid',{exact:true}).isVisible());assert.equal(await p.getByText('NÃO EXIBIR COMO IDENTIDADE',{exact:true}).count(),0);
      if(count){assert(await p.getByRole('heading',{name:'Minhas empresas',exact:true}).isVisible());const m=await p.locator('.tenant-selection-list').evaluate(el=>{const box=el.getBoundingClientRect();return{count:[...el.children].filter(r=>{const b=r.getBoundingClientRect();return b.top>=box.top&&b.bottom<=box.bottom+1;}).length,scroll:el.scrollHeight>el.clientHeight+1};});assert.equal(m.count,Math.min(5,count));assert.equal(m.scroll,count>5);}
      else await p.getByText('Sua conta não possui acesso ativo a nenhuma empresa.',{exact:true}).waitFor();
      checks.push(step);await x.ctx.close();
    }
    for(const [width,height] of [[1366,1000],[768,1024],[414,896],[360,740]])for(const mode of ['light','dark']){
      step=`responsive ${width} ${mode}`;const x=await setup({width,height,mode,mixed:true,count:12}),{p}=x;
      assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      const columnBefore=await p.locator('.tenant-selection-columns').boundingBox(),footerBefore=await p.locator('.tenant-selection-account').boundingBox();
      await p.locator('.tenant-selection-list').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.equal((await p.locator('.tenant-selection-columns').boundingBox()).y,columnBefore.y);assert.equal((await p.locator('.tenant-selection-account').boundingBox()).y,footerBefore.y);
      assert(await p.getByText('Pessoa Sintética UX 01',{exact:true}).isVisible());
      await p.locator('.tenant-selection-list').evaluate(el=>el.scrollTop=0);
      const buttons=p.locator('.tenant-selection-choice');await buttons.first().focus();for(let i=0;i<6;i++)await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(()=>document.activeElement?.textContent?.includes('Empresa sintética 7')),true);
      assert(await p.locator('.tenant-selection-list').evaluate(el=>el.scrollTop>0));
      for(const button of await p.locator('.tenant-selection-account .btn,.tenant-selection-platform .btn').all()){const b=await button.boundingBox();assert(b&&b.height>=44&&b.x>=0&&b.x+b.width<=width);}
      await p.locator('.tenant-selection-list').evaluate(el=>el.scrollTop=0);
      await p.screenshot({path:path.join(c.output,`tenant-selection-${width}-${mode}.png`),fullPage:true});checks.push(step);await x.ctx.close();
    }
    step='permissions and missing optional email';{const x=await setup({admin:false,missingEmail:true});assert.equal(await x.p.getByRole('link',{name:'Administração da Plataforma',exact:true}).count(),0);assert.equal(await x.p.locator('.tenant-selection-user-email').count(),0);await x.ctx.close();checks.push(step);}
    step='error state';{const x=await setup({failure:true});await x.p.locator('.login-error[role="alert"]').waitFor();assert.equal(await x.p.locator('.tenant-selection-choice').count(),0);await x.ctx.close();checks.push(step);}
    for(const index of [0,4,5]){step='unchanged selection payload '+index;const x=await setup({mixed:true});await x.p.locator('.tenant-selection-choice').nth(index).click();await x.p.waitForURL(c.base+(index===5?'/suporte':'/inicio'));assert.deepEqual(x.posts,[{path:'/api/tenants/switch',body:{tenantId:'synthetic-'+index,...(index===4?{advisoryGrantId:'advisory-synthetic'}:{}),...(index===5?{grantId:'grant-synthetic'}:{})}}]);checks.push(step);await x.ctx.close();}
    step='context clear keeps its existing endpoint and destination';{const x=await setup();await x.p.getByRole('button',{name:'Sair do contexto empresarial',exact:true}).click();await x.p.waitForURL(c.base+'/plataforma');assert.equal(x.posts[0].path,'/api/access/context/clear');checks.push(step);await x.ctx.close();}
    step='signout retains callback';{const x=await setup();await x.p.getByRole('button',{name:'Sair',exact:true}).click();await x.p.waitForURL(c.base+'/login');assert.equal(x.posts[0].path,'/api/auth/signout');checks.push(step);await x.ctx.close();}
    assert.deepEqual(errors,[]);console.log(JSON.stringify({state:'TENANT_SELECTION_BROWSER_PASSED',checks,realDatabaseWrites:0,realSessionsUsed:0,apiFixtures:'LOCAL_INTERCEPTED',desktopTabletMobile:true,keyboard:true,lightDark:true}));
  }catch(e){console.log(JSON.stringify({state:'TENANT_SELECTION_BROWSER_FAILED',step,type:e.name,error:String(e.message).split('\n')[0].slice(0,180),checks}));process.exitCode=1;}finally{await browser.close();}
}
main().catch(e=>{console.log(JSON.stringify({state:'TENANT_SELECTION_BROWSER_ABORTED',type:e.name}));process.exitCode=1;});
