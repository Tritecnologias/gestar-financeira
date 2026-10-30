import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {homologIdentity as enabled,environmentIconPaths as paths} from '../src/lib/environment-identity.ts';
const homo={APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',DATABASE_URL:'postgresql://runtime:dummy@0f5rvkjqjdt9fez1ajiascyk:5432/gestar_homolog_pg18'};
test('yellow requires exact trusted HOMOLOG origin/auth/database tuple',()=>{
 assert(enabled(homo));for(const changed of [{APP_PUBLIC_URL:'https://app.dezsolucoes.com.br'},{NEXTAUTH_URL:'https://app.dezsolucoes.com.br'},{DATABASE_URL:'postgresql://x:dummy@production/prod'},{DATABASE_URL:'postgresql://x:dummy@0f5rvkjqjdt9fez1ajiascyk/other'},{DATABASE_URL:'invalid'}])assert.equal(enabled({...homo,...changed}),false);assert.equal(enabled({}),false);
});
test('branch/client flags cannot enable yellow in PROD or any LOCAL profile',()=>{
 assert.equal(enabled({...homo,APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',NEXTAUTH_URL:'https://app.dezsolucoes.com.br',PLATFORM_BRAND_ENV:'HOMOLOG_PREVIEW',SOURCE_BRANCH:'homologacao'}),false);
 const local={APP_PUBLIC_URL:'http://localhost:3020',NEXTAUTH_URL:'http://localhost:3020',DATABASE_URL:'postgresql://x:dummy@127.0.0.1:55439/special_invite_lab'};
 assert.equal(enabled(local),false);assert.equal(enabled({...local,PLATFORM_BRAND_ENV:'HOMOLOG_PREVIEW'}),false);assert.equal(enabled({...local,PLATFORM_BRAND_ENV:'HOMOLOG_PREVIEW',DATABASE_URL:'postgresql://x:dummy@127.0.0.1:55432/gestar_vf_dev',APP_PUBLIC_URL:'http://localhost:3023',NEXTAUTH_URL:'http://localhost:3023'}),false);assert(paths(false).svg.includes('dez-green-navy-1'));assert(paths(true).ico.includes('homolog-yellow-1'));
});
test('yellow ICO preserves approved positions and alpha at 16/32/48 by color substitution only',()=>{
 const a=readFileSync('public/brand/dez-blue.ico'),b=readFileSync('public/brand/homolog-yellow.ico');assert.equal(b.readUInt16LE(4),3);
 for(const [i,size] of [16,32,48].entries()){
  const entry=6+i*16,oa=a.readUInt32LE(entry+12)+40,ob=b.readUInt32LE(entry+12)+40;assert.equal(b[entry],size);assert.equal(b[entry+1],size);
  let black=0,yellow=0;
  for(let n=0;n<size*size;n++){
   const aa=a[oa+n*4+3],ab=b[ob+n*4+3],r=a[oa+n*4+2],s=Math.max(0,Math.min(1,(r-20)/235));assert.equal(ab,aa);
   for(const [channel,base] of [[0,21],[1,204],[2,250]])assert(Math.abs(b[ob+n*4+channel]-base*(1-s))<=.51);
   if(ab>200&&b[ob+n*4+2]<20)black++;if(ab>200&&b[ob+n*4+2]>230&&b[ob+n*4+1]>180)yellow++;
  }
  assert(black>0&&yellow>0);for(const n of [0,size-1,size*(size-1),size*size-1])assert.equal(b[ob+n*4+3],0);
 }
});
test('yellow SVG embeds the exact derived 512 PNG and blue original artwork remains byte-identical',()=>{
 const svg=readFileSync('public/brand/homolog-yellow.svg','utf8'),bytes=Buffer.from(svg.match(/base64,([A-Za-z0-9+/=]+)/)[1],'base64');assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);assert.equal(bytes[25],6);assert(bytes.equals(readFileSync('public/brand/homolog-yellow-512.png')));
 const blue=Buffer.from(readFileSync('public/brand/dez-blue.svg','utf8').match(/base64,([A-Za-z0-9+/=]+)/)[1],'base64');assert.equal(createHash('sha256').update(blue).digest('hex'),'1bfe9ba743ef6143aa8515a2e7cc5effcc5dfda91466c45131c89dfe97898d27');
});
