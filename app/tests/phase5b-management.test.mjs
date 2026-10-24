import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManagementWorkbook } from '../src/lib/management-import.ts';

const input = name => ({ areas: [], centros: [{ linha: 2, codigo: '001', descricao: name, codigoArea: 'A' }], errors: [] });
function scopedDb(departments) {
  return {
    areaNegocio: { findMany: async () => [{ id: 'area', codigo: 'A', nome: 'Área', ativo: true }] },
    centroCusto: { findMany: async () => [{ id: 'cc', codigo: '001', nome: 'Centro', areaId: 'area', ativo: true }] },
    pessoa: { findMany: async args => {
      assert.equal(args.where.ativo, undefined, 'inactive people must also protect their legacy link');
      assert.deepEqual(args.select, { departamento: true });
      return departments.map(departamento => ({ departamento }));
    } },
  };
}
test('linked CC rename is rejected with row/field; legacy whitespace follows export matching', async () => {
  const result = await validateManagementWorkbook(input('Renamed'), scopedDb([' Centro ']));
  assert.equal(result.centros[0].acao, 'erro');
  assert.equal(result.errors[0].campo, 'DESCRICAO_CC');
  assert.equal(result.errors[0].linha, 2);
  assert.match(result.errors[0].motivo, /usado por Pessoas/);
});
test('unlinked CC may be renamed; unrelated department does not block', async () => {
  const result = await validateManagementWorkbook(input('Renamed'), scopedDb(['Other']));
  assert.deepEqual(result.errors, []);
  assert.equal(result.centros[0].acao, 'atualizar');
});
test('unchanged CC remains importable without scanning people', async () => {
  const db = scopedDb(['Centro']);
  db.pessoa.findMany = async () => { throw Error('unexpected scan'); };
  assert.deepEqual((await validateManagementWorkbook(input('Centro'), db)).errors, []);
});
test('confirmation revalidation detects a person linked after preview', async () => {
  const departments = [], db = scopedDb(departments);
  assert.equal((await validateManagementWorkbook(input('Renamed'), db)).errors.length, 0);
  departments.push('Centro');
  assert.equal((await validateManagementWorkbook(input('Renamed'), db)).errors.length, 1);
});
