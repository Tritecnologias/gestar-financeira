// Behavioral tests of the actual script. Rendering/keyboard is separately checked in browser.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/experimentacao/pilot.js',import.meta.url),'utf8');
const flush=()=>new Promise(setImmediate);
function fixture({acknowledged=false,interested=false,hash='#convite='+'x'.repeat(43),valid=true}={}){
 const nodes=[],requests=[],events={},status={acknowledged,interested,valid},skip={focus(){}};
 function element(tag){const e={tag,events:{},children:{},hidden:false,disabled:false,textContent:'',open:false,setAttribute(){},querySelector(s){return this.children[s]??=(element(s));},addEventListener(n,f){this.events[n]=f;},showModal(){this.open=true;},close(){this.open=false;},focus(){},remove(){this.removed=true;}};nodes.push(e);return e;}
 const location={hash,pathname:'/experimentacao',search:''};
 vm.runInNewContext(code,{URLSearchParams,location,history:{replaceState(){location.hash='';}},document:{createElement:element,querySelector(){return skip;},body:{append(){}}},addEventListener(n,f){events[n]=f;},fetch:async(url,options)=>{const b=JSON.parse(options.body);requests.push(b.action);if(status.valid){if(b.action==='acknowledge')status.acknowledged=true;if(b.action==='interest')status.interested=true;}return{ok:status.valid,status:status.valid?200:404,json:async()=>({firstName:'Bruno',acknowledged:status.acknowledged,interested:status.interested,message:'Interesse registrado'})};}});
 return{nodes,requests,events,status,location,get dialog(){return nodes.find(n=>n.tag==='dialog');},get panel(){return nodes.find(n=>n.tag==='section');}};
}
test('each new opening of unconfirmed active original link opens welcome, including after interest',async()=>{
 for(const interested of [false,true])for(let i=0;i<2;i++){const f=fixture({interested});await flush();assert(f.dialog.open);assert(!f.panel.children['.dez-pilot-resume'].hidden);}
});
test('close and Escape do not acknowledge or refuse; resume remains and revalidates',async()=>{
 const f=fixture();await flush();f.dialog.children['.dez-pilot-close'].events.click();assert(!f.dialog.open);assert.deepEqual(f.requests,['inspect']);assert(!f.status.acknowledged);
 f.panel.children['.dez-pilot-resume'].events.click();await flush();assert(f.dialog.open);let prevented=false;f.dialog.events.cancel({preventDefault(){prevented=true;}});assert(prevented&&!f.dialog.open);assert(!f.status.acknowledged);
 f.events.pageshow({persisted:true});await flush();assert(f.dialog.open);
});
test('explicit welcome acknowledgment suppresses automatic modal; interest remains independent',async()=>{
 const f=fixture();await flush();await f.dialog.children['.dez-pilot-accept'].events.click();assert(f.status.acknowledged&&!f.dialog.open);assert(f.panel.children['.dez-pilot-resume'].hidden);
 const next=fixture({acknowledged:true});await flush();assert(!next.dialog.open);await next.panel.children['.dez-pilot-interest'].events.click();assert(next.status.interested);assert(next.panel.children['.dez-pilot-interest'].hidden);
});
test('cancelled/expired link cannot open and invalidation while suspended closes popup',async()=>{
 const f=fixture({valid:false});await flush();assert(!f.dialog.open);assert(f.panel.children['.dez-pilot-resume'].hidden);assert(f.panel.children['.dez-pilot-interest'].hidden);
 const pending=fixture();await flush();pending.status.valid=false;pending.events.pageshow({persisted:true});await flush();assert(!pending.dialog.open);
});
test('plain preview does not render invitation UI or make requests; table replaces temporary share panel',async()=>{
 const f=fixture({hash:''});await flush();assert.equal(f.nodes.length,0);assert.equal(f.requests.length,0);
 const ui=readFileSync(new URL('../src/components/access/ExperimentInvitationsClient.tsx',import.meta.url),'utf8');assert(ui.includes('<table'));assert(!ui.includes('<article'));assert(!ui.includes('Copiar e testar o convite'));assert(ui.includes('experiment-pill-success'));assert(ui.includes('Confirmar cancelamento'));
 assert(!/<form(?![^>]*method="post")/.test(ui),'even before hydration no form can submit names or original tokens in a GET URL');assert(ui.includes('disabled={!ready || busy}'));
});
