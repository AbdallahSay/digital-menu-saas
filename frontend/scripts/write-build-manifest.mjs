// Run immediately after the build that produced dist/digital-menu/browser:
//   node scripts/write-build-manifest.mjs "<exact build command>"
// Writes dist/digital-menu/build-manifest.json (git SHA, dirty flag, build command, Node version,
// sha256 of every emitted browser file). Measurement scripts refuse to run when the folder does
// not match it, so a stale or rebuilt dist cannot be attributed to the wrong build.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = 'dist/digital-menu/browser';
const git = (c) => {
  try {
    return execSync(c, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};
const files = Object.fromEntries(
  readdirSync(folder)
    .filter((f) => /\.(js|css|html)$/.test(f))
    .sort()
    .map((f) => [
      f,
      createHash('sha256')
        .update(readFileSync(join(folder, f)))
        .digest('hex'),
    ]),
);
writeFileSync(
  'dist/digital-menu/build-manifest.json',
  JSON.stringify(
    {
      gitSha: git('git rev-parse HEAD'),
      gitTreeDirty: git('git status --porcelain -- . ":!dist" ":!.lighthouseci"') !== '',
      buildCommand: process.argv[2] ?? 'unrecorded',
      node: process.version,
      builtAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ),
);
console.log('manifest written for', Object.keys(files).length, 'files');
