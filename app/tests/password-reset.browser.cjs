const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const [worker,out,modulePath]=process.argv.slice(2),{chromium}=require(modulePath),checks=[],base='http://localhost:3020';
assert(/^dez-a27-http-[a-f0-9]{8}$/.test(worker));let browser,stage='browser setup';
const cfg=JSON.parse(execFileSync('docker',['exec',worker,'cat','/tmp/password-reset-browser.json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
async function main(){
 browser=await chromium.launch({channel:'msedge',headless:true});let client=150;
 async function context(mobile=false,dark=false){const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,extraHTTPHeaders:{'x-a24-client':String(client++)},permissions:['clipboard-read','clipboard-write']});await c.addInitScript(dark=>localStorage.setItem('theme',dark?'dark':'light'),dark);await c.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());return c;}
 async function login(p,email,password){await p.goto(base+'/login');await p.getByLabel('E-mail',{exact:true}).fill(email);await p.getByLabel('Senha',{exact:true}).fill(password);await p.getByRole('button',{name:'Entrar',exact:true}).click();}
 const admin=await context(),pa=await admin.newPage();pa.setDefaultTimeout(30000);await login(pa,cfg.adminEmail,cfg.adminPassword);await pa.waitForURL('**/plataforma');
 for(const mobile of [false,true]){
  stage=mobile?'mobile temporary reset':'desktop temporary reset';const name=mobile?'browsermobile':'browser';
  await pa.setViewportSize(mobile?{width:390,height:844}:{width:1366,height:900});
  await pa.getByRole('button',{name:`Resetar senha de RESET LOCAL ${name}`,exact:true}).click();
  const dialog=pa.getByRole('dialog',{name:'Resetar senha'});await dialog.waitFor();let resets=0;
  const count=r=>{if(r.method()==='POST'&&r.url().endsWith('/password-reset'))resets++;};pa.on('request',count);
  await dialog.getByLabel('Sua senha de administrador').fill(cfg.adminPassword);
  await dialog.getByRole('button',{name:'Gerar senha provisória',exact:true}).click();
  const secret=dialog.getByLabel('Senha provisória',{exact:true});await secret.waitFor();const temporary=await secret.inputValue();assert.match(temporary,/^D9![A-Za-z0-9_-]{32}a$/);
  await dialog.getByRole('button',{name:'Copiar senha',exact:true}).click();await dialog.getByText('Senha copiada.',{exact:true}).waitFor();assert.equal(await pa.evaluate(()=>navigator.clipboard.readText()),temporary);await pa.evaluate(()=>navigator.clipboard.writeText(''));
  assert.equal(resets,1);assert(!await pa.evaluate(v=>JSON.stringify({...localStorage,...sessionStorage}).includes(v),temporary));
  await pa.screenshot({path:path.join(out,mobile?'admin-one-time-mobile.png':'admin-one-time-desktop.png'),mask:[secret]});
  await dialog.getByRole('button',{name:'Fechar confirmação',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await pa.getByRole('button',{name:`Resetar senha de RESET LOCAL ${name}`,exact:true}).click();await dialog.waitFor();assert.equal(await dialog.locator('#temporary-password').count(),0);assert(!await dialog.innerText().then(s=>s.includes(temporary)));await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(resets,1);pa.off('request',count);
  const user=await context(mobile,mobile),p=await user.newPage();p.setDefaultTimeout(30000);let changes=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/account/password'))changes++;});
  await login(p,`reset-${name}@example.invalid`,temporary);await p.waitForURL('**/minha-conta');await p.getByText('Defina sua senha definitiva para continuar.',{exact:true}).waitFor();
  assert.equal(await p.getByRole('link',{name:'Minhas empresas',exact:true}).count(),0);
  await p.goto(base+'/inicio');await p.waitForURL('**/minha-conta');assert.equal(await p.evaluate(()=>fetch('/api/tenants').then(r=>r.status)),428);
  await p.getByLabel('Senha provisória',{exact:true}).fill(temporary);await p.getByLabel('Nova senha',{exact:true}).fill(cfg.newPassword);await p.getByLabel('Confirmar nova senha',{exact:true}).fill(cfg.newPassword);
  const eye=p.locator('[aria-controls="new-password"][data-reveal="hold"]'),input=p.getByLabel('Nova senha',{exact:true});
  await eye.focus();await p.keyboard.down('Space');await p.waitForFunction(()=>document.querySelector('#new-password').type==='text');await p.keyboard.up('Space');assert.equal(await input.getAttribute('type'),'password');assert.equal(changes,0);
  if(mobile){const b=await eye.boundingBox(),cdp=await user.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await p.waitForFunction(()=>document.querySelector('#new-password').type==='text');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await p.waitForFunction(()=>document.querySelector('#new-password').type==='password');await cdp.detach();}
  else{await eye.hover();await p.mouse.down();await p.waitForFunction(()=>document.querySelector('#new-password').type==='text');await p.mouse.up();assert.equal(await input.getAttribute('type'),'password');}
  assert.equal(changes,0);await input.focus();await p.keyboard.press('Tab');assert.equal(await p.locator(':focus').getAttribute('type'),'button');
  assert.equal(await p.locator('html').getAttribute('data-theme'),mobile?'dark':'light');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await p.screenshot({path:path.join(out,mobile?'mandatory-change-mobile-dark.png':'mandatory-change-desktop-light.png')});
  await p.getByRole('button',{name:'Salvar nova senha',exact:true}).click();await p.getByRole('link',{name:'Entrar com a nova senha',exact:true}).waitFor();assert.equal(changes,1);
  await login(p,`reset-${name}@example.invalid`,cfg.newPassword);await p.waitForURL(url=>url.pathname!='/login');
  await p.goto(base+'/minha-conta');await p.getByRole('button',{name:'Alterar senha',exact:true}).waitFor();assert.equal(await p.getByText('Defina sua senha definitiva para continuar.',{exact:true}).count(),0);
  checks.push((mobile?'mobile/dark':'desktop/light')+': admin one-time display/copy/close; mandatory login change; URL/API block; definitive login; press-and-hold/Tab/'+(mobile?'touch cancellation':'mouse')+' without submit');
  await user.close();
 }
 stage='support';const loginPage=await admin.newPage();await loginPage.goto(base+'/login');assert.equal(await loginPage.getByRole('link',{name:'Suporte via WhatsApp',exact:true}).count(),0);await loginPage.getByText('Suporte via WhatsApp — em preparação').waitFor();checks.push('no published contact, autonomous recovery or email link');
 fs.writeFileSync(path.join(out,'BROWSER-RESULT.json'),JSON.stringify({state:'PASSED',checks,externalRequestsAllowed:false,secretsMasked:true},null,2));console.log(JSON.stringify({state:'PASSED',checks:checks.length}));
}
main().catch(e=>{console.error(JSON.stringify({state:'FAILED',stage,type:e.name,code:e.code||null,location:(e.stack||'').split('\n').find(v=>v.includes('password-reset.browser.cjs'))?.trim()}));process.exitCode=1;}).finally(()=>browser?.close());
