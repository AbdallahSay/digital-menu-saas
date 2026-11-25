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
- Trusted proxies: the API processes `X-Forwarded-For` only when `Proxy:TrustedProxies` (array config, e.g. `Proxy__TrustedProxies__0=127.0.0.1` or `::1` for a same-host Node SSR router) lists at least one valid IP; with an empty list the forwarded-headers middleware is never registered and rate limiting partitions on the direct connection IP, so a direct caller cannot rotate the header to evade the auth limiter. Malformed entries fail startup loudly; there is no implicit loopback trust. The Node `/api` router always overwrites `X-Forwarded-For` with its socket peer and never copies a client-supplied value — so another proxy in front of Node collapses per-client buckets again unless that hop is given its own trusted-hop design. The API processes XFF only (not proto/host), so .NET still needs real HTTPS on its upstream hop.
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

## Reproducible browser for SSR tests

The SSR/Playwright tests need Playwright's own headless shell. Do not symlink a system Chrome.

    cd frontend && npx playwright install chromium   # add --with-deps on a fresh Linux image

Last verified locally: @playwright/test 1.64.0, Chrome Headless Shell 156.0.8078.4
(playwright chromium-headless-shell v1248), Node 24.19.0. Record the versions again when
either changes. 
Status: partly verified. With this headless shell and no symlink, PublicSsrTests ran five times on the
2 GB host: 2 full passes, 3 failures, all in the three-run Lighthouse check (a 503 load, NO_FCP, and a
'performance' score under 90). The other checks passed every time. System Google Chrome 157 passed
earlier. Lighthouse performance scores here are load-sensitive (SQL runs on the same host), so this
check is flaky on this host and not a stable gate. Treat a green run as evidence, not proof.

## Data Protection keys (operational requirement)

Outside Development the API refuses to start unless both `DataProtection__ApplicationName` (must differ per deployment, for example staging versus production, so key rings stay isolated) and `DataProtection__KeysPath` (an explicit, absolute, dedicated directory) are set. The keys sign auth cookies, antiforgery tokens and one-time identity tokens (owner setup links), so losing them signs out every owner and voids unused links. In Development without a path the framework default applies. Development now uses an explicit application name, so existing dev cookies and tokens issued before this change stop validating once, even with the same key directory.

Checked in code (Linux/macOS): the path must be absolute and not a filesystem root, its parent must already exist, it must not be a symlink or reparse point, and after symlink resolution it must not contain or sit inside the application, content or media directories. A missing directory is created with mode 0700. An existing directory must have no group or other permission bits (owner bits are not required to be exactly rwx, so this is not an exact 0700 check) and must be owned by the service account (checked through `stat` and `id` found on PATH; ownership mismatch is not covered by a test). An existing directory is never chmod'ed.

Not solved, so these are open acceptance items, not done:
- Check-then-create-then-use race: the directory is validated, created and used in separate steps with no owner, mode or link revalidation after creation, so a writer in a writable parent could win the creation. Use only a trusted, stable, dedicated parent that other accounts cannot write to. Not acceptable for shared or hostile parents.
- The `stat` and `id` helpers resolve from PATH and read output before the 5 second wait, so the timeout does not bound a stalled read.
- Shared or multi-instance readability, durable volume and backup of the key directory.
- Windows: ACLs are not validated, so Windows is refused outside Development until a verified ACL or protected-store policy exists on the real target host. Tests that set a production key path will fail at startup on Windows before their intended assertion, so they cannot be accepted as cross-platform as written.
- Keys are plaintext XML at rest. No key encryption is configured; confidentiality relies on filesystem permissions and host isolation. Decide on a protected key store or encryption before real use.
- Rotation is automatic (90 days); keep old keys. TLS termination and request/response log redaction are still open.
