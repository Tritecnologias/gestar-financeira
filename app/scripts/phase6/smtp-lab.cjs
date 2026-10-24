// Isolated laboratory sink: TLS + AUTH, synthetic domains only, no relay/logging.
const tls=require('tls'),http=require('http'),fs=require('fs'),assert=require('assert');
assert.equal(process.env.PHASE6_LAB,'1');assert.ok(process.env.CAPTURE_PASSWORD);
const inbox=new Map();let failing=false;
tls.createServer({key:fs.readFileSync('/tls/key.pem'),cert:fs.readFileSync('/tls/cert.pem'),minVersion:'TLSv1.2'},s=>{
 let buffer='',data=null,to='',authed=false;const send=x=>s.write(x+'\r\n');send('220 10s-phase6-smtp ESMTP laboratory');
 s.on('error',()=>{});s.setTimeout(30000,()=>s.destroy());
 s.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>1000000){s.destroy();return}let index;
  while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
   if(data!==null){if(line==='.') {inbox.set(to,data.join('\r\n'));data=null;send('250 accepted synthetic message')}else data.push(line.replace(/^\.\./,'.'));continue;}
   if(/^EHLO|^HELO/.test(line)){send('250-10s-phase6-smtp');send('250 AUTH PLAIN');}
   else if(line.startsWith('AUTH PLAIN ')){const parts=Buffer.from(line.slice(11),'base64').toString().split('\0');authed=parts[1]==='fixture'&&parts[2]===process.env.CAPTURE_PASSWORD;send(authed?'235 authenticated':'535 denied');}
   else if(line.startsWith('MAIL FROM:'))send(!authed?'530 authentication required':failing?'451 synthetic delivery failure':'250 sender accepted');
   else if(line.startsWith('RCPT TO:')){to=line.match(/<([^>]+)>/)?.[1]?.toLowerCase()||'';send(authed&&to.endsWith('@example.invalid')?'250 recipient accepted':'550 laboratory recipient only');}
   else if(line==='DATA'){if(!authed||!to.endsWith('@example.invalid'))send('550 denied');else{data=[];send('354 end with dot')}}
   else if(line==='QUIT'){send('221 bye');s.end();}
   else if(line==='RSET'){data=null;to='';send('250 reset');}
   else send('250 ok');
  }
 });
}).listen(2465,'0.0.0.0');
http.createServer((req,res)=>{
 if(req.headers.authorization!=='Bearer '+process.env.CAPTURE_PASSWORD){res.writeHead(403);return res.end()}
 const u=new URL(req.url,'http://sink');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/failure'&&req.method==='POST'){failing=u.searchParams.get('on')==='1';return res.end('{}')}
 const email=u.searchParams.get('email')||'',message=inbox.get(email);inbox.delete(email);res.end(JSON.stringify({message:message||null}));
}).listen(8025,'0.0.0.0');
