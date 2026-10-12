# F01 foundation: local only

Approved scope: Issue #5 / F01, requested by the human on 2026-10-12.
The explicit request allows reversible development SSR while production
hosting remains unresolved. P0 production host approval is not asserted.

## What exists

- API -> Application/Infrastructure -> Domain project references, .NET 10.0.400
  SDK and ASP.NET OpenAPI/Mvc.Testing 10.0.11, NuGet lock files.
- Angular/CLI/SSR 22.2.2, Node 24.19.0, TypeScript 6.0.3 and exact npm
  dependencies with package-lock.json. Versions were selected from npm's
  published stable dist tags; Angular's package requires Node ^24.15.0.
  Compatibility reference: https://angular.dev/reference/versions.
- /r/demo: hydrated SSR, immutable fake Arabic restaurant/category/product,
  unique title/description/H1, fixed localhost canonical and Restaurant JSON-LD.
- /: marketing prerender. /admin: CSR placeholder, HTTP noindex and no-store;
  contains no private data or functional authentication. No CRUD or orders.
- /m/demo-code: direct local 302 to /r/demo. Missing routes/code/slugs: real 404,
  noindex, no fixture content. Static fixture sitemap includes only /r/demo.
- Development-only Node router binds 127.0.0.1:4000, forwards /api to fixed
  127.0.0.1:5080, drops auth/cookies and ignores client Host for canonical/proxy.
  Angular's SSR host allowlist accepts localhost and 127.0.0.1 only.
  Missing API produces generic 502; no-store disables shared page caching.
- API health and development OpenAPI; deny-by-default fallback authorization,
  predictable ProblemDetails. No users, credentials, database or migrations.

## Reproduce (PowerShell, repository root)

Install .NET SDK 10.0.400 and Node 24.19.0. Stop the API before rebuilding on
Windows, since a running DLL locks the output file.

```powershell
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet test backend/DigitalMenu.slnx -c Release --no-build
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
cd frontend
npm ci
npm audit --audit-level=high
npm run lint
npm test -- --watch=false
$env:NG_BUILD_MAX_WORKERS='1'
npm run build
```

Start two separate terminals from repository root:

```powershell
# Terminal 1 (local API; no database required)
$env:ASPNETCORE_ENVIRONMENT='Development'
dotnet backend/src/DigitalMenu.Api/bin/Release/net10.0/DigitalMenu.Api.dll --urls http://127.0.0.1:5080
# Terminal 2 (production-optimized build, local-only runtime)
cd frontend
$env:F01_LOCAL_ONLY='1'
node dist/digital-menu/server/server.mjs
```

Third terminal from frontend:

```powershell
npm run test:html
# Use an installed Chrome, or npx playwright install chromium and use its executable.
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
npm run test:lighthouse
curl.exe -i http://localhost:4000/r/demo
curl.exe -I http://localhost:4000/m/demo-code
curl.exe -i http://localhost:4000/r/missing
```

Ctrl+C stops the local services. Nothing deploys. Canonical/domain/proxy settings
are deliberately fixed to loopback; do not reuse this harness in production.
If C: lacks space, point TEMP, TMP, npm_config_cache and NUGET_PACKAGES at a
task-local folder on a drive with space. No unrelated files need deletion.
For low memory builds, NG_BUILD_MAX_WORKERS=1 and
NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=8' were used locally.

## CI and security review

foundation.yml uses pinned Actions, read-only permissions, locked restores,
build/format/unit/API tests, npm advisory gate, raw HTML/status/QR/sitemap tests,
mobile Chromium with JavaScript on/off, gzip budget and three mobile Lighthouse
runs. Artifacts include all Lighthouse JSON/HTML, source HTML and service logs.
Lint currently means Prettier formatting; Angular compilation performs strict
TypeScript/template checks, not a separate ESLint ruleset.

Lighthouse CI is implemented using the pinned maintained Lighthouse CLI and a
small deterministic runner, rather than @lhci/cli 0.15.1, whose dependency graph
reported 11 high advisories on this date. The runner preserves three full reports
and gates median Performance, Accessibility and SEO >=90. This tooling choice
does not remove any audit gate. npm audit subsequently reports no vulnerabilities.
Angular/Express/RxJS are runtime requirements; Playwright/Vitest/jsdom/Prettier
are test tools; Lighthouse is development-only. Generated production third-party
license notices are preserved by Angular's build.

Reviewed boundaries: no incoming credentials forwarded to SSR/API, no user
content/remote fetch, encoded Angular fixture bindings, JSON-LD escapes <,
no Host-derived redirects/canonical, no shared mutable tenant/request state,
no private/admin data serialized. Secure cookie settings only prepare rejection
behavior; full Identity/CSRF/proxy/CSP/HTTPS enforcement belongs to later tasks.
Anonymous missing API routes are denied with 401; unknown document routes are
404. The local proxy does not support authenticated or unsafe admin workflows.

## Evidence and limits

Local environment: Windows 11 x64, .NET SDK 10.0.400/runtime 10.0.11,
Node 24.19.0/npm 11.17.0, installed Chrome, localhost, fake one-item Arabic menu.
Final command results and Lighthouse metrics are in frontend/evidence/.
Production JS budget is measured by gzip-compressing every emitted browser JS
file (including lazy admin), not falsely reported as total page transfer.

Early failures were diagnosed: C: disk exhaustion (caches/temp moved to E:),
parallel Angular memory exhaustion (single worker), SSR host rejection (explicit
loopback allowlist), CRLF format (formatter applied), and Windows DLL output lock
(test API stopped before rebuilding). No failing test or threshold was disabled.

NOT RUN: production deployment/hosting, regional/cold-start/network capacity,
SQL tenant isolation, two actual tenant projections, cache edit invalidation,
real English UI/locale, Search Console and field CWV. These require later tasks.
Parallel fixture/missing requests test request isolation only, not F05/F09 tenant
authorization. There is no cache or edit surface to invalidate. Simulated
localhost Lighthouse results do not certify launch performance or field INP.

## شرح عربي

SSR بيخلي اسم المطعم والمنتج موجودين في استجابة HTML بدون JavaScript، وhydration
بتضيف تفاعل المتصفح بعد التحميل. صفحة التسويق بتتولد وقت البناء، والإدارة CSR
ومؤقتة بدون بيانات خاصة. شغّل الـ API وNode محليًا ثم أوامر الاختبار وcurl فوق.
SSR بيحتاج عملية Node وذاكرة ومراقبة بجانب .NET؛ الاستضافة والمنطقة والتكلفة
وزمن الاستجابة في الإنتاج لسه قرارات مفتوحة ولا يوجد نشر في F01.
