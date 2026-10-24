import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {createOfficialWorkbook,parseOfficialWorkbook} from '../src/lib/lancamento-official-import.ts';
import {inspectXlsxEnvelope} from '../src/lib/xlsx-envelope.mjs';
const LIMIT=10*1024*1024;
function crc(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function entries(bytes){const b=Buffer.from(bytes),end=b.length-22,n=b.readUInt16LE(end+10);let p=b.readUInt32LE(end+16);const out=[];for(let i=0;i<n;i++){const nl=b.readUInt16LE(p+28),cl=b.readUInt32LE(p+20),o=b.readUInt32LE(p+42),method=b.readUInt16LE(p+10),start=o+30+b.readUInt16LE(o+26)+b.readUInt16LE(o+28);const packed=b.subarray(start,start+cl);out.push([b.toString('utf8',p+46,p+46+nl),method===8?inflateRawSync(packed):packed]);p+=46+nl+b.readUInt16LE(p+30)+b.readUInt16LE(p+32);}return out;}
function zip(items,compress=true){const local=[],central=[];let offset=0;for(const [name,body] of items){const n=Buffer.from(name),b=Buffer.from(body),data=compress?deflateRawSync(b):b,l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(compress?8:0,8);l.writeUInt32LE(crc(b),14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);l.copy(c,6,4,26);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(l,n,data);central.push(c,n);offset+=l.length+n.length+data.length;}const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(items.length,8);end.writeUInt16LE(items.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,cd,end]);}
const original=()=>entries(createOfficialWorkbook([]));
test('valid exact 10 MiB accepted, byte over rejected before XLSX parsing',()=>{
  const parts=original();parts.push(['padding.bin',Buffer.alloc(0)]);const base=zip(parts,false);parts.at(-1)[1]=Buffer.alloc(LIMIT-base.length);const exact=zip(parts,false);
  assert.equal(exact.length,LIMIT);assert.equal(parseOfficialWorkbook(exact).length,0);
  assert.throws(()=>parseOfficialWorkbook(Buffer.concat([exact,Buffer.from([0])])),{status:413});
});
test('sparse dimensions and alternate XML attribute quotes bounded before SheetJS',()=>{
  for(const ref of ['A1:XFD1048576','a1:xfd1048576']){const parts=original().map(([n,b])=>[n,n==='xl/worksheets/sheet2.xml'?b.toString().replace(/<dimension[^>]*\/>/,`<dimension ref = '${ref}'/>`):b]);assert.throws(()=>parseOfficialWorkbook(zip(parts)),/10.000|colunas/);}
});
test('actual expanded size, entry count, XML entities and encrypted archives rejected',()=>{
  const oversized=original();oversized.push(['padding.bin',Buffer.alloc(65*1024*1024)]);assert.throws(()=>inspectXlsxEnvelope(zip(oversized)),/limites/);
  const many=original();for(let i=0;i<513;i++)many.push(['p'+i,Buffer.alloc(0)]);assert.throws(()=>inspectXlsxEnvelope(zip(many)),/limites/);
  const entity=original().map(([n,b])=>[n,n==='xl/workbook.xml'?'<!DOCTYPE x [<!ENTITY y "z">]>'+b:b]);assert.throws(()=>inspectXlsxEnvelope(zip(entity)),/limites/);
  const encrypted=zip(original()),end=encrypted.length-22,central=encrypted.readUInt32LE(end+16);encrypted.writeUInt16LE(1,central+8);assert.throws(()=>inspectXlsxEnvelope(encrypted),/limites/);
});
