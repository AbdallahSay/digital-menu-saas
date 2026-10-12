# Environments / Deployment / Operations

## Environments
- Local: .NET SDK 10, supported Node/Angular versions, SQL Server dev via local instance or Docker, local development media provider. No real passwords in repo.
- CI: restore/build/format/lint/tests (unit + integration with SQL Server), dependency audit, secrets scan, optionally browser smoke and lint/OpenAPI checks. Create migrations only intentionally; never auto-apply destructive migrations to prod from CI.
- Staging: same major runtime/storage architecture as production; seeded synthetic data only; smoke/cross-tenant/e2e/benchmarks; deployment approval for sensitive changes.
- Production: HTTPS, least-privileged SQL/media account, DB backups/restoration plan, request logging, health endpoints, domain+QR stability, alerting and rollback.

## Hosting baseline — SEO-first (replaces static-only assumption)
Use an **SSR-capable Node runtime for Angular public routes** and .NET API under one externally visible HTTPS origin through a reverse proxy/router. `/r/*` is SSR, marketing is prerendered, `/admin/*` and `/platform/*` are CSR; `/api/*` maps to .NET; `/m/{publicCode}` is a stable one-hop 302 redirect to canonical `/r/{slug}`. Host must support the pinned Node version and process lifecycle (or managed SSR deploy), TLS, proxy timeouts, good Egypt-region latency, reliable databases/images, and cache invalidation. Purely static hosting for Angular public pages is **not an acceptable SEO-first architecture**. Do not assume the user's existing ASP.NET-only host can run Node SSR; prove it before approval. If impossible, present Razor-rendered public menu alternative for explicit human decision; do not silently degrade to CSR.


## Security / configuration
- `.env.example` or documented placeholder config; app secrets via managed secrets/environment; explicit Production env. Strict trusted proxy headers, HSTS, cookies, CSP and no wildcard credentialed CORS.
- Platform admin bootstrap must use secret provided out-of-band and force rotation. Avoid seeded fixed password in repository.
- Service account least privilege. No public database connection strings.

## Release runbook
1. Review PR, dependency scans, migrations, breaking changes; backup DB and verify restore procedures.
2. Deploy to staging; apply migrations intentionally, with rollback plan.
3. Run API health/tenant isolation/smoke tests; printed QR and mobile deep-link test.
4. Run performance benchmark and inspect errors in logs/metrics.
5. Human approval before production deploy; deploy and monitor; verify menu after edit and cache behavior.
6. Roll back app if issues; DB rollback may require forward-fix/migration safety strategy.

## Operational alerts
Unexpected 5xx increases, authentication abuse/rate limiting anomalies, DB connection exhaustion, media storage failures, slow public requests, backup failure. Report incident correlation IDs without user secrets.

## Evidence requirements
CI job URL or local commands with captured exit codes; before/after DB migration summary; host requirements; staging screenshots; load result with test environment; restore evidence; production smoke after authorization. If not executed mark NOT RUN.

## Build-time SEO and Lighthouse gates
- F01 proves sample SSR HTML and initial render timings on a production-mode local/staging runtime with fake published data.
- Public-page PRs: automated HTML semantic assertions (title, meta, canonical, H1, item text, correct non-200 statuses), sitemap inclusion checks, JSON-LD parsing and structured-data lint, noindex test, localhost/host-header injection checks.
- CI: build Angular SSR/server bundle and .NET API; boot both behind test router; run Playwright public route with JavaScript ON and OFF plus a raw HTTP test; save LHCI performance/SEO artifacts and compare budgets. No hiding failure by marking it optional after implementation exists.
- Staging: inspect actual rendered page via `curl` and Google Rich Results Test/URL Inspection (once publicly accessible); submit sitemap to Search Console only after release/domain ownership. Search indexing is external and never guaranteed.
- Monitoring: separate public p75 LCP/INP/CLS RUM, SSR TTFB and error rate, Node memory/cold starts, origin/edge cache hit ratio, slow SQL queries. Alert on regressions; do not publish metrics without real collection.
