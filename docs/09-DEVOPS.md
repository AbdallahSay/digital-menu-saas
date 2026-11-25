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

Checked in code (Linux/macOS): the path must be absolute and not a filesystem root, its parent must already exist, it must not be a symlink or reparse point, and after symlink resolution it must not contain or sit inside the application, content or media directories. A missing directory is created with mode 0700. An existing directory must have no group or other permission bits (owner bits are not required to be exactly rwx, so this is not an exact 0700 check) and must be owned by the service account (checked with `stat` and `id` run by absolute path; ownership mismatch is not covered by a test). An existing directory is never chmod'ed.

Not solved, so these are open acceptance items, not done:
- Check-then-create-then-use race is narrowed, not closed: after a missing directory is created it is validated again (link or reparse point, group/other bits, owner) and startup fails closed on a mismatch, but a writer in a writable parent can still act between that check and the later use of the directory. Use only a trusted, stable, dedicated parent that other accounts cannot write to. Not acceptable for shared or hostile parents.
- The owner check runs `stat` and `id` by absolute path only (`/usr/bin` or `/bin`), fails closed if none exists, kills the helper and its process tree on a 5 second timeout (and says so if the kill fails), and bounds the wait for its output after exit. That output wait only bounds the call; it does not stop or clean up a descendant that keeps the pipe open. Helper output is read fully into memory before its length is checked, which is acceptable only for the trusted system executables.
- Shared or multi-instance readability, durable volume and backup of the key directory.
- Windows: ACLs are not validated, so Windows is refused outside Development until a verified ACL or protected-store policy exists on the real target host. Tests that need a non-Development key path are marked as Skipped on Windows (never passed), and explicit policy tests assert the Windows refusal. None of this has been executed on Windows.
- Keys are plaintext XML at rest. No key encryption is configured; confidentiality relies on filesystem permissions and host isolation. Decide on a protected key store or encryption before real use.
- Rotation is automatic (90 days); keep old keys. TLS termination and request/response log redaction are still open.

## Media storage (production)

Images are files, not SQL rows. In Development the local adapter is on. Elsewhere set `Media__AllowLocalDisk=true` and `Media__LocalRoot` to an absolute, persistent, private directory outside the application directory, or media endpoints answer 503. Setting the flag is an operator assertion that the code does not verify: the volume survives redeploys, only the service account can read or write it (file and directory permissions are NOT checked or set by the application; set them as an operator requirement), and it is backed up together with the database (restoring one without the other leaves broken images). When the media storage adapter is first instantiated (the first resolution of the storage service, not necessarily at application startup, and not eagerly validated) the root must be absolute and must not equal, contain or sit inside the content root, the application directory or the Data Protection key directory (existing components are resolved through symlinks). The adapter rejects symlink/reparse paths in existing ancestors before creating the root and again after; this narrows, but does not close, the window for another writer to swap a path component, validates server-generated keys only, never overwrites, and serves images only through authenticated or public-menu endpoints; uploads are re-encoded by the image normalizer. Not verified for any real host: disk quota, backup, Windows ACLs, multi-instance sharing (a single instance only).

Media cleanup (local adapter). Deleting an image first records durable deletion intent: an empty file named `<tenantId>_<imageId>` under `<root>/.cleanup-pending` plus `delete.pending` inside the bundle. A bundle with either, or with an entry under `<root>/.cleanup-stuck`, is hidden from readers until its directory is gone. A background worker (`MediaCleanupWorker`, in process, no external alerts) sweeps only `.cleanup-pending`: once when the host starts (catch-up after a restart) and then every `Media__CleanupIntervalSeconds` (default 300, 5 to 3600). Each pass is serial, cancelable and bounded (500 entries, 5 seconds); entries that failed recently are skipped, so one failing bundle does not hold back the others. No interval or completion time is promised under backlog or downtime, and a pending bundle is not cleaned while the process is not running. The sweep deletes only `main.webp`, `thumbnail.webp`, `reservation`, `delete.pending` and then the empty directory. If a bundle contains anything else (unknown file, a directory or a link under a known name) nothing in it is deleted: its entry moves to `.cleanup-stuck`, it stays hidden, and a count-only warning is logged. Operator action: list `<root>/.cleanup-stuck` (names are opaque ids), inspect the bundle, remove the unknown content yourself; the worker retries stuck entries at most once per 24 hours (at host start and every 24 hours). Limits: single instance only, no cross-process locking, bundles marked by earlier code without an index entry are hidden but never swept, the resume order is the file system enumeration order, the worker resolves the storage service when the host starts, and none of this was run against a real host or Windows.
