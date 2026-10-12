# SEO Strategy — a foundational product requirement (2026-10-12)

**Status:** Accepted; not optional polish. Search-engine crawling and indexing depend on many external factors; the goal is technical eligibility, NOT a guaranteed rank/traffic. Also protect QR menu experience.

## Rendering decisions
- `/` marketing/landing: pre-render (SSG), full semantic content.
- `/r/{slug}` canonical restaurant menu: Angular hybrid **SSR** (real menu text in initial response) + hydration for search, category filters and localization.
- `/m/{publicCode}` printed QR: stable opaque ID, server resolves active restaurant and responds with **302** directly to current canonical `/r/{slug}`. Public code never expires because of a name change. No redirect chains. This redirect costs an extra navigation round trip: measure, monitor, optimize routing and evaluate a cached resolver at the edge only if justified.
- `/admin/*`, `/platform/*`, `/login`, authenticated preview: CSR, auth enforced and noindex; don't confuse robots.txt crawl blocking with noindex rules.
- Suspended/unpublished/nonexistent: no indexable public content; real 404/410 where appropriate, not a soft-404 200; do not disclose unpublished names.

## Structure, on-page SEO, semantics
1. Server response must contain actual `<h1>` restaurant name, clear headings for categories, and human-readable product names/descriptions/prices in HTML. Do NOT depend on crawler executing JavaScript to see basic menu content. Ensure meaningful text exists even with JS disabled.
2. Per restaurant: unique, descriptive `<title>` and meta description; server-rendered canonical absolute URL; optional Open Graph/Twitter share metadata using safe image URLs. Never use the platform name alone for every restaurant.
3. `lang=ar`, `dir=rtl` by default in source HTML; English pages only when sufficiently translated to justify independently indexable locale URLs. If locale-specific canonical paths implemented, ensure correct `hreflang`, reciprocal alternates, canonical per locale, and x-default policy. Otherwise a single canonical Arabic menu with English browser toggle and NO fictitious hreflang.
4. Use meaningful `<a href>` links for navigable pages and semantic HTML (not div-click handlers only). Proper robots meta; no hidden keyword stuffing, duplicate auto-generated thin pages or fake locality fields.
5. Clean URL identifiers, globally unique normalized slugs; collisions handled server-side. On slug change, old slug 301 straight to current canonical, while printed QR alias remains 302. Prevent open redirects via untrusted Host headers or externally-supplied destination values. Persist known trusted public base origin.

## Structured data (Schema.org + Google-specific guidelines)
- On genuine published restaurant page emit server-rendered `application/ld+json` with `@context=https://schema.org`, `@type=Restaurant`, `name`, `url`, `menu` (fully qualified canonical menu URL), and optional owner-approved accurate `image`, `telephone`, `address`, `servesCuisine`, `openingHoursSpecification` if verified and publicly enabled. Do not fabricate reviews, ratings, price ranges, hours, addresses, locations, branches or menu dish markup.
- Serialize/sanitize dynamically entered content safely for HTML script context, including escaping `</script>` / `<` and relevant Unicode separators. Test malicious input; never concatenate raw restaurant text into JSON-LD or `innerHTML`.
- Structured data must match user-visible published content. Validate with Google's Rich Results Test/Schema validator where accessible; eligibility ≠ rich-result guarantee.

## Crawl, sitemap and lifecycle
- Serve real `/robots.txt` and dynamic `/sitemap.xml` from known public origin. Sitemap contains ONLY canonical, published, active restaurant URLs, XML escaped, with honest `lastmod` timestamps tied to actual public content changes. Split into sitemap index/files over 50,000 URLs or 50 MB uncompressed.
- QR aliases, login/admin, preview, suspended, draft, filter/search variants, and internal/API routes must not appear in sitemap. Use server status/noindex/auth as needed; robots.txt does not itself guarantee de-indexing.
- Publishing a restaurant adds its canonical page on next sitemap generation; unpublishing removes it promptly and invalidates SSR/cache. Update cache on product/price/branding/slug/status changes; robots and sitemap policies covered by tests.
- After verified public deployment, configure Google Search Console for owned domain, submit sitemap, check URL Inspection rendered HTML and indexing diagnostics. Expect discovery/indexing delays; never claim Google indexed it without inspection.

## Data/business responsibilities
- Restaurant owner controls safe SEO name/summary and optionally public contacts, business category, location, hours (if present). Fields have length constraints and validation. No personal emails or hidden admin data in SEO metadata or public structured data.
- Only one canonical URL per public restaurant, not one per category/product initially; category pages can be separate SEO stories if they contain substantial unique content, canonical rules, and measured value.
- Avoid indexing unsupported languages and hundreds of near-duplicate combinations of search/filter query parameters.

## Verification baseline from F01 onwards
- `curl -i https://<host>/r/demo` (demo fixture): HTTP 200, actual name+product text, canonical, title, description, supported JSON-LD in *response HTML*. No JS needed.
- `curl -I https://<host>/m/demo-code`: HTTP 302 with exact same-origin canonical Location, no chain.
- `/r/nonexistent` -> actual 404; `/admin` not indexable; sitemap excludes draft tenant and QR alias; sitemap XML validates.
- Parallel SSR requests for restaurant A and B never mix content or SEO metadata; cache invalidation after price edit proves HTML freshness.
- Playwright JS disabled + enabled; LHCI SEO audits and browser source snapshots on production build; Google URL Inspection after real deployment.

## Sources
- Google JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google LocalBusiness structured data: https://developers.google.com/search/docs/appearance/structured-data/local-business
- Google noindex: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Google sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Angular Hybrid Rendering: https://angular.dev/guide/hybrid-rendering
