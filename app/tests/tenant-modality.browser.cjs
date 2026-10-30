// Visual LOCAL check on the compiled artifact. Real synthetic sessions/context;
// confirmation is intercepted with 409 so this suite never changes the tenant.
const assert=require('node:assert/strict'),path=require('node:path');
async function main(){let raw='';for await(const s of process.stdin)raw+=s;const c=JSON.parse(raw);raw='';assert(c.base==='http://localhost:3020'&&c.scope==='ux02b-isolated');
 const {chromium}=require(c.playwrightModule),browser=await chromium.launch({channel:'msedge',headless:true}),checks=[];let step='setup';
 const ok=(n,v)=>{step=n;assert(v,n);checks.push(n);};
 try{for(const [who,email]of[['owner','ux02b-pf@example.invalid'],['member','ux02b-member@example.invalid']]){
  const ctx=await browser.newContext({viewport:{width:1366,height:900},hasTouch:true}),p=await ctx.newPage();p.setDefaultTimeout(45000);const errors=[];p.on('pageerror',e=>errors.push(e.name));
  await p.goto(c.base+'/login');await p.getByLabel('E-mail',{exact:true}).fill(email);await p.getByLabel('Senha',{exact:true}).fill(c.password);await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForURL(u=>u.pathname!='/login');
  const switched=await ctx.request.post(c.base+'/api/tenants/switch',{headers:{Origin:c.base},data:{tenantId:c.pending}});ok(who+' real authorized tenant switch',switched.status()===200);
  await p.goto(c.base+'/onboarding/modalidade');const heading=who==='owner'?'Como você deseja utilizar este espaço?':'Aguardando o Proprietário';await p.getByRole('heading',{name:heading,exact:true}).waitFor();
  const session=await(await ctx.request.get(c.base+'/api/auth/session')).json(),id=session.user.id;
  let confirmations=0;await ctx.route('**/api/onboarding/modalidade',async route=>{assert.equal(route.request().method(),'POST');assert.deepEqual(Object.keys(route.request().postDataJSON()),['modalidade']);confirmations++;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Conflito sintético: atualize a página e confira a modalidade.'})});});
  for(const width of [1366,768,390])for(const mode of ['light','dark']){
   step=who+' '+width+' '+mode;await p.setViewportSize({width,height:900});await p.evaluate(({id,mode})=>{localStorage.setItem('10s:appearance:v1:identity:'+id,JSON.stringify({version:1,mode,palette:{primary:'#2563EB',accent:'#0E7490',background:'#F3F7FA',surface:'#FFFFFF',sidebar:'#FFFFFF',text:'#0F172A',secondary:'#475569',border:'#D5DFE8'}}));window.dispatchEvent(new StorageEvent('storage'));},{id,mode});await p.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode);
   ok('tenant name visible',await p.getByText('MODO DEV UX02B PENDING',{exact:true}).isVisible());ok('no horizontal overflow',!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   const logo=p.locator('.modality-logo');ok('original official asset',await logo.getAttribute('src')==='/experimentacao/assets/brand-approved.png'&&await logo.evaluate(el=>el.naturalWidth===2508));
   if(who==='owner'){ok('only PF/PJ choices',await p.getByRole('radio').count()===2);for(const r of await p.locator('.modality-option').all()){const b=await r.boundingBox();ok('responsive touch-sized choice',b&&b.height>=44&&b.x>=0&&b.x+b.width<=width);}const b=await p.getByRole('button',{name:'Confirmar e continuar',exact:true}).boundingBox();ok('confirmation reachable',b&&b.height>=44&&b.width<=width);}
   else ok('unauthorized member sees no classification form',await p.getByRole('radio').count()===0&&await p.locator('form').count()===0);
   await p.screenshot({animations:'disabled',fullPage:true,path:path.join(c.output,`modality-${who}-${width}-${mode}.png`)});
  }
  if(who==='owner'){
   const button=p.getByRole('button',{name:'Confirmar e continuar',exact:true}),pf=p.getByRole('radio',{name:/Gestão Pessoal/}),pj=p.getByRole('radio',{name:/Gestão Empresarial/});ok('no default mode and no automatic request',await button.isDisabled()&&confirmations===0);await pf.focus();await p.keyboard.press('Space');ok('keyboard selects PF',await pf.isChecked());await p.keyboard.press('ArrowDown');ok('keyboard selects PJ',await pj.isChecked());await p.keyboard.press('Tab');ok('keyboard reaches explicit confirmation',await button.evaluate(el=>document.activeElement===el));await p.keyboard.press('Enter');await p.locator('.modality-error[role=alert]').waitFor();ok('conflict visible without navigation or auto retry',confirmations===1&&new URL(p.url()).pathname==='/onboarding/modalidade');await pf.tap();ok('mobile touch selects explicit PF',await pf.isChecked());
  }
  ok('no browser runtime error',errors.length===0);await ctx.close();
 }console.log(JSON.stringify({state:'TENANT_MODALITY_VISUAL_PASSED',checks,screenshots:12,realDataUsed:false}));
 }catch(e){console.log(JSON.stringify({state:'TENANT_MODALITY_VISUAL_FAILED',step,error:e.name,message:e.message}));process.exitCode=1;}finally{await browser.close();}}
main().catch(e=>{console.log(JSON.stringify({state:'VISUAL_GUARD_FAILED',error:e.name}));process.exitCode=1;});
