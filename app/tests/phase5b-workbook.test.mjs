import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { STRUCTURE_CONTRACTS, inspectStructureWorkbook } from '../src/lib/structure-workbook.mjs';
import { structureFingerprint } from '../src/lib/structure-fingerprint.mjs';
import { inspectXlsxEnvelope } from '../src/lib/xlsx-envelope.mjs';

function workbook(contract, mutate = () => {}) {
  const book = XLSX.utils.book_new();
  for (const [name, headers] of Object.entries(STRUCTURE_CONTRACTS[contract])) XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,headers.map(h => h.startsWith('CODIGO')?'001':'F5B São José — 漢字')]),name);
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Instruções']]),'INSTRUCOES');
  mutate(book);
  return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true});
}
for (const contract of Object.keys(STRUCTURE_CONTRACTS)) {
  const name = Object.keys(STRUCTURE_CONTRACTS[contract])[0];
  test(`${contract}: bounded workbook, Unicode and textual zeros`,()=>assert.ok(inspectStructureWorkbook(workbook(contract),contract).rows));
  test(`${contract}: headers may reorder`,()=>{
    const bytes=workbook(contract,b=>{const s=b.Sheets[name],a=s.A1;s.A1=s.B1;s.B1=a;const v=s.A2;s.A2=s.B2;s.B2=v;});
    assert.ok(inspectStructureWorkbook(bytes,contract).rows);
  });
  for (const [kind,mutate,match] of [
    ['numeric code',b=>b.Sheets[name].A2={t:'n',v:1},/Texto/],
    ['formula cached',b=>b.Sheets[name].B2={t:'s',v:'cached',f:'"cached"'},/B2.*fórmula/],
    ['missing',b=>{delete b.Sheets[name];b.SheetNames=b.SheetNames.filter(n=>n!==name)},/ausente/],
    ['extra',b=>{const s=b.Sheets[name];s.Z1={t:'s',v:'UNKNOWN'};s['!ref']='A1:Z2'},/extra/],
    ['duplicate',b=>b.Sheets[name].B1={...b.Sheets[name].A1},/duplicada|ausente/],
    ['wrong sheet',b=>{b.Sheets.ERRADA=b.Sheets[name];delete b.Sheets[name];b.SheetNames=b.SheetNames.map(n=>n===name?'ERRADA':n)},/inesperada/],
  ]) test(`${contract}: rejects ${kind}`,()=>assert.throws(()=>inspectStructureWorkbook(workbook(contract,mutate),contract),match));
}
test('I1 keeps its two-sheet limit; I6 accepts four plus instructions',()=>{
  const bytes=workbook('PRODUCT');assert.throws(()=>inspectXlsxEnvelope(bytes),/LANCAMENTOS/);assert.ok(inspectStructureWorkbook(bytes,'PRODUCT'));
});
test('combined row limit, not just per sheet',()=>{
  const bytes=workbook('MANAGEMENT',b=>{for(const n of ['AREAS_NEGOCIO','CENTROS_CUSTO']) b.Sheets[n]=XLSX.utils.aoa_to_sheet([STRUCTURE_CONTRACTS.MANAGEMENT[n],...Array.from({length:5001},(_,i)=>STRUCTURE_CONTRACTS.MANAGEMENT[n].map(()=>String(i)))]);});
  assert.throws(()=>inspectStructureWorkbook(bytes,'MANAGEMENT'),/10.000 registros/);
});
test('multiset fingerprint: row order ignored, identical rows retained, contract isolated',()=>{
  const a={codigo:'',nome:'F5B',linha:2},b={codigo:'',nome:'Other',linha:3};
  const fp=rows=>structureFingerprint('REGISTRATION',{clientes:rows,fornecedores:[],errors:[]});
  assert.equal(fp([a,b]),fp([{...b,linha:8},{...a,linha:4}]));assert.notEqual(fp([a]),fp([a,a]));
  assert.notEqual(structureFingerprint('PEOPLE',{rows:[a]}),structureFingerprint('MANAGEMENT',{rows:[a]}));
});
test('portfolio fingerprint follows @row edges through reordered/resaved hierarchy',()=>{
  const p={grupos:[{linha:2,codigo:'',nome:'G'},{linha:3,codigo:'',nome:'H'}],tipos:[{linha:2,grupo:'@2',codigo:'',nome:'T'}],linhas:[{linha:2,grupo:'@2',codigoTipo:'@2',codigo:'',nome:'L'}],itens:[{linha:2,codigo:'',grupo:'@2',codigoTipo:'@2',codigoLinha:'@2',nome:'I'}],errors:[]};
  const q=structuredClone(p);q.grupos.reverse();q.grupos[0].linha=2;q.grupos[1].linha=3;
  for(const k of ['tipos','linhas','itens'])q[k][0].grupo='@3';
  assert.equal(structureFingerprint('PRODUCT',p),structureFingerprint('PRODUCT',q));
  q.itens.push({...q.itens[0],linha:9});assert.notEqual(structureFingerprint('PRODUCT',p),structureFingerprint('PRODUCT',q));
});
