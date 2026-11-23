import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const root = new URL('../../', import.meta.url);
test('repository-root hosting uses reviewed SSR packaging, never Angular auto-detection', () => {
  const config = JSON.parse(readFileSync(new URL('vercel.json', root)));
  const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
  assert.equal(config.framework, null);
  assert.equal(config.installCommand, 'npm ci --prefix frontend');
  assert.equal(config.buildCommand, 'npm run build:vercel');
  assert.equal(pkg.engines.node, '24.x');
  assert.equal(pkg.scripts['build:vercel'], 'node scripts/build-vercel.mjs');
});

test('root build output exactly matches the packaged SSR output', () => {
  for (const path of [
    'config.json',
    'functions/index.func/index.mjs',
    'functions/index.func/.vc-config.json',
  ]) {
    assert.deepEqual(
      readFileSync(new URL(`.vercel/output/${path}`, root)),
      readFileSync(new URL(`frontend/.vercel/output/${path}`, root)),
    );
  }
});
