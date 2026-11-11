// index.html preloads every browser module so slow connections don't wait on the import chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = new URL('../src/', import.meta.url);

function modules(dir, prefix = 'src/') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? modules(join(dir, e.name), `${prefix}${e.name}/`)
      : e.name.endsWith('.js') ? [`${prefix}${e.name}`] : []);
}

test('every module in src/ is preloaded, and nothing else', () => {
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(preloaded, modules(fileURLToPath(src)).sort());
});

test('the page shows a loading line until the app renders', () => {
  assert.match(html, /<main id="main"[^>]*><p class="muted"[^>]*>Loading…<\/p><\/main>/);
});
