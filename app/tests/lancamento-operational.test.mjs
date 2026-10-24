import test from "node:test";
import assert from "node:assert/strict";
import { amountInput, dateInput, normalizeLancamento } from "../src/lib/lancamento-input.mjs";
import { parseVersion, versionToken, optimisticWhere } from "../src/lib/lancamento-version.mjs";
import { recordCells, planOfficialImport } from "../src/lib/lancamento-official-import.ts";

test("valores: zero, brasileiro e limite decimal; nunca parse parcial ou arredondamento silencioso", () => {
  for (const [input, expected] of [[0,"0.00"],["0,00","0.00"],["1.234,56","1234.56"],["9999999999999.99","9999999999999.99"]]) assert.equal(amountInput(input),expected);
  for (const value of [-1,"-0.01",NaN,Infinity,"12x","1,2,3","1.234","1e2",true,{},[],"10000000000000"]) assert.throws(()=>amountInput(value),{status:400});
  assert.equal(amountInput(""),null);
  assert.throws(()=>amountInput(null,"Valor",true),{status:400});
});
test("datas reais, dia civil e ausências; sem fallback para hoje", () => {
  assert.equal(dateInput("29/02/2024").toISOString(),"2024-02-29T12:00:00.000Z");
  for (const value of ["2026-02-29","31/04/2026","2026-13-01","2026-10-23resíduo","2026-10-23T01:00:00Z",123,{}]) assert.throws(()=>dateInput(value),{status:400});
  assert.equal(dateInput(""),null);assert.throws(()=>dateInput("","Data",true),{status:400});
});
test("contrato compartilhado: create, patch, leitura DRE/CONT e whitelist", () => {
  const base={dataLanc:"2026-10-23",descricao:" Fixture ",tipo:"ENTRADA",valor:0,valorPrevisto:0};
  const result=normalizeLancamento({...base,tenantId:"estrangeiro",revisao:9,seq:90},true);
  assert.equal(result.cont,"1");assert.equal(result.valorPrevisto,"0.00");assert.equal(result.descricao,"Fixture");
  assert.equal(result.tenantId,undefined);assert.equal(result.revisao,undefined);assert.equal(result.seq,undefined);
  for(const patch of [{dre:null},{cont:"1"},{tipo:"SAÍDA"},{status:"pago"},{descricao:" "},{valor:null}]) assert.throws(()=>normalizeLancamento(patch),{status:400});
  assert.deepEqual(normalizeLancamento({anotacao:"",valorPrevisto:""}),{anotacao:null,valorPrevisto:null});
});
test("token opaco com precisão integral; timestamps antigos falham de forma explícita", () => {
  const revision=BigInt("9007199254740993");assert.equal(parseVersion(versionToken(revision)),revision);
  assert.deepEqual(optimisticWhere("id","tenant", "v1:0"),{id:"id",tenantId:"tenant",revisao:0n});
  for(const value of [null,0,"v1:-1","v1:01","v1:9223372036854775808","2026-10-23T12:00:00.123456Z"]) assert.throws(()=>parseVersion(value),{status:409});
});
test("XLSX: versão independente dos microssegundos; DRE preservada, alteração proibida", async () => {
  const current={id:"11111111-1111-4111-8111-111111111111",tenantId:"a",revisao:2n,atualizadoEm:new Date("2026-10-23T12:00:00.123456Z"),dataLanc:new Date("2026-10-23"),descricao:"Fixture",tipo:"ENTRADA",status:"previsto",valor:"0",dre:"LEGADO"};
  const db={lancamento:{findMany:async()=>[current],findFirst:async()=>null}};
  for(const model of ["categoria","planoContas","cliente","fornecedor","statusManualTipo","centroCusto"])db[model]={findMany:async()=>[]};
  const cells=recordCells(current);assert.equal(cells.REGISTRO_VERSAO,"v1:2");
  assert.equal((await planOfficialImport(db,"a",[{linha:2,cells}])).rows[0].acao,"INALTERADO");
  const changed=await planOfficialImport(db,"a",[{linha:2,cells:{...cells,DESCRICAO:"Outra"}}]);
  assert.equal(changed.changes[0].data.dre,undefined);
  assert.equal((await planOfficialImport(db,"a",[{linha:2,cells:{...cells,DRE:""}}])).rows[0].acao,"ERRO");
  assert.equal((await planOfficialImport(db,"a",[{linha:2,cells:{...cells,REGISTRO_VERSAO:"v1:1"}}])).rows[0].acao,"CONFLITO");
});
