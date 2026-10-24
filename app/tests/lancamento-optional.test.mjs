import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeLancamento, hasMeaningfulBusinessValue } from '../src/lib/lancamento-input.mjs';
import { recordCells, planOfficialImport, canonicalCells, OFFICIAL_HEADERS, parseOfficialWorkbook } from '../src/lib/lancamento-official-import.ts';
import { fingerprintRows } from '../src/lib/import-fingerprint.mjs';
import * as XLSX from 'xlsx';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) specifier = new URL('../src/' + specifier.slice(2), import.meta.url).href;
  if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('file:'))) {
    const url = new URL(specifier, context.parentURL);
    if (!/\.[a-z]+$/.test(url.pathname) && existsSync(fileURLToPath(url) + '.ts')) specifier = url.href + '.ts';
  }
  return next(specifier, context);
} });
const { prepareLancamento, validateLancamentoLinks } = await import('../src/lib/lancamento-validation.ts');
const { toLancamentoDTO } = await import('../src/lib/lancamento.ts');
const { calcularFluxoCaixa } = await import('../src/lib/cash-flow.ts');

function db(current = []) {
  const result = { lancamento: { findMany: async () => current, findFirst: async () => null } };
  for (const model of ['categoria','planoContas','cliente','fornecedor','centroCusto','statusManualTipo']) {
    result[model] = { findMany: async () => [], findFirst: async ({where}) => where.tenantId === 'lab' && (where.codigo === '01' || where.id === 'supplier') ? { id: 'supplier', codigo: '01', nome: 'Fixture' } : null };
  }
  return result;
}
test('A–G: partial creations; absent fields stay NULL, automatic status does not supply business input', async () => {
  for (const input of [{descricao:'Só texto'}, {valorPrevisto:0}, {valorPrevisto:150}, {dataLanc:'2026-10-24'},
    {fornecedorId:'supplier'}, {centroCusto:'01'}, {banco:'LOCAL',valor:0}, {anotacao:'Nota'}, {tipo:'ENTRADA'}]) {
    const result = await prepareLancamento(db(), 'lab', input);
    assert.equal(result.status,'realizado'); assert.equal(result.cont,'1');
    assert.equal(result.tipo,input.tipo ?? null);
    assert.equal(result.valor,input.valor === 0 ? '0.00' : null);
    assert.equal(result.dataLanc?.toISOString().slice(0,10) ?? null,input.dataLanc ?? null);
    assert(hasMeaningfulBusinessValue(result));
  }
});
test('H–K: empty rejected, NULL differs from zero; negatives and invalid references rejected', async () => {
  for (const input of [{},{status:'realizado'},{descricao:' ',valor:'',tipo:''},{seq:5,tenantId:'lab'}]) await assert.rejects(prepareLancamento(db(),'lab',input),/ao menos um campo/);
  for (const input of [{valor:-1},{valorPrevisto:-1},{tipo:'outro'},{status:null},{status:''},{fornecedorId:'foreign'},{centroCusto:'foreign'}]) await assert.rejects(prepareLancamento(db(),'lab',input));
  assert.equal(normalizeLancamento({valor:''}).valor,null);
  assert.equal(normalizeLancamento({valor:0}).valor,'0.00');
  assert.deepEqual(normalizeLancamento({anotacao:'x'}),{anotacao:'x'});
});
test('L–O: merged edits, last-field guard, automatic metadata and bulk clears', async () => {
  const existing={descricao:'Texto',valor:'0.00',status:'realizado',cont:'1',dre:'LEGADO'};
  assert.equal((await prepareLancamento(db(),'lab',{descricao:''},existing)).descricao,null);
  assert.equal((await prepareLancamento(db(),'lab',{valor:''},existing)).valor,null);
  await assert.rejects(prepareLancamento(db(),'lab',{valor:null,descricao:null},existing),/precisa manter/);
  await assert.rejects(validateLancamentoLinks(db(),'lab',{banco:null},{banco:'Único',status:'realizado'}),/precisa manter/);
  assert.equal((await prepareLancamento(db(),'lab',{tipo:null},{...existing,tipo:'ENTRADA'})).tipo,null);
});
test('optional direction preserves tenant/account/category checks and does not invent direction', async () => {
  const store=db(); store.planoContas.findFirst=async ({where}) => where.id==='account' && where.tenantId==='lab'
    ? {id:'account',tipo:'RECEITA',categoria:{tenantId:'lab',codigo:'01',ativo:true}} : null;
  const out=await prepareLancamento(store,'lab',{contaId:'account'});
  assert.equal(out.tipo,null); assert.equal(out.categoria,'01');
  await assert.rejects(prepareLancamento(store,'lab',{contaId:'account',tipo:'SAIDA'}),/Receita/);
  await assert.rejects(prepareLancamento(store,'lab',{contaId:'foreign'}),/Conta N2/);
});
const cells = overrides => ({...Object.fromEntries(OFFICIAL_HEADERS.map(h=>[h,''])),...overrides});
test('P–S: partial XLSX, empty rows, legitimate duplicates and stable canonical identity', async () => {
  const rows=[cells({DESCRICAO:'Só texto'}),cells({VALOR_PREVISTO:'0'}),cells({VALOR_PREVISTO:'150'}),cells({DESCRICAO:'Só texto'})];
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([OFFICIAL_HEADERS,...rows.map(r=>OFFICIAL_HEADERS.map(h=>r[h])),OFFICIAL_HEADERS.map(()=> '')]),'LANCAMENTOS');
  const parsed=parseOfficialWorkbook(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
  assert.equal(parsed.length,4);
  const plan=await planOfficialImport(db(),'lab',parsed);assert.equal(plan.resumo.erros,0);assert.equal(plan.changes.length,4);
  assert.equal(plan.changes[0].data.valor,null);assert.equal(plan.changes[0].data.tipo,null);assert.equal(plan.changes[0].data.dataLanc,null);
  assert.equal(plan.changes[1].data.valorPrevisto,'0.00');assert.equal(plan.changes[1].data.descricao,null);
  const fingerprint = rows => fingerprintRows(rows.map(r=>OFFICIAL_HEADERS.map(h=>canonicalCells(r).cells[h])));
  assert.equal(fingerprint(rows),fingerprint([...rows].reverse()));assert.notEqual(fingerprint(rows),fingerprint(rows.slice(0,3)));
  assert.equal((await planOfficialImport(db(),'lab',[{linha:2,cells:cells({STATUS:'realizado'})}])).resumo.erros,1);
});
test('partial round-trip unchanged; clearing last imported field rejected without erasing legacy DRE', async () => {
  const row={id:'11111111-1111-4111-8111-111111111111',tenantId:'lab',revisao:0n,descricao:'Texto',tipo:null,valor:null,dataLanc:null,status:'realizado',dre:'LEGADO'};
  const exported=recordCells(row),store=db([row]);
  assert.equal((await planOfficialImport(store,'lab',[{linha:2,cells:exported}])).rows[0].acao,'INALTERADO');
  assert.equal((await planOfficialImport(store,'lab',[{linha:2,cells:{...exported,DESCRICAO:''}}])).rows[0].acao,'ERRO');
});
test('DTO preserves NULL/zero and existing financial engine handles partial records without inventing cash', () => {
  const row={id:'partial',tenantId:'lab',revisao:0n,seq:1,descricao:null,tipo:null,valor:null,valorPrevisto:0,dataLanc:null,status:'realizado'};
  const dto=toLancamentoDTO(row);assert.equal(dto.valor,null);assert.equal(dto.valorPrevisto,0);assert.equal(dto.dataLanc,null);assert.equal(dto.tipo,null);assert.equal(dto.descricao,null);
  const result=calcularFluxoCaixa([row],{tenantId:'lab',inicio:'2026-10-01',fim:'2026-10-31',dataReferencia:'2026-10-24'});
  assert(!JSON.stringify(result).includes('NaN'));assert.equal(dto.statusAuto,'INCONSISTENTE');
});
