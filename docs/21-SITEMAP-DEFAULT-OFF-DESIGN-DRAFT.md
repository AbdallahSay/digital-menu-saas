# Sitemap and robots: default-off design (DRAFT, unreleased)
Status: design only. No code in this document is enabled. No indexing or release permission is implied. Opt-in control and canonical origin are owner decisions and stay unset.

## Current facts (tip 1197fc1)
- Backend: GET /public/.../sitemap?page=N (SitemapReader; IsIndexable column, default off; bounded paging; no-store; 400 on bad page; 429; 503 on failure). Tested by 5 SitemapTests.
- SSR (frontend/src/server.ts): `/sitemap.xml` is hardcoded to one /r/demo URL and `/robots.txt` ALWAYS advertises `Sitemap: <publicOrigin>/sitemap.xml`. So today robots points crawlers at a stub regardless of any opt-in. That is the main default-off gap.
- No setter or authorization exists for IsIndexable.

## Proposed default-off behaviour (needs owner input before enabling)
1. Config: SITEMAP_ENABLED (default false) and SITEMAP_ORIGIN (no default; the canonical origin is an owner input). Enabled with no valid https origin: treat as disabled and log once.
2. Disabled: /sitemap.xml returns 404 (no body claiming URLs); /robots.txt keeps the Disallow lines and OMITS the Sitemap line.
3. Enabled: SSR fetches backend pages (bounded, timeout, no cookies/Authorization/Host forwarded, same as publicPage), emits <loc> built only from SITEMAP_ORIGIN plus the encoded public slug, never from request Host. Backend failure gives 503, not an empty urlset. Over the page cap gives a sitemap index or truncation per the reader's documented cap.
4. Tests (when built): disabled default 404 and robots without Sitemap line; enabled-without-origin stays disabled; forged Host/X-Forwarded-Host does not change <loc>; backend 503 propagates; no demo URL unless the tenant is indexable. All local, synthetic data only.
5. Not covered: IsIndexable setter and its authorization (role and policy owner decisions), per-tenant consent wording, search-engine submission.

## Owner decisions needed before enabling
Opt-in control (who may mark a menu indexable, and where), canonical origin per environment, whether the demo menu is ever listed.
