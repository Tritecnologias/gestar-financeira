import http from 'node:http';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
export async function startJourneyBridge(worker){
  if(!/^dez-a24-http-[a-f0-9]{8}$/.test(worker))throw Error('A24_WORKER_REQUIRED');
  const child=spawn('docker',['exec','-i','-w','/work',worker,'node','tests/admission-browser-relay.cjs'],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const pending=new Map();let next=0;
  readline.createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line),entry=pending.get(m.id);if(!entry)return;clearTimeout(entry.timer);pending.delete(m.id);entry.response.writeHead(m.status,m.headers);entry.response.end(Buffer.from(m.body,'base64'));});
  const server=http.createServer((request,response)=>{const chunks=[];let size=0;request.on('data',b=>{size+=b.length;if(size>10*1024*1024)request.destroy();else chunks.push(b)});request.on('end',()=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);response.writeHead(504);response.end()},60000);pending.set(id,{response,timer});child.stdin.write(JSON.stringify({id,path:request.url,method:request.method,headers:request.headers,body:Buffer.concat(chunks).toString('base64')})+'\n');});});
  child.stdin.on('error',()=>{});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3020,'127.0.0.1',resolve)});
  return ()=>{server.closeAllConnections();server.close();for(const e of pending.values())clearTimeout(e.timer);child.stdin.end();child.kill();};
}
export async function testJourney(app,worker,out){
  const module=process.env.PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,[join(app,'tests/admission-journey.browser.cjs'),worker,out,module],{windowsHide:true,stdio:['ignore','pipe','pipe']});const chunks=[];c.stdout.on('data',b=>chunks.push(b));c.stderr.on('data',b=>chunks.push(b));c.on('error',reject);c.on('close',code=>{writeFileSync(join(out,'browser.log'),Buffer.concat(chunks));resolve(code)});});
  if(code!==0)throw Error('JOURNEY_BROWSER_FAILED; inspect browser.log');
}
