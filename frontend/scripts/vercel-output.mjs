// Packages the Angular SSR build as a Vercel Build Output API v3 bundle:
// one Node function that serves everything (SSR pages, /api router, and the
// existing secure asset snapshot), so Vercel never serves a file that the app's
// own security headers and path rules did not see. Run after `ng build`.
// Configuration is trusted env only (PUBLIC_ORIGIN, PUBLIC_API_ORIGIN).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist', 'digital-menu');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'index.func');
if (!existsSync(join(dist, 'server', 'server.mjs')) || !existsSync(join(dist, 'browser')))
  throw new Error('Run "npm run build" first: dist/digital-menu/{server,browser} is missing.');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
cpSync(join(dist, 'server'), join(fn, 'server'), { recursive: true });
cpSync(join(dist, 'browser'), join(fn, 'browser'), { recursive: true });
// The SSR bundle keeps its original relative layout (server/ beside browser/).
// Angular's SSR engine rejects any Host not in its allowlist (angular.json lists
// localhost only) and reads NG_ALLOWED_HOSTS when the engine is constructed.
// The deployment allowlist is derived from the trusted PUBLIC_ORIGIN env, never
// from a request header, and the server is imported only afterwards. A missing
// or non-https origin fails closed at cold start. Never "*".
writeFileSync(
  join(fn, 'index.mjs'),
  `const origin = process.env.PUBLIC_ORIGIN;
let host;
try {
  const url = new URL(origin ?? '');
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new Error('bad origin');
  host = url.hostname;
} catch {
  throw new Error('PUBLIC_ORIGIN must be the deployment bare https origin.');
}
if (!host || host === '*' || host.includes('*')) throw new Error('PUBLIC_ORIGIN host is not allowed.');
process.env.NG_ALLOWED_HOSTS = host;
const { reqHandler } = await import('./server/server.mjs');
export default reqHandler;
`,
);
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      maxDuration: 15,
      // Large buffered responses (public menu reads allow up to 16 MiB) must not hit the
      // 4.5 MB buffered-response cap. This does NOT lift the incoming request cap below.
      supportsResponseStreaming: true,
    },
    null,
    2,
  ) + '\n',
);
// Every path goes to the function; the app itself decides assets vs. pages.
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/index' }] }, null, 2) + '\n',
);
console.log('Wrote', out);
