# Day-One Automated SEO & Performance Gates

This is the rulebook for BOTH Codex and Antigravity. Run tests on production-mode builds with stable seeded fixtures. Do not claim a gate passed before actually executing it.

## Milestone F01 — must exist with the first meaningful public route
1. `.NET API` builds and Angular **SSR server build** runs; verify Node SSR-capable development/staging runtime. A static-only host plan is BLOCKED pending architecture approval.
2. `GET /r/demo` returns HTTP 200 and raw response source has meaningful H1, category/item text, restaurant-specific title/meta description, absolute canonical, `lang` and `dir`; no JavaScript execution required.
3. `GET /m/demo-code` returns 302 directly to canonical route; unknown slug returns actual 404; admin/private pages inaccessible to strangers, noindex meta/header where rendered.
4. Install/pin Lighthouse CI and configure stable production-build seeded pages; run >=3 mobile simulation runs and preserve HTML+JSON reports and observed scores. CI uses build artifacts and runs servers before testing (not static Angular fallback).
5. Track Angular bundle/resource budgets, first SSR cold+warm TTFB/API timings with exact device/region/environment caveats. No performance adjective without evidence.

## Example assertions to implement (technology-neutral)
- HTTP raw `status == 200` for public, `<title>` non-empty/unique, `<meta name=description>` present, `<link rel=canonical href='https://trusted-origin/r/demo'>` present, one H1, visible names of at least 1 public category and item; page does not require JS.
- `GET /r/missing` => 404, not a generic SPA 200. `/m/demo-code` => 302 then exactly one redirect to `/r/demo`. Targets must stay within allowed host.
- JSON-LD parses, `@type == Restaurant`, real name, published public menu URL; escaped malicious strings cannot break document/script tags.
- Anonymous public route never references admin IDs, tokens, private emails or draft products. Tenant A and B SSR served in parallel produce no mixed metadata, item names, cache content.
- Sitemap XML parse passes; `loc` links canonical and published only; `lastmod` only for meaningful changes, never a per-request timestamp. robots.txt parses and links sitemap.
- Changing product price & visibility invalidates public API and rendered cached HTML; browser refresh sees new data.
- Angular hydration avoids duplicate fetching where HttpTransferCache applies, and never includes authenticated/private requests in serialized public HTML.

## Performance budgets to collect and review (provisional)
| Metric | Goal | Source | Notes |
|---|---:|---|---|
| LCP mobile p75 | <=2.5s | Real User Monitoring | Field goal; lab proxy until traffic |
| INP mobile p75 | <=200ms | RUM | Interaction-based, cannot be certified by Lighthouse alone |
| CLS mobile p75 | <=0.1 | RUM | Avoid unloaded images/fonts |
| Lighthouse mobile Performance | >=90 | LHCI production build | Repeat >=3, record median and variance |
| Initial public JS (compressed) | <=180 KiB | Build/trace | Review threshold after F01 baseline |
| Public API warm p95 | <=300ms | k6 | Defined load, not general production SLA |
| Public document TTFB p75 | <=800ms | Field/RUM | Influenced by real user region/connection |
| Server response + hydration | No double private/public fetch | Trace | Per request, isolate cache |

These are **engineering targets**, not measured facts or release promises. Review with recorded baselines. Track API p50/p95/p99, page weight, images, script evaluation, Node CPU/memory, cache hit ratio, cold/warm SSR and error rate.

## PR acceptance policy
- New/changed public route: raw-HTML SEO assertions and Lighthouse CI smoke REQUIRED.
- SEO metadata, route, restaurant publication status or cache change: sitemap/canonical/status tests REQUIRED.
- UI images/fonts/JS: inspect resource sizes, prioritization, dimensions, lazyloading, and mobile metrics before merge.
- Backend tenant-scoped menu changes: SQL negative tenant tests and SSR parallel A/B cache leakage tests REQUIRED.
- Every PR report includes command, environment, observed result/exit code, failed tests, evidence file/link, benchmark comparisons, NOT RUN (if blocked) and reviewer sign-off. Never disable test gates just to merge.

## Evidence for real launch
- Staging on production-like hosting; Playwright Arabic/English mobile plus JS-disabled view, actual smartphone QR scan, Lighthouse production measurement, real HTTP status and structured data checks, no high/critical security findings, backup restore proof.
- After going live: Search Console indexing observations, real user CWV, outages/errors and price-update freshness monitoring.

## References
- https://web.dev/articles/vitals
- https://github.com/GoogleChrome/lighthouse-ci
- https://angular.dev/guide/image-optimization
- https://angular.dev/guide/hydration
- https://angular.dev/best-practices/performance/ssr
