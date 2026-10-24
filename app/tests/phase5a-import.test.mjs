import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseOfficialWorkbook, OFFICIAL_HEADERS, canonicalCells, createOfficialWorkbook } from '../src/lib/lancamento-official-import.ts';
import { fingerprintRows } from '../src/lib/import-fingerprint.mjs';
import { boundedImportForm, MAX_FILE_BYTES, MAX_BODY_BYTES } from '../src/lib/official-import-policy.mjs';
import { readImportResponse } from '../src/lib/import-http.mjs';

const data = { DATA_LANCAMENTO:'2026-10-24', DESCRICAO:'Teste Unicode ação 😀', DIRECAO:'ENTRADA', STATUS:'previsto', VALOR_PREVISTO:'1', VALOR_REALIZADO:'0' };
function book(rows=[data],headers=OFFICIAL_HEADERS) {
  const b=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(h=>r[h]??''))]),'LANCAMENTOS');return b;
}
const bytes=b=>new Uint8Array(XLSX.write(b,{type:'array',bookType:'xlsx',compression:true}));
const cell=(b,h,r=1)=>b.Sheets.LANCAMENTOS[XLSX.utils.encode_cell({c:OFFICIAL_HEADERS.indexOf(h),r})];
const hash=b=>fingerprintRows(parseOfficialWorkbook(bytes(b)).map(r=>{const c=canonicalCells(r.cells);assert.equal(c.errors.length,0);return OFFICIAL_HEADERS.map(h=>c.cells[h])}));

