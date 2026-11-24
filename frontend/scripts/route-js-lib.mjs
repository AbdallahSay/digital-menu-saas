import { readFileSync, readdirSync } from 'node:fs';
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
  { readySelector, expectText, timeout = 15000, prepare },
) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
      const path = new URL(r.url()).pathname;
      if (r.status() >= 400) problems.push(`http ${r.status()}: ${path}`);
      if (path.endsWith('.js')) {
        if (!/javascript/.test(r.headers()['content-type'] ?? ''))
          problems.push('bad js mime: ' + path);
        scripts.add(path.slice(1));
      }
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    await page.waitForFunction(
      ([sel, text]) => (document.querySelector(sel)?.textContent ?? '').includes(text),
      [readySelector, expectText],
      { timeout },
    );
    if (problems.length) throw new Error(`cold load problems for ${url}: ${problems.join('; ')}`);
    return [...scripts].sort();
  } finally {
    await context.close();
  }
}
