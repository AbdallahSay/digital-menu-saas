import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secureAssets } from '../src/secure-assets.ts';

// Exercises initialization as well as post-start swaps. The separate HTTP suite
// covers the shipped Angular/Express bundle. Symlink creation MUST succeed.
test('snapshot excludes pre-existing file/directory symlinks and survives runtime rename swaps', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'm02-assets-'));
  const root = join(temporary, 'browser');
  const outside = join(temporary, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  const canary = 'CANARY_MUST_NOT_LEAK';
  writeFileSync(join(outside, 'secret.json'), canary);
  writeFileSync(join(root, 'main-SAFE.js'), 'safe asset');
  mkdirSync(join(root, 'fonts'));
  writeFileSync(join(root, 'fonts', 'safe.woff2'), 'safe font');
  let server;
  try {
    symlinkSync(join(outside, 'secret.json'), join(root, 'escape.json'));
    symlinkSync(
      outside,
      join(root, 'escape-directory'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const app = express();
    app.use(secureAssets(root));
    app.use((_req, res) => res.status(404).end());
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    renameSync(join(root, 'main-SAFE.js'), join(root, 'original.js'));
    symlinkSync(join(outside, 'secret.json'), join(root, 'main-SAFE.js'));
    renameSync(join(root, 'fonts'), join(root, 'original-fonts'));
    symlinkSync(outside, join(root, 'fonts'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const encoding of ['gzip', 'identity']) {
      for (const method of ['GET', 'HEAD']) {
        for (const path of [
          '/escape.json',
          '/escape-directory/secret.json',
          '/fonts/secret.json',
        ]) {
          const response = await fetch(origin + path, {
            method,
            headers: { 'Accept-Encoding': encoding },
          });
          assert.equal(response.status, 404);
          assert.ok(!(await response.text()).includes(canary));
        }
        const asset = await fetch(origin + '/main-SAFE.js', {
          method,
          headers: { 'Accept-Encoding': encoding },
        });
        assert.equal(asset.status, 200);
        assert.equal(await asset.text(), method === 'HEAD' ? '' : 'safe asset');
        const font = await fetch(origin + '/fonts/safe.woff2', { method });
        assert.equal(font.status, 200);
        assert.equal(await font.text(), method === 'HEAD' ? '' : 'safe font');
      }
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    // Only this test's mkdtemp directory; never the application build or storage.
    rmSync(temporary, { recursive: true, force: true });
  }
});
