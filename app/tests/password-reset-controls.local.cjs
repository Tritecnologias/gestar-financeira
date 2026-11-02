/** Focused browser fixture for actual AccountClient/PasswordInput source.
 * No database, authentication service, remote host or publication executor. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{createHash}=require('node:crypto');
const {passwordControls}=require('./password-reset-controls.browser.cjs');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||''),modulePath=process.argv[3];
assert(path.isAbsolute(process.argv[2]||'')&&modulePath,'Usage: node tests/password-reset-controls.local.cjs <new-output-directory> <playwright-module>');
assert(!fs.existsSync(out),'NEW_EVIDENCE_DIRECTORY_REQUIRED');fs.mkdirSync(out,{recursive:true});
const {webpack}=require('next/dist/compiled/webpack/webpack'),{chromium}=require(modulePath),checks=[];
let browser,server,stage='fixture bundle';
const write=(name,source)=>fs.writeFileSync(path.join(out,name),source);
async function main(){
 // Only the framework navigation/authentication boundary is simulated. The
 // fields, events, React state, validation, styles and theme code are unmodified.
 write('link.cjs',"const React=require('react');module.exports=({children,...props})=>React.createElement('a',props,children);");
 write('navigation.cjs',"exports.usePathname=()=>'/minha-conta';");
 write('auth.cjs',"exports.signOut=()=>{throw Error('Authentication is outside this UI fixture');};");
 write('typescript-loader.cjs',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
 write('css-loader.cjs',"module.exports=function(source){return 'const s=document.createElement(\"style\");s.textContent='+JSON.stringify(source)+';document.head.appendChild(s);';};");
 write('entry.tsx',`import '@/app/globals.css';import React from 'react';import {createRoot} from 'react-dom/client';import AccountClient from '@/components/account/AccountClient';import {applyPreference,defaultPreference} from '@/lib/appearance';const p=new URLSearchParams(location.search);applyPreference(document.documentElement,defaultPreference(p.get('theme')==='dark'?'dark':'light'));createRoot(document.getElementById('root')!).render(<AccountClient name="USUARIO SINTETICO UX A27" email="ux-a27@example.invalid" platformAdmin={false} supportOperator={false} passwordChangeRequired={p.get('required')==='true'} expiresAt="2030-01-01T12:30:00.000Z"/>);`);
 await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'production',devtool:false,entry:path.join(out,'entry.tsx'),output:{path:out,filename:'bundle.js'},optimization:{minimize:false},resolve:{extensions:['.tsx','.ts','.js','.json'],modules:[path.join(app,'node_modules')],alias:{'@':path.join(app,'src'),'next/link$':path.join(out,'link.cjs'),'next/navigation$':path.join(out,'navigation.cjs'),'next-auth/react$':path.join(out,'auth.cjs')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(out,'typescript-loader.cjs')},{test:/\.css$/,use:path.join(out,'css-loader.cjs')}]}});
  compiler.run((error,stats)=>compiler.close(()=>{if(error||stats.hasErrors()){write('bundle-errors.json',JSON.stringify(stats?.toJson({all:false,errors:true}),null,2));reject(error||new Error('UI_FIXTURE_BUNDLE_FAILED'));}else resolve();}));
 });
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\'; font-src \'self\'"><title>LOCAL — Account password controls</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(fs.readFileSync(path.join(out,'bundle.js')));}
  else if(req.method==='GET'&&new URL(req.url,'http://localhost').pathname==='/minha-conta'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
  else{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const required of [false,true])for(const theme of ['light','dark'])for(const mobile of [false,true]){
  stage=[required?'mandatory':'normal',theme,mobile?'mobile':'desktop'].join('-');let external=0,posts=0,pending;const pageErrors=[];
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external++;return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>pageErrors.push(e.name));
  await page.route('**/api/account/password',route=>{posts++;pending=route;});
  await page.goto(origin+'/minha-conta?required='+required+'&theme='+theme);
  if(!required)await page.getByRole('button',{name:'Alterar senha',exact:true}).click();
  const current=page.getByLabel(required?'Senha provisória':'Senha atual',{exact:true});await current.waitFor();
  assert(await current.evaluate(e=>e===document.activeElement));
  await current.fill('Synthetic-current-password!');await page.getByLabel('Nova senha',{exact:true}).fill('Synthetic-definitive-password!');await page.getByLabel('Confirmar nova senha',{exact:true}).fill('Synthetic-definitive-password!');
  const controls=await passwordControls(page,{required,mobile});
  assert.equal(posts,0);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.getByRole('button',{name:'Cancelar',exact:true}).count(),required?0:1);
  assert.equal(await page.getByRole('link',{name:'Minhas empresas',exact:true}).count(),required?0:1);
  await page.screenshot({path:path.join(out,stage+'.png'),fullPage:true});
  // Only an intentional save may reach the simulated API. Pending state must
  // disable every field/eye; existing success feedback remains unchanged.
  await page.getByRole('button',{name:'Salvar nova senha',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#current-password').disabled);
  assert.equal(posts,1);for(const id of ['current-password','new-password','confirm-password']){assert(await page.locator('#'+id).isDisabled());assert(await page.locator(`button[aria-controls="${id}"]`).isDisabled());assert.equal(await page.locator('#'+id).getAttribute('type'),'password');}
  assert.deepEqual(pending.request().postDataJSON(),{currentPassword:'Synthetic-current-password!',newPassword:'Synthetic-definitive-password!',confirmation:'Synthetic-definitive-password!'});
  await pending.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});await page.getByRole('link',{name:'Entrar com a nova senha',exact:true}).waitFor();assert.equal(posts,1);assert.equal(external,0);assert.deepEqual(pageErrors,[]);
  checks.push({state:'PASS',required,theme,mobile,...controls,explicitSaveRequests:1,disabledWhileSaving:true,externalRequests:0});await context.close();
  console.log(JSON.stringify({state:'PASS',scenario:stage}));
 }
 const files=['src/components/account/AccountClient.tsx','src/components/ui/PasswordInput.tsx','src/components/access/AdmissionClient.tsx'];
 write('RESULT.json',JSON.stringify({state:'PASS',checks,scenarios:checks.length,fieldConfigurations:checks.length*3,fixture:'actual AccountClient and PasswordInput; framework navigation/auth and save response simulated',authenticationOrDatabaseTestsRepeated:false,remoteAccess:false,sourceHashes:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]))},null,2));
}
main().catch(error=>{write('FAILURE.json',JSON.stringify({state:'FAIL',stage,type:error.name,message:error.message,location:error.stack?.split('\n').find(line=>line.includes('password-reset-controls'))},null,2));console.error(JSON.stringify({state:'FAIL',stage,type:error.name,message:error.message}));process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
