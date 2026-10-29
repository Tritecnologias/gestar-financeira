import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

test('approved circular blue artwork is embedded without changing its pixels', () => {
  const svg = readFileSync('public/favicon.svg', 'utf8');
  const embedded = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  assert.ok(embedded);
  const png = Buffer.from(embedded[1], 'base64');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6);
  assert.equal(createHash('sha256').update(png).digest('hex'), '1bfe9ba743ef6143aa8515a2e7cc5effcc5dfda91466c45131c89dfe97898d27');
});

test('ICO fallback has transparent 32-bit frames for 16/32/48 pixel tabs', () => {
  const ico = readFileSync('src/app/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    assert.equal(ico.readUInt16LE(entry + 6), 32);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(ico.readUInt32LE(offset), 40);
    assert.equal(ico.readInt32LE(offset + 4), size);
    assert.equal(ico.readInt32LE(offset + 8), size * 2);
    const pixels = offset + 40;
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
      assert.equal(ico[pixels + (y * size + x) * 4 + 3], 0);
    }
    let blue = 0;
    let white = 0;
    for (let i = 0; i < size * size; i++) {
      const [b, g, r, a] = ico.subarray(pixels + i * 4, pixels + i * 4 + 4);
      if (a > 200 && b > r * 1.5 && b > g) blue++;
      if (a > 200 && r > 220 && g > 220 && b > 220) white++;
    }
    assert.ok(blue > 0 && white > 0, `Blue disc and white symbol: ${size}px`);
  }
});
