// Disposable lab transport only; not shipped as an application endpoint.
const readline=require('node:readline');
if(process.env.DATABASE_URL!=='postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab')throw Error('LAB_ONLY');
readline.createInterface({input:process.stdin}).on('line',async line=>{
  const m=JSON.parse(line);try{
    if(!m.path.startsWith('/')||m.path.startsWith('//'))throw Error('path');
    const h=m.headers;for(const k of ['host','connection','content-length','transfer-encoding','accept-encoding'])delete h[k];
    const client=Number(h['x-a24-client']||128);delete h['x-a24-client'];
    h['x-10s-proxy-token']=process.env.TRUSTED_PROXY_TOKEN;h['x-real-ip']='198.19.24.'+(Number.isInteger(client)&&client>0&&client<255?client:128);
    const r=await fetch('http://127.0.0.1:3020'+m.path,{method:m.method,headers:h,redirect:'manual',...(m.body?{body:Buffer.from(m.body,'base64')}:{})});
    const headers=Object.fromEntries(r.headers);for(const k of ['content-encoding','content-length','transfer-encoding','set-cookie'])delete headers[k];headers['set-cookie']=r.headers.getSetCookie();
    process.stdout.write(JSON.stringify({id:m.id,status:r.status,headers,body:Buffer.from(await r.arrayBuffer()).toString('base64')})+'\n');
  }catch{process.stdout.write(JSON.stringify({id:m.id,status:502,headers:{},body:''})+'\n');}
});
