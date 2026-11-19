// Demo-preview packaging only (frontend + built-in /r/demo fixture, no .NET API).
// Converts `ng build` output into Vercel Build Output API v3 so it can be deployed with
// `vercel deploy --prebuilt`. Not a production hosting decision (P0 remains open).
// Usage: DEMO_HOST=<project>.vercel.app node scripts/vercel-prebuilt.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const host = process.env.DEMO_HOST;
if (!host || !/^[a-z0-9-]+\.vercel\.app$/.test(host))
  throw new Error('DEMO_HOST must be an exact <name>.vercel.app host');

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist/digital-menu');
if (!existsSync(join(dist, 'server/server.mjs'))) throw new Error('Run `ng build` first');

const out = join(root, '.vercel/output');
rmSync(out, { recursive: true, force: true });
const fn = join(out, 'functions/index.func');
mkdirSync(fn, { recursive: true });
cpSync(join(dist, 'server'), join(fn, 'server'), { recursive: true });
cpSync(join(dist, 'browser'), join(fn, 'browser'), { recursive: true });
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
// Configuration is fixed at packaging time, never derived from the incoming Host header.
writeFileSync(
  join(fn, 'index.mjs'),
  `process.env.NG_ALLOWED_HOSTS = ${JSON.stringify(host)};
process.env.PUBLIC_ORIGIN = ${JSON.stringify('https://' + host)};
const { reqHandler } = await import('./server/server.mjs');
export default reqHandler;
`,
);
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
  }),
);
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      // Demo preview must never be indexed.
      { src: '/(.*)', headers: { 'X-Robots-Tag': 'noindex, nofollow' }, continue: true },
      { src: '/(.*)', dest: '/index' },
    ],
  }),
);
console.log('Vercel prebuilt output ready for', host);
