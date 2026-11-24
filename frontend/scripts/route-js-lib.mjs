import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const ROUTE_BUDGET_BYTES = 180 * 1024;
// Strings only the lazy admin/platform code contains. They name those chunks explicitly. The
// matching chunks must exist (checked by callers) so a renamed marker cannot silently pass.
export const ADMIN_MARKERS = ['platform/leads', 'admin/categories'];

export const gzipBytes = (folder, files) =>
  files.reduce((t, f) => t + gzipSync(readFileSync(join(folder, f))).length, 0);

export const jsFiles = (folder) => readdirSync(folder).filter((f) => f.endsWith('.js'));

export const chunksContaining = (folder, markers) =>
  jsFiles(folder).filter((f) => {
    const code = readFileSync(join(folder, f), 'utf8');
    return markers.some((m) => code.includes(m));
  });

export const adminChunks = (folder) => chunksContaining(folder, ADMIN_MARKERS);

// The one budget assertion. Throws when a measurement is empty or over budget.
export function enforceBudget(label, measurement, budget = ROUTE_BUDGET_BYTES) {
  if (!measurement || measurement.files.length === 0)
    throw new Error(`${label}: no scripts measured`);
  if (measurement.bytes > budget)
    throw new Error(`${label}: ${measurement.bytes} B gzip exceeds ${budget} B`);
}

// Cold navigation in a fresh context. Fails closed: any page error, console error, failed
// request, HTTP >= 400, or non-JavaScript script response throws. `readySelector` plus
// `expectText` must be visible, so an error or not-found screen cannot satisfy readiness.
export async function coldScripts(
  browser,
  url,
  folder,
  { readySelector, expectText, lang, dir, timeout = 15000, prepare },
) {
  const expectedOrigin = new URL(url).origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block', // no service worker or prior cache can hide requests; context is fresh
  });
  try {
    context.setDefaultTimeout(timeout);
    const page = await context.newPage();
    if (prepare) await prepare(page); // e.g. serve the seeded logo that is not in storage
    const scripts = new Set();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
    page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (r.status() >= 400) problems.push(`http ${r.status()}: ${u.pathname}`);
      const executable = r.request().resourceType() === 'script' || u.pathname.endsWith('.js');
      if (!executable) return;
      // Every executable must be same-origin and map to a built artifact, or the run fails.
      if (u.origin !== expectedOrigin) return problems.push('foreign script origin: ' + u.origin);
      const file = u.pathname.slice(1);
      if (!/^[\w.-]+\.js$/.test(file) || !existsSync(join(folder, file)))
        return problems.push('script not a built artifact: ' + u.pathname);
      if (!/javascript/.test(r.headers()['content-type'] ?? ''))
        problems.push('bad js mime: ' + u.pathname);
      scripts.add(file);
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    // BOOTSTRAP oracle, not a proof that the routed component finished hydrating: expected text is
    // present (SSR HTML already has it for SSR routes), AND Angular's client
    // runtime has attached to the root (the __ngContext__ property exists only after client bootstrap), AND the
    // expected lang/dir hold when given.
    await page.waitForFunction(
      ([sel, text, lang, dir]) =>
        (document.querySelector(sel)?.textContent ?? '').includes(text) &&
        '__ngContext__' in (document.querySelector('app-root') ?? {}) &&
        (!lang || document.documentElement.lang === lang) &&
        (!dir || document.documentElement.dir === dir),
      [readySelector, expectText, lang ?? '', dir ?? ''],
      { timeout },
    );
    // Stable window: let hydration and any deferred requests settle before the set is read.
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle', { timeout });
    if (scripts.size === 0) problems.push('no scripts observed');
    if (problems.length) throw new Error(`cold load problems for ${url}: ${problems.join('; ')}`);
    return [...scripts].sort();
  } finally {
    await context.close();
  }
}

// Retained evidence. `gzipSourceBytes` is the default-level gzip of the exact local file bytes,
// an estimate of what the budget gates compare. It is NOT the measured transfer size: the real
// host may serve brotli or another gzip level, so actual encoded bytes are recorded separately
// only where a server under test reports them (none here).
// Fails unless the folder is byte-identical to the build recorded by write-build-manifest.mjs.
export function verifyBuildManifest(folder) {
  const path = join(folder, '..', 'build-manifest.json');
  if (!existsSync(path))
    throw new Error('build-manifest.json missing: run write-build-manifest.mjs after the build');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const actual = readdirSync(folder)
    .filter((f) => /\.(js|css|html)$/.test(f))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('dist files differ from build manifest (rebuilt or stale)');
  for (const f of actual) {
    const sha = createHash('sha256')
      .update(readFileSync(join(folder, f)))
      .digest('hex');
    if (sha !== manifest.files[f]) throw new Error(`dist file ${f} differs from build manifest`);
  }
  return manifest;
}

// Retained evidence. `gzipSourceBytes` is the default-level gzip of the exact local file bytes,
// an estimate of what the budget gates compare. It is NOT the measured transfer size: transport
// size is not recorded by this harness (unmeasured, not impossible).
export function writeRouteEvidence(name, folder, measurements, browserVersion = 'unknown') {
  const manifest = verifyBuildManifest(folder);
  mkdirSync('.lighthouseci', { recursive: true });
  const routes = Object.fromEntries(
    Object.entries(measurements).map(([route, m]) => [
      route,
      {
        gzipSourceBytes: m.bytes,
        files: m.files.map((f) => ({ file: f, gzipSourceBytes: gzipBytes(folder, [f]) })),
      },
    ]),
  );
  writeFileSync(
    `.lighthouseci/${name}.json`,
    JSON.stringify(
      {
        budgetBytes: ROUTE_BUDGET_BYTES,
        estimate: 'gzip-default-local-source',
        observedTransport: 'unmeasured',
        build: {
          gitSha: manifest.gitSha,
          gitTreeDirty: manifest.gitTreeDirty,
          buildCommand: manifest.buildCommand,
          node: manifest.node,
          builtAt: manifest.builtAt,
        },
        measuredWith: { node: process.version, browser: browserVersion },
        cache:
          'fresh browser context per route, service workers blocked, 1000 ms plus networkidle after the bootstrap oracle',
        protectedChunkMarkers: ADMIN_MARKERS,
        protectedChunksFound: adminChunks(folder),
        routes,
      },
      null,
      2,
    ),
  );
}