test('XLSX envelope rejects non-XLSX, malformed ZIP, extra sheets and dimensions before matrix allocation',()=>{
  for(const input of [new Uint8Array(),new TextEncoder().encode('a,b\n1,2'),new Uint8Array([0x50,0x4b,3,4])])assert.throws(()=>parseOfficialWorkbook(input));
  assert.throws(()=>parseOfficialWorkbook(new Uint8Array(XLSX.write(book(),{type:'array',bookType:'biff8'}))));
  const b=book();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['x']]),'OUTRA');assert.throws(()=>parseOfficialWorkbook(bytes(b)),/Abas/);
  const sparse=book();sparse.Sheets.LANCAMENTOS['!ref']='A1:BM2';assert.throws(()=>parseOfficialWorkbook(bytes(sparse)),/limites|colunas/);
});
test('10,000 accepted; 10,001 rejected; empty base has no data',()=>{
  assert.equal(parseOfficialWorkbook(bytes(book(Array.from({length:10000},()=>data)))).length,10000);
  assert.throws(()=>parseOfficialWorkbook(bytes(book(Array.from({length:10001},()=>data)))),/10.000/);
  assert.equal(parseOfficialWorkbook(new Uint8Array(createOfficialWorkbook([]))).length,0);
});
test('header set rejects extra, missing and duplicated; physical order irrelevant',()=>{
  for(const h of [[...OFFICIAL_HEADERS,'EXTRA'],OFFICIAL_HEADERS.slice(1),[OFFICIAL_HEADERS[1],...OFFICIAL_HEADERS.slice(1)]])assert.throws(()=>parseOfficialWorkbook(bytes(book([data],h))),/Cabeçalhos/);
  assert.equal(hash(book()),hash(book([data],[...OFFICIAL_HEADERS].reverse())));
});
test('data formulas are forbidden even with cached value; informative formulas allowed',()=>{
  const b=book();cell(b,'VALOR_PREVISTO').f='1+1';assert.throws(()=>parseOfficialWorkbook(bytes(b)),/fórmulas/);
  const info=book();XLSX.utils.book_append_sheet(info,XLSX.utils.aoa_to_sheet([[{f:'1+1',v:2,t:'n'}]]),'INSTRUCOES');assert.equal(parseOfficialWorkbook(bytes(info)).length,1);
});
test('1900/1904 metadata, dates and invalid serial/day',()=>{
  const a=book([{...data,DATA_LANCAMENTO:46319}]); // Excel date below compared against SSF rather than guessed constant
  const b=book([{...data,DATA_LANCAMENTO:46319-1462}]);b.Workbook={WBProps:{date1904:true}};
  assert.equal(hash(a),hash(b));
  for(const date of [60,1.5])assert.throws(()=>parseOfficialWorkbook(bytes(book([{...data,DATA_LANCAMENTO:date}]))),/data/);
  for(const date of ['31/02/2026','2026-02-29'])assert.ok(canonicalCells(parseOfficialWorkbook(bytes(book([{...data,DATA_LANCAMENTO:date}])))[0].cells).errors.length);
  assert.equal(hash(book([{...data,DATA_LANCAMENTO:'24/10/2026'}])),hash(book()));
});
test('codes require text; never invent lost zeros; financial currency format is numeric',()=>{
  for(const code of [1,true])assert.throws(()=>parseOfficialWorkbook(bytes(book([{...data,CATEGORIA_N1:code}]))),/texto/);
  assert.equal(parseOfficialWorkbook(bytes(book([{...data,CATEGORIA_N1:'01'}])))[0].cells.CATEGORIA_N1,'01');
  for(const v of [0,1,'1,23','1.234,56','1234.56'])assert.equal(canonicalCells(parseOfficialWorkbook(bytes(book([{...data,VALOR_PREVISTO:v}])))[0].cells).errors.length,0);
  for(const v of ['R$ 1.234,56','NaN','12x',-1])assert.ok(canonicalCells(parseOfficialWorkbook(bytes(book([{...data,VALOR_PREVISTO:v}])))[0].cells).errors.length);
  const b=book([{...data,VALOR_PREVISTO:1234.56}]);cell(b,'VALOR_PREVISTO').z='R$ #,##0.00';assert.equal(canonicalCells(parseOfficialWorkbook(bytes(b))[0].cells).cells.VALOR_PREVISTO,'1234.56');
});
test('fingerprint survives reorder/save/format and retains identical-row multiplicity and versions',()=>{
  const a={...data,DESCRICAO:'A'},b={...data,DESCRICAO:'B'};
  assert.equal(hash(book([a,b,a])),hash(book([a,a,b],[...OFFICIAL_HEADERS].reverse())));
  assert.notEqual(hash(book([a,a,b])),hash(book([a,b])));
  assert.notEqual(hash(book([a])),hash(book([{...a,REGISTRO_VERSAO:'v1:1'}])));
  assert.equal(hash(book([{...a,VALOR_PREVISTO:'1,00'}])),hash(book([a])));
});
test('10 MiB file cap and request-body cap enforce real length, not just header',async()=>{
  assert.throws(()=>parseOfficialWorkbook(new Uint8Array(MAX_FILE_BYTES+1)),{status:413});
  await assert.rejects(boundedImportForm(new Request('http://test',{method:'POST',headers:{'content-length':String(MAX_BODY_BYTES+1),'content-type':'multipart/form-data; boundary=x'},body:'x'})),{status:413});
  const req=new Request('http://test',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:new Uint8Array(MAX_BODY_BYTES+1)});
  await assert.rejects(boundedImportForm(req),{status:413});
  for(const size of [MAX_FILE_BYTES,MAX_FILE_BYTES+1]){const f=new FormData();f.set('file',new File([new Uint8Array(size)],'x.xlsx'));const parsed=await boundedImportForm(new Request('http://test',{method:'POST',body:f}));assert.equal(parsed.get('file').size,size)}
});
test('HTTP proxy HTML/empty and server error never leak raw content or assume rollback',async()=>{
  for(const status of [400,401,403,404,409,413,422,500,504]) {
    await assert.rejects(readImportResponse(new Response('<html>SQL secret /private/path</html>',{status}),true),e=>!e.message.includes('secret')&&!e.message.includes('SQL')&&(status<500||e.uncertain));
  }
  await assert.rejects(readImportResponse(new Response('',{status:200}),true),e=>e.uncertain);
  assert.equal((await readImportResponse(Response.json({protocol:'10s-import-v1',state:'PROCESSING'},{status:202}),true)).state,'PROCESSING');
});
