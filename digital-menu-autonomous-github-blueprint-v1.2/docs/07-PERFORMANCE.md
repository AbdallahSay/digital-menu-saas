# Performance Strategy — measurable, not assumed

## Core Web Vitals (public mobile, p75 field goal)
- LCP <= 2.5 seconds
- INP <= 200 milliseconds
- CLS <= 0.1
Reference: https://web.dev/articles/vitals — field p75, segmented mobile/desktop. These are targets, never claim achieved without collected data. On early-stage traffic use synthetic Lighthouse + lab traces, then add Real User Monitoring once real traffic exists.

## Provisional engineering budgets (review against measured hosting)
- Mobile Lighthouse Performance score target >= 90 on an agreed repeatable setup; not a substitute for CWV.
- Public API warm-cache p95 response <= 300ms under test scenario; p99 to be tracked; revise budget with real regional infrastructure measurements and published methodology.
- API error rate < 1% during agreed load test, excluding deliberately injected invalid requests.
- Initial above-the-fold images optimized and responsive (small thumbnails typically <= 100 KiB), lazy-load lower images; avoid a full-resolution cover as LCP.
- JS bundle budgets set during Angular initial build, tracked in CI; prefer no large UI libraries on anonymous route.
- Initial product scale for load test: 100 tenants, 200 items per tenant, 100 active concurrent read clients; adapt to observed business needs before provisioning hardware. Do not claim a fixed maximum capacity.
- Loading priority: show restaurant title, categories and first visible items promptly. Reserve image dimensions to avoid CLS.

## Data access
- Composite indexes per `03-DATA-MODEL.md` and actual SQL execution plans.
- `AsNoTracking()` for reads, tight DTO projection, avoid N+1 and careless `Include` chains.
- Query by tenant first for admin and active/public code first for public; enforce bounded inputs.
- Inspect `Query Store` or equivalent DB tooling with representative data; log slow queries with correlation IDs (not personal data).

## Cache correctness
- Cache only safe publicly published menu data, key by publicCode+locale+version, and invalidate on each product/category/branding change or use bounded TTL.
- Desired freshness: after successful edit and client refresh, reflect latest value; if CDN/proxy caching exists, implement explicit purge/versioning rather than claiming instantaneous change.
- No shared caching of private admin responses. Honor private/no-store where needed.

## Image optimization
- Max upload 5 MiB initially; decode/normalize on server; store small/medium variants; deliver modern supported format and fallback if needed; `srcset`/sizes, `loading=lazy` below fold, eager for true LCP image, width/height hints.
- Detect bandwidth/device dimensions; no decorative third-party fonts/scripts in critical rendering path.

## Test methodology and reporting
1. Select actual deployment tier/region and describe CPU/RAM, environment, DB tier, network location.
2. Seed documented synthetic data: 100 restaurants, 200 visible items each, media of representative sizes.
3. Benchmark public endpoint cold vs warm cache with k6 (or equivalent). Scenarios: smoke, 20 VUs, 100 VUs for 5 mins, with 1-2-minute warmup; report VUs, RPS, p50/p95/p99 latency, errors, CPU/memory/DB waits, response sizes. Same-host tests are insufficient; run from a separate client if possible.
4. Lighthouse on production build with documented throttling/device at least 3 runs, median; test Arabic and English and a large-menu tenant; include real-device spot tests.
5. Record before/after for performance changes. Do not add new architecture to 'fix' a nonexistent measured bottleneck.
6. If launch targets fail, attach profiling evidence, one optimization change and rerun. For real-world CWV, collect field p75 across sufficient traffic before claiming success.

## Architecture tradeoff (decision updated 2026-10-12)
SEO-first public menu REQUIRES server HTML. Use Angular hybrid SSR + hydration for public `/r/:slug`, static prerender for marketing and CSR for admin. SSR adds server compute and can harm TTFB if implemented badly, so measure cold/warm render and deploy SSR-capable hosting before coding. Do not replace with CSR only without explicit human approval. Angular guide: https://angular.dev/guide/hybrid-rendering

## Non-negotiable day-one measurements and budgets
- First vertical slice records `curl -L`/HTTP raw-response evidence with actual restaurant/item HTML, a `200`, and proper `<title>`, canonical, robots, structured data and `lang`. An empty JS application shell fails even if hydrated browser looks fine.
- Production build mobile Lighthouse baseline exists from the first implemented public page; target Performance >=90 on a documented representative test profile. Track actual LCP/CLS/JS/TBT per PR; lab INP cannot be equated to real field INP.
- Track server-render TTFB (cold and warm), API p50/p95/p99, SSR cache hit ratio, Node memory/CPU, SQL query count, images and transferred JS; provisional public document TTFB p75 <=800ms for real visitors, pending regional network baseline.
- Budget candidate: initial public route JavaScript transferred <=180 KiB gzip excluding images on representative sample; thresholds must be baselined with actual builds and CI assertions and updated only by reviewed evidence. Do not misrepresent a source compressed-size target as all-resource page weight.
- Cache public SSR HTML only by restaurant slug/ID + locale + published menu version with safe freshness/invalidation. Private admin/preview responses are never shared-cacheable. Hydration transfer cache may cache public GET data per response only; no `includeRequestsWithAuthHeaders` or unsafe user-specific transfer state.
- On first-load menu, actual product text is visible in HTML without JS; show meaningful public SSR content before optional client search/filters hydrate. No blocking tracking pixels, ads, remote font kits, or auto-playing media.
- Optimize images at upload into variants (AVIF/WebP where supported and reasonable fallback); send dimensions; use NgOptimizedImage and responsive sources, lazy load non-critical photos. Only LCP images are high priority.
- Add LHCI on production-built public fixture pages from the first meaningful UI PR: >=3 runs per locale/design variant, record median and variance; reserve strict regression gates for stable reproducible assertions and do not hide failures with relaxed thresholds.
- After real launch use RUM/field p75 for Core Web Vitals and Search Console real indexing, with consent/privacy review where analytics apply. Report NOT RUN where measurements impossible.
