import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = row => Object.fromEntries(Object.keys(row).sort().filter(k => !['linha','acao','detalhes','avisos','sugestoes'].includes(k)).map(k => [k, row[k]]));

/** Multisets retain identical legitimate rows. Portfolio @row references become graph edges. */
export function structureFingerprint(contract, parsed) {
  let canonical;
  if (contract !== 'PRODUCT') {
    canonical = Object.keys(parsed).filter(k => k !== 'errors').sort().map(k => [k, parsed[k].map(r => JSON.stringify(clean(r))).sort()]);
  } else {
    const roots = [], groups = new Map(), types = new Map(), lines = new Map();
    const node = (kind, row, parent) => {
      const data = clean(row); delete data.grupo; delete data.codigoTipo; delete data.codigoLinha;
      const n = { kind, data, children: [] }; (parent ? parent.children : roots).push(n); return n;
    };
    const group = ref => { if (!groups.has(ref)) groups.set(ref, node('group-reference', { codigo: ref })); return groups.get(ref); };
    for (const row of parsed.grupos) groups.set(row.codigo || `@${row.linha}`, node('group', row));
    const key = (...values) => JSON.stringify(values);
    const type = (g, ref) => { const k = key(g, ref); if (!types.has(k)) types.set(k, node('type-reference', { codigo: ref }, group(g))); return types.get(k); };
    for (const row of parsed.tipos) types.set(key(row.grupo, row.codigo || `@${row.linha}`), node('type', row, group(row.grupo)));
    const line = (g, t, ref) => { const k = key(g,t,ref); if (!lines.has(k)) lines.set(k, node('line-reference', { codigo: ref }, type(g,t))); return lines.get(k); };
    for (const row of parsed.linhas) lines.set(key(row.grupo,row.codigoTipo,row.codigo || `@${row.linha}`), node('line', row, type(row.grupo,row.codigoTipo)));
    for (const row of parsed.itens) node('item', row, row.codigoLinha ? line(row.grupo,row.codigoTipo,row.codigoLinha) : type(row.grupo,row.codigoTipo));
    const serialize = n => JSON.stringify([n.kind,n.data,n.children.map(serialize).sort()]);
    canonical = roots.map(serialize).sort();
  }
  return digest(['STRUCTURE_' + contract, 1, canonical]);
}
