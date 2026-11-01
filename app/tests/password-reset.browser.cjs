const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const [worker,out,modulePath]=process.argv.slice(2),{chromium}=require(modulePath),checks=[],base='http://localhost:3020';
assert(/^dez-a27-http-[a-f0-9]{8}$/.test(worker));let browser,stage='browser setup',lastPage;
const dock=(args,input)=>execFileSync('docker',['exec','-i','-w','/work',worker,...args],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
const cfg=JSON.parse(dock(['cat','/tmp/password-reset-browser.json']));
function mail(email){return JSON.parse(dock(['node','-e',"let s='';process.stdin.on('data',b=>s+=b).on('end',async()=>{const r=await fetch('http://127.0.0.1:8025/?email='+encodeURIComponent(JSON.parse(s)),{headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}});const {message}=await r.json();const decoded=message?.replace(/=\\r?\\n/g,'').replace(/=([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));const prefix='http://localhost:3020/redefinir-senha#token=',start=decoded?.indexOf(prefix)??-1;const link=start>=0?decoded.slice(start,start+prefix.length+80):null;process.stdout.write(JSON.stringify({link}))})"],JSON.stringify(email)));}
async function main(){
 browser=await chromium.launch({channel:'msedge',headless:true});
 let client=150;
 async function context(mobile=false,dark=false){const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,extraHTTPHeaders:{'x-a24-client':String(client++)}});await c.addInitScript(dark=>localStorage.setItem('theme',dark?'dark':'light'),dark);await c.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());return c;}
 const admin=await context(),pa=lastPage=await admin.newPage();pa.setDefaultTimeout(30000);
 stage='admin login';await pa.goto(base+'/login');await pa.getByLabel('E-mail',{exact:true}).fill(cfg.adminEmail);await pa.getByLabel('Senha',{exact:true}).fill(cfg.adminPassword);await pa.getByRole('button',{name:'Entrar',exact:true}).click();await pa.waitForURL('**/plataforma');
 for(const mobile of [false,true]){
  stage=mobile?'mobile reset':'desktop reset';const name=mobile?'browsermobile':'browser';
  await pa.getByRole('button',{name:`Resetar senha de RESET LOCAL ${name}`,exact:true}).click();
  const dialog=pa.getByRole('dialog',{name:'Resetar senha'});await dialog.waitFor();assert.equal(await dialog.locator('a[href*="redefinir-senha"]').count(),0);
  const bounds=await dialog.boundingBox();assert(Math.abs(bounds.x-(1366-bounds.width)/2)<2,'CENTERED_RESET_CONFIRMATION');
  await dialog.getByLabel('Sua senha de administrador').fill(cfg.adminPassword);
  if(!mobile)await pa.screenshot({path:path.join(out,'admin-confirmation-desktop-light.png')});
  await dialog.getByRole('button',{name:'Confirmar envio',exact:true}).click();await dialog.waitFor({state:'hidden'});await pa.getByText('Link enviado ao e-mail cadastrado.',{exact:false}).waitFor();
  assert(!await pa.locator('body').innerText().then(t=>t.includes('/redefinir-senha#token=')));
  const {link}=mail(`reset-${name}@example.invalid`);assert(link,'CAPTURED_MAIL_LINK');
  const user=await context(mobile,mobile),p=lastPage=await user.newPage();p.setDefaultTimeout(30000);let posts=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/account/password-reset'))posts++;});
  await p.goto(link);await p.getByLabel('Nova senha',{exact:true}).fill(cfg.newPassword);await p.getByLabel('Confirme sua senha',{exact:true}).fill(cfg.newPassword);assert(!p.url().includes('#'));
  const eye=p.locator('[aria-controls="reset-new-password"][data-reveal="hold"]'),input=p.getByLabel('Nova senha',{exact:true});
  await eye.focus();await p.keyboard.down('Space');await p.waitForFunction(()=>document.querySelector('#reset-new-password').type==='text');await p.keyboard.up('Space');assert.equal(await input.getAttribute('type'),'password');assert.equal(posts,0);
  if(mobile){const box=await eye.boundingBox(),cdp=await user.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await p.waitForFunction(()=>document.querySelector('#reset-new-password').type==='text');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>document.querySelector('#reset-new-password').type==='password');await cdp.detach();}
  else{await eye.hover();await p.mouse.down();await p.waitForFunction(()=>document.querySelector('#reset-new-password').type==='text');await p.mouse.up();assert.equal(await input.getAttribute('type'),'password');}
  assert.equal(posts,0);assert.equal(await p.locator('html').getAttribute('data-theme'),mobile?'dark':'light');
  await input.focus();await p.keyboard.press('Tab');assert.equal(await p.locator(':focus').getAttribute('type'),'button');assert.equal(posts,0);
  await p.screenshot({path:path.join(out,mobile?'reset-mobile-dark.png':'reset-desktop-light.png')});
  await p.getByRole('button',{name:'Salvar nova senha',exact:true}).click();await p.getByRole('link',{name:'Ir para o login',exact:true}).waitFor();assert.equal(posts,1);
  await p.getByRole('link',{name:'Ir para o login',exact:true}).click();await p.getByLabel('E-mail',{exact:true}).fill(`reset-${name}@example.invalid`);await p.getByLabel('Senha',{exact:true}).fill(cfg.newPassword);await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForURL(url=>url.pathname!='/login');
  await p.goto(base+'/minha-conta');await p.getByRole('heading',{name:'Minha conta',exact:true}).waitFor();
  checks.push((mobile?'mobile dark':'desktop light')+': administrator email-only issuance; user reset and normal login; password press/release, keyboard and '+(mobile?'touch':'mouse')+' without submit');
  await user.close();lastPage=pa;
 }
 stage='unpublished support';const login=await admin.newPage();await login.goto(base+'/login');assert.equal(await login.getByRole('link',{name:'Suporte via WhatsApp',exact:true}).count(),0);await login.getByText('Suporte via WhatsApp — em preparação').waitFor();await login.screenshot({path:path.join(out,'login-support-unpublished.png')});checks.push('login keeps discreet unpublished support without exposing a contact or autonomous recovery');
 fs.writeFileSync(path.join(out,'BROWSER-RESULT.json'),JSON.stringify({state:'PASSED',checks,externalRequestsAllowed:false},null,2));console.log(JSON.stringify({state:'PASSED',checks:checks.length}));
}
main().catch(async e=>{if(lastPage)await lastPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(JSON.stringify({state:'FAILED',stage,type:e.name,code:e.code||null,message:e.name==='AssertionError'?String(e.message).slice(0,120):'browser step failed'}));process.exitCode=1;}).finally(()=>browser?.close());
