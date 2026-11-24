// Default-off sitemap policy. Pure functions, no imports, no I/O. Enabling is an owner decision (opt-in
// authority and canonical origin); nothing here enables indexing by itself.
export type SitemapConfig = { enabled: false; reason: string } | { enabled: true; origin: string };

// Supported cap: ONE backend page (1000 entries). More pages or truncation fail closed (no partial sitemap).
export const MAX_ENTRIES = 1000;
export const MAX_BODY_BYTES = 1_000_000;
const RESERVED_DEMO = 'demo';
export function xmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}
// Strict ISO-8601 UTC timestamp only (string, with Z or offset), and the calendar fields must round-trip,
// so Feb 31 or 0/null/true can never normalize into a date.
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/;
export function parseStrictDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = ISO.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    se > 59
  )
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

// SITEMAP_ENABLED must be exactly "true" to even be considered. SITEMAP_ORIGIN has no default and must be
// a bare https origin (no credentials, path, query or hash). Any problem means disabled.
export function readSitemapConfig(env: Record<string, string | undefined>): SitemapConfig {
  if (env['SITEMAP_ENABLED'] !== 'true') return { enabled: false, reason: 'not enabled' };
  const raw = env['SITEMAP_ORIGIN'];
  if (!raw) return { enabled: false, reason: 'SITEMAP_ORIGIN is not set' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { enabled: false, reason: 'SITEMAP_ORIGIN is invalid' };
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    raw !== url.origin
  )
    return { enabled: false, reason: 'SITEMAP_ORIGIN must be a bare https origin' };
  return { enabled: true, origin: url.origin };
}

export function robotsTxt(config: SitemapConfig): string {
  const base = 'User-agent: *\nDisallow: /admin\nDisallow: /api/\n';
  return config.enabled ? `${base}Sitemap: ${config.origin}/sitemap.xml\n` : base;
}

export interface SitemapEntry {
  slug: string;
  lastModifiedUtc: string;
}
export interface SitemapPage {
  page: number;
  hasMore: boolean;
  truncated: boolean;
  entries: SitemapEntry[];
}

// Returns null when the backend payload is not exactly what is expected (fail closed). Multi-page and
// truncated results are not supported yet and are also null, never a partial sitemap.
export function renderSitemap(config: SitemapConfig, page: unknown): string | null {
  if (!config.enabled || !page || typeof page !== 'object') return null;
  const p = page as Partial<SitemapPage>;
  if (p.page !== 1 || p.hasMore !== false || p.truncated !== false || !Array.isArray(p.entries))
    return null;
  if (p.entries.length > MAX_ENTRIES) return null;
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const e of p.entries) {
    const date = parseStrictDate(e?.lastModifiedUtc);
    if (typeof e?.slug !== 'string' || !SLUG.test(e.slug) || e.slug.includes('--') || date === null)
      return null;
    if (seen.has(e.slug)) return null; // duplicate slug: malformed page, fail closed
    seen.add(e.slug);
    if (e.slug === RESERVED_DEMO) continue; // demo has its own, unsettled policy: never listed from a backend fixture
    urls.push(
      `<url><loc>${xmlEscape(`${config.origin}/r/${encodeURIComponent(e.slug)}`)}</loc><lastmod>${xmlEscape(date.toISOString())}</lastmod></url>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

export interface SitemapResult {
  status: 200 | 404 | 503;
  type: 'application/xml' | 'text/plain';
  body: string;
  headers: Record<string, string>;
}
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
// The only place a backend request can happen. Disabled config returns before any fetch. Destination is the
// injected internal API URL, never a request value. Scope: sitemap LISTING only; this does not change whether
// published menu pages themselves are indexable (they still emit index,follow).
export async function sitemapResponse(
  config: SitemapConfig,
  backendUrl: string,
  doFetch: typeof fetch,
  timeoutMs = 5000,
): Promise<SitemapResult> {
  if (!config.enabled)
    return { status: 404, type: 'text/plain', body: 'Not found', headers: NO_STORE };
  const fail: SitemapResult = {
    status: 503,
    type: 'text/plain',
    body: 'Sitemap unavailable',
    headers: NO_STORE,
  };
  const controller = new AbortController();
  const open: { cancel(): Promise<void> }[] = [];
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One deadline for the WHOLE operation (fetch, body read, cancellation). The deadline race does not depend on
  // the fetch adapter, the stream or cancel() honouring the signal: whichever settles first wins, and any work
  // that never settles is abandoned (its rejection is swallowed), not awaited.
  const deadline = new Promise<SitemapResult>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      for (const r of open) bestEffortCancel(r); // abandon, never await
      resolve(fail);
    }, timeoutMs);
  });
  const operation = (async (): Promise<SitemapResult> => {
    try {
      if (controller.signal.aborted) return fail;
      const response = await doFetch(backendUrl, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
      if (expired || !response.ok) {
        // Late arrival after the deadline (adapter ignored the signal) or a non-OK body: release it, read nothing.
        bestEffortCancel(response.body);
        return fail;
      }
      const text = await readBounded(response, MAX_BODY_BYTES, open, () => expired);
      if (text === null) return fail;
      const xml = renderSitemap(config, JSON.parse(text));
      return xml === null
        ? fail
        : { status: 200, type: 'application/xml', body: xml, headers: NO_STORE };
    } catch {
      return fail;
    }
  })();
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort(); // idempotent; releases anything still tied to the signal
  }
}

// Cancellation is best effort and never awaited: a cancel() that never settles must not hold the response.
function bestEffortCancel(target: { cancel(): Promise<void> } | null | undefined): void {
  if (!target) return;
  try {
    void Promise.resolve(target.cancel()).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

// Reads the actual bytes incrementally and stops as soon as the cap is crossed. Deadline handling lives in the
// caller's race; a read that never settles is abandoned there.
async function readBounded(
  response: Response,
  max: number,
  open: { cancel(): Promise<void> }[],
  isExpired: () => boolean,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  open.push(reader);
  if (isExpired()) {
    bestEffortCancel(reader);
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    if (isExpired()) {
      bestEffortCancel(reader);
      return null;
    }
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      bestEffortCancel(reader);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}
