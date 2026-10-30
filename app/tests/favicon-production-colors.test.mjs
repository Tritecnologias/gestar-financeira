import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => readFileSync(`public/brand/${name}`);
const dataModule = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const identity = dataModule(stripTypeScriptTypes(readFileSync('src/lib/environment-identity.ts', 'utf8')));
const favicon = await import(dataModule(stripTypeScriptTypes(readFileSync('src/lib/environment-favicon.ts', 'utf8')).replace('"./environment-identity"', JSON.stringify(identity))));

test('production SVG contains the approved deterministic recoloring at original resolution', () => {
  const svg = read('dez-green-navy.svg').toString();
  const png = Buffer.from(svg.match(/base64,([A-Za-z0-9+/=]+)/)[1], 'base64');
  assert(svg.includes('viewBox="0 0 512 512"'));
  assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6);
  assert.equal(hash(png), 'a73d1dfa68224df8eae5dc242bc208259d2545bcbe82000e1638a5237ff3edd5');
});

test('ICO keeps all original frame coordinates and alpha, with green symbol and navy disc', () => {
  const original = read('dez-blue.ico'), actual = read('dez-green-navy.ico');
  assert.equal(actual.readUInt16LE(4), 3);
  assert.deepEqual(actual.subarray(0, 54), original.subarray(0, 54));
  for (const [i, size] of [16, 32, 48].entries()) {
    const offset = actual.readUInt32LE(6 + i * 16 + 12);
    assert.equal(actual.readUInt16LE(6 + i * 16 + 6), 32);
    assert.deepEqual(actual.subarray(offset, offset + 40), original.subarray(offset, offset + 40));
    let green = 0, navy = 0;
    for (let n = 0; n < size * size; n++) {
      const p = offset + 40 + n * 4;
      assert.equal(actual[p + 3], original[p + 3]);
      if (actual[p + 3] < 200) continue;
      if (original[p + 2] > 245) { assert(actual[p + 1] > 195 && actual[p + 2] < 55); green++; }
      if (original[p + 2] <= 20) { assert(actual[p] < 45 && actual[p + 1] < 25 && actual[p + 2] < 16); navy++; }
    }
    assert(green > 0 && navy > 0);
    const maskEnd = i === 2 ? actual.length : actual.readUInt32LE(6 + (i + 1) * 16 + 12);
    assert.deepEqual(actual.subarray(offset + 40 + size * size * 4, maskEnd), original.subarray(offset + 40 + size * size * 4, maskEnd));
  }
});

test('runtime route isolates favicon, existing body marks and HOMOLOG, including cache headers', async () => {
  const saved = { ...process.env };
  try {
    process.env.DEPLOYMENT_PROFILE = 'production';
    for (const format of ['svg', 'ico']) {
      const response = await favicon.environmentFavicon(format, new Request(`https://app.dezsolucoes.com.br/favicon.${format}?v=dez-green-navy-1`));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), read(`dez-green-navy.${format}`));
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
      const originalMark = await favicon.environmentFavicon(format, new Request(`https://app.dezsolucoes.com.br/favicon.${format}?v=dez-blue-1`));
      assert.deepEqual(Buffer.from(await originalMark.arrayBuffer()), read(`dez-blue.${format}`));
    }
    process.env.DEPLOYMENT_PROFILE = 'homolog';
    process.env.APP_PUBLIC_URL = process.env.NEXTAUTH_URL = 'https://homolog.dezsolucoes.com.br';
    process.env.DATABASE_URL = 'postgresql://runtime:synthetic@0f5rvkjqjdt9fez1ajiascyk/gestar_homolog_pg18';
    for (const version of ['dez-green-navy-1', 'dez-blue-1', 'homolog-yellow-1']) {
      const response = await favicon.environmentFavicon('svg', new Request(`https://homolog.dezsolucoes.com.br/favicon.svg?v=${version}`));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), read('homolog-yellow.svg'));
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
