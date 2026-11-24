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

// Shared by every cold-load probe: HTTP >= 400 is a problem, and every executable response (resource
// type script, or a .js path) must be same-origin, a flat built artifact that exists in `folder`, and
// served with a JavaScript MIME type. Only then is it added to the measured script set.
export function classifyResponse(r, expectedOrigin, folder, scripts, problems) {
  const u = new URL(r.url());
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${u.pathname}`);
  const executable = r.request().resourceType() === 'script' || u.pathname.endsWith('.js');
  if (!executable) return;
  if (u.origin !== expectedOrigin) return problems.push('foreign script origin: ' + u.origin);
  const file = u.pathname.slice(1);
  if (!/^[\w.-]+\.js$/.test(file) || !existsSync(join(folder, file)))
    return problems.push('script not a built artifact: ' + u.pathname);
  if (!/javascript/.test(r.headers()['content-type'] ?? ''))
    problems.push('bad js mime: ' + u.pathname);
  scripts.add(file);
}

// Cold navigation in a fresh context. Fails closed: any page error, console error, failed
// request, HTTP >= 400, or non-JavaScript script response throws. `readySelector` plus
// `expectText` must be visible, so an error or not-found screen cannot satisfy readiness.
export async function coldScripts(
  browser,
  url,
  folder,
  { readySelector, expectText, lang, dir, timeout = 15000, prepare, interact },
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
    page.on('response', (r) => classifyResponse(r, expectedOrigin, folder, scripts, problems));
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
    // 1. Settle the initial route: hydration and deferred requests finish inside this window.
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle', { timeout });
    // 2. Snapshot the complete initial-route closure. This is the measured set.
    const routeScripts = [...scripts].sort();
    if (routeScripts.length === 0) problems.push('no scripts observed');
    if (problems.length) throw new Error(`cold load problems for ${url}: ${problems.join('; ')}`);
    // 3. Optional client-interaction readiness check (a click handler, or a client router
    // navigation). It runs only after the route is ready, settled and measured, and may load
    // other routes' chunks, which are never added to the measured set. A failure here is tagged.
    if (interact) {
      try {
        await interact(page, timeout);
      } catch (error) {
        throw new Error(`interaction failed for ${url}: ${error.message}`);
      }
      if (problems.length)
        throw new Error(`problems after interaction for ${url}: ${problems.join('; ')}`);
    }
    return routeScripts;
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

// Real SSR hydration probe (requires the real SSR server; the static CSR harness cannot use it).
// The client entry script (main-*.js) is held until the server-rendered DOM has been marked, so the
// check compares the SSR DOM with the DOM after the client takes over:
//   before: the route host holds the expected tenant heading, item text, lang and dir, still carrying
//   Angular hydration markers (`ngh`); the held entry script has actually been requested.
//   after release: same tenant/item/lang/dir, markers consumed, the SAME heading node (our expando
//   survives) is reused, and no console error/warning, pageerror, failed request or HTTP >= 400.
// Scope, stated narrowly: observed reuse of the SSR heading node and consumption of hydration
// metadata after a fixed settle, in the SAME load that also reports its script set. It is NOT an
// Angular application-stability signal (none is exposed by a production build) and does not prove
// every node of the routed tree was reused. ng-version is emitted by the server, so it is no signal.
// Controls: `neverRelease` (client never boots) and `replaceSsrNode` (the SSR heading is swapped for an
// unmarked clone before the client boots, so reuse cannot be claimed).
export async function hydrationProbe(
  browser,
  url,
  folder,
  {
    prepare,
    timeout = 15000,
    neverRelease = false,
    replaceSsrNode = false,
    host = 'app-public-menu main.public-menu',
    headingText,
    contains,
    lang,
    dir,
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  try {
    context.setDefaultTimeout(timeout);
    const page = await context.newPage();
    if (prepare) await prepare(page);
    const problems = [];
    const scripts = new Set();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()))
        problems.push(`console ${m.type()}: ` + m.text());
    });
    page.on('requestfailed', (r) => {
      if (!(neverRelease && /\/main-[^/]*\.js/.test(r.url()))) problems.push('failed: ' + r.url());
    });
    const expectedOrigin = new URL(url).origin;
    page.on('response', (r) => classifyResponse(r, expectedOrigin, folder, scripts, problems));
    let release;
    const gate = new Promise((r) => (release = r));
    let held = 0;
    await page.route(/\/main-[^/]*\.js(\?.*)?$/, async (route) => {
      held++;
      if (neverRelease) return; // the request hangs
      await gate;
      await route.continue();
    });
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForSelector(host + ' h1', { state: 'attached' });
    const read = (args) =>
      page.evaluate(({ host, headingText, contains, lang, dir, mark, replace }) => {
        const root = document.querySelector(host);
        let h1 = root?.querySelector('h1') ?? null;
        if (h1 && mark) h1.__ssrMark = 'ssr';
        if (h1 && replace) {
          const clone = h1.cloneNode(true);
          h1.replaceWith(clone);
          h1 = clone;
        }
        return {
          hostPresent: !!root,
          heading: h1?.textContent?.trim() ?? null,
          headingOk: headingText === undefined || h1?.textContent?.trim() === headingText,
          containsOk: contains === undefined || !!root?.textContent?.includes(contains),
          langOk: lang === undefined || document.documentElement.lang === lang,
          dirOk: dir === undefined || document.documentElement.dir === dir,
          hydrationMarkers: document.querySelectorAll('[ngh]').length,
          nodeReused: h1?.__ssrMark === 'ssr',
        };
      }, args);
    const base = { host, headingText, contains, lang, dir };
    const heldBefore = held;
    const before = await read({ ...base, mark: true, replace: replaceSsrNode });
    release();
    if (!neverRelease) await page.waitForLoadState('networkidle');
    await page.waitForTimeout(neverRelease ? 1500 : 1000);
    const after = await read({ ...base, mark: false, replace: false });
    return { heldBefore, before, after, problems, files: [...scripts].sort() };
  } finally {
    await context.close();
  }
}

export function assertHydrated(r, label) {
  const bad = [];
  if (r.heldBefore < 1) bad.push('client entry script was not held before the SSR DOM was marked');
  for (const [phase, v] of [
    ['before', r.before],
    ['after', r.after],
  ]) {
    if (!v.hostPresent) bad.push(`${phase}: route host missing`);
    if (!v.headingOk) bad.push(`${phase}: tenant heading differs from expected (${v.heading})`);
    if (!v.containsOk) bad.push(`${phase}: expected item text missing`);
    if (!v.langOk) bad.push(`${phase}: document lang differs`);
    if (!v.dirOk) bad.push(`${phase}: document dir differs`);
  }
  if (r.before.hydrationMarkers < 1) bad.push('SSR markup carried no hydration markers');
  if (r.after.hydrationMarkers !== 0)
    bad.push(`${r.after.hydrationMarkers} hydration markers left`);
  if (!r.after.nodeReused) bad.push('server-rendered node was replaced, not reused');
  if (r.problems.length) bad.push('problems: ' + r.problems.join('; '));
  if (bad.length) throw new Error(`${label} not hydrated: ${bad.join('; ')}`);
}
