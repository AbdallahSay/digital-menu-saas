# P12 — Performance and SSR trust boundary (S03 + P-SSR)

> ملخص: المنيو تستحمل ضغط الإعلانات: كل الزوار مش هيتحسبوا كأنهم شخص واحد، والصفحات بتتخزن مؤقتًا بأمان.

Depends on: P10 · Decisions: D1 · Size: large

## Context
All SSR traffic reaches F09 from one IP, so visitors share the anonymous 120 req/min bucket and get 503
after a spike (docs/18 risk register). No SSR/page caching exists.

## Scope
1. Implement the preferred direction of docs/19 P-SSR suitable for decision D1: authenticated
   SSR->API service identity (e.g. short-lived signed service token or mTLS on the private network),
   separate bounded service budget + SQL concurrency cap, ingress per-client limits stay for direct API
   clients. Forwarded headers trusted only from configured proxies. Fail closed when service auth is absent.
2. Tenant-aware SSR HTML micro-cache keyed by slug + lang + PublishedMenuVersion (in-process LRU, bounded
   memory, no Redis), never caching non-200 or private responses; `Cache-Control` for HTML and images.
3. Measure: SSR TTFB p50/p95, Node memory, F09 query plans with a 100-category/1000-item fixture.

## Acceptance criteria
- Load test (k6 or autocannon, pinned) with >= 150 distinct simulated visitors/minute through a trusted
  proxy fixture: no 429/503 at agreed capacity; a single abusive client still gets 429.
- Forged `X-Forwarded-For` / internal markers are ignored; direct calls without service identity get the public budget.
- Edits appear on the public menu immediately after save (cache key changes).
