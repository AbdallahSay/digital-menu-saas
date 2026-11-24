// Default-off sitemap policy. Pure functions, no imports, no I/O. Enabling is an owner decision (opt-in
// authority and canonical origin); nothing here enables indexing by itself.
export type SitemapConfig =
  | { enabled: false; reason: string }
  | { enabled: true; origin: string };

// Supported cap: ONE backend page (1000 entries). More pages or truncation fail closed (no partial sitemap).
export const MAX_ENTRIES = 1000;
export const MAX_BODY_BYTES = 1_000_000;
const RESERVED_DEMO = 'demo';
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
    const date = new Date(e?.lastModifiedUtc);
    if (typeof e?.slug !== 'string' || !SLUG.test(e.slug) || e.slug.includes('--') || Number.isNaN(date.getTime()))
      return null;
    if (seen.has(e.slug)) return null; // duplicate slug: malformed page, fail closed
    seen.add(e.slug);
    if (e.slug === RESERVED_DEMO) continue; // demo has its own, unsettled policy: never listed from a backend fixture
    urls.push(
      `<url><loc>${config.origin}/r/${encodeURIComponent(e.slug)}</loc><lastmod>${date.toISOString()}</lastmod></url>`,
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
): Promise<SitemapResult> {
  if (!config.enabled)
    return { status: 404, type: 'text/plain', body: 'Not found', headers: NO_STORE };
  const fail: SitemapResult = { status: 503, type: 'text/plain', body: 'Sitemap unavailable', headers: NO_STORE };
  try {
    const response = await doFetch(backendUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return fail;
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) return fail;
    const xml = renderSitemap(config, JSON.parse(text));
    return xml === null ? fail : { status: 200, type: 'application/xml', body: xml, headers: NO_STORE };
  } catch {
    return fail;
  }
}
