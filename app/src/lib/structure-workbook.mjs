import * as XLSX from 'xlsx';
import { inspectXlsxEnvelope } from './xlsx-envelope.mjs';
import { importError } from './official-import-policy.mjs';

const registration = ['CODIGO','TIPO_PESSOA','NOME','NOME_FANTASIA','DOCUMENTO','EMAIL','TELEFONE','ENDERECO','CODIGO_CATEGORIA','CODIGO_CONTA'];
export const STRUCTURE_CONTRACTS = {
  FINANCIAL: { CATEGORIAS_N1: ['CODIGO_CATEGORIA','DESCRICAO_CATEGORIA'], CONTAS_N2: ['CODIGO_CONTA','DESCRICAO_CONTA','CODIGO_CATEGORIA','TIPO_CONTA'] },
  MANAGEMENT: { AREAS_NEGOCIO: ['CODIGO_AREA','DESCRICAO_AREA'], CENTROS_CUSTO: ['CODIGO_CC','DESCRICAO_CC','CODIGO_AREA'] },
  PEOPLE: { PESSOAS: ['CODIGO_PESSOA','NOME','CARGO','CODIGO_CC','EMAIL','TELEFONE'] },
  REGISTRATION: { CLIENTES: registration, FORNECEDORES: registration },
  PRODUCT: {
    GRUPOS: ['CODIGO_GRUPO','NOME_GRUPO'], TIPOS: ['CODIGO_GRUPO','CODIGO_TIPO','NOME_TIPO'],
    LINHAS: ['CODIGO_GRUPO','CODIGO_TIPO','CODIGO_LINHA','NOME_LINHA'],
    ITENS: ['CODIGO_ITEM','NOME','CODIGO_GRUPO','CODIGO_TIPO','CODIGO_LINHA','DESCRICAO','UNIDADE','OBSERVACOES'],
  },
};

/** Server-only preflight shared by I2–I6, before domain parsing or database work. */
export function inspectStructureWorkbook(bytes, contract) {
  const spec = STRUCTURE_CONTRACTS[contract];
  if (!spec) throw new Error('UNKNOWN_IMPORT_CONTRACT');
  inspectXlsxEnvelope(bytes, { maxSheets: Object.keys(spec).length + 1 });
  let book;
  try { book = XLSX.read(bytes, { type: 'array', cellFormula: true, cellText: true }); }
  catch { throw importError('Não foi possível ler o arquivo XLSX.'); }
  for (const name of book.SheetNames) if (!(name in spec) && name !== 'INSTRUCOES') throw importError(`Aba inesperada: ${name}. Use o modelo deste cadastro.`);
  let rows = 0, cells = 0;
  for (const [name, expected] of Object.entries(spec)) {
    const sheet = book.Sheets[name];
    if (!sheet) throw importError(`Aba ${name} ausente.`);
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    if (range.s.r !== 0 || range.s.c !== 0) throw importError(`${name}: os cabeçalhos devem começar em A1.`);
    const header = Array.from({ length: range.e.c + 1 }, (_, c) => String(sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? '').trim().toUpperCase());
    for (const field of expected) {
      const count = header.filter(h => h === field).length;
      if (count !== 1) throw importError(`${name}, ${field}: coluna ${count ? 'duplicada' : 'ausente'}.`);
    }
    for (const field of header) if (field && !expected.includes(field)) throw importError(`${name}: coluna extra ${field} não permitida.`);
    const populated = new Set();
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!')) continue;
      if (++cells > 250000) throw importError('Arquivo excede 250.000 células nas abas de dados.', 413, 'SIZE');
      const { r, c } = XLSX.utils.decode_cell(address), field = header[c];
      if (cell.f || cell.F) throw importError(`${name}, ${address}, ${field || 'coluna sem cabeçalho'}: fórmula não permitida; informe um valor direto.`);
      if (!r || cell.v === undefined || String(cell.v).trim() === '') continue;
      if (!field) throw importError(`${name}, ${address}: dado em coluna sem cabeçalho.`);
      populated.add(r);
      if (field.startsWith('CODIGO') && cell.t !== 's') throw importError(`${name}, ${address}, ${field}: código deve ser Texto; confira os zeros à esquerda.`);
      if (cell.t === 'e') throw importError(`${name}, ${address}, ${field}: célula contém erro do Excel.`);
    }
    rows += populated.size;
  }
  if (rows > 10000) throw importError('Arquivo excede 10.000 registros no conjunto das abas.', 413, 'SIZE');
  return { rows, cells };
}
