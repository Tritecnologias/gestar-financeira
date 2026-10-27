import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLES } from '../src/lib/backup/catalog.mjs';
import { VERSION, MAX_BYTES, canonical, digest, seal, validate, parse } from '../src/lib/backup/format.mjs';
const fixture = () => seal({ format: VERSION, tenant: { id: 'a' }, sections: Object.fromEntries(TABLES.map(t => [t, { rows: [], count: 0, checksum: digest([]) }])), files: [], migrations: [], references: {}, historicalReferences: {} });
test('deterministic object canonicalization preserves array order and duplicates', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  assert.notEqual(digest([1,1]), digest([1])); assert.notEqual(digest([1,2]), digest([2,1]));
  assert.equal(canonical({ nested: [null,'ação',true] }), '{"nested":[null,"ação",true]}');
});
test('complete empty tenant valid, cross-tenant rejected', () => {
  const b = fixture(); assert.equal(validate(b, 'a'), b);
  assert.throws(() => validate(b,'b'), { code: 'TENANT' });
});
test('corruption and incompatible version rejected before writes', () => {
  const b = fixture(); b.tenant.id = 'b'; assert.throws(() => validate(b,'b'), { code:'CHECKSUM' });
  assert.throws(() => validate(seal({ ...fixture(), format:'future' }), 'a'), { code:'VERSION' });
});
test('unknown section and path traversal fail closed', () => {
  const { checksum, ...b } = fixture(); b.sections.auth_identities = { rows:[], count:0, checksum:digest([]) };
  assert.throws(() => validate(seal(b),'a'), { code:'SECTIONS' });
  const { checksum: c, ...other } = fixture(); other.files=[{key:'../../secret.pdf',sha256:'a'.repeat(64),size:100}];
  assert.throws(() => validate(seal(other),'a'), { code:'FILE_REFERENCE' });
});
test('bounded JSON parser', () => {
  assert.throws(() => parse(Buffer.alloc(MAX_BYTES+1),'a'), { code:'SIZE' });
  assert.throws(() => parse(Buffer.from('{'),'a'), { code:'JSON' });
  assert.equal(parse(Buffer.from(JSON.stringify(fixture())),'a').tenant.id,'a');
});
