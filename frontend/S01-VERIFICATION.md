# S01 — real F09-backed canonical Angular SSR and permanent QR

## Preflight and approved scope

Started from exact main `18b555b07f18205d153b2f8a886a58404aba0ae5`, including M02/F09.
Both post-merge workflows succeeded before coding:
[Foundation](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38396763758),
[SQL](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38396763650).
Issue #17 still named Antigravity; the human explicitly authorized Codex execution
in this session. No ownership change was silently inferred.

The human also approved reserving `/r/demo` for the clearly labelled illustrative
fixture. F04 currently accepts that slug: a real restaurant whose QR resolves to
`demo` returns generic 503 rather than redirecting to fake content. Changing existing
records or provisioning validation is outside this PR. Resolve such a collision
before public use; `/m/demo-code` remains a separate illustrative alias.

## Implementation / contract

- Angular SSR `/r/:slug?lang=ar|en` consumes the actual F09 by-slug endpoint. Initial
  HTML includes restaurant, all returned ordered categories/items, descriptions,
  exact prices/currency, empty states and language links. Arabic default; backend
  English fallback preserved. Semantic H1/H2/H3/articles, RTL/LTR, M02 tokens/fonts,
  responsive widths; no invented media or ordering functionality.
- Express resolves F09 once, passes a fresh sanitized `REQUEST_CONTEXT` to Angular,
  and uses `RESPONSE_INIT` for 200/400/404/503. TransferState is document-local and
  keyed by slug/locale; hydration consumes it once, with zero duplicate public API
  requests. Reactive route data handles subsequent client navigation. No shared
  page/data cache, Redis or TTL; every new SSR/QR visit rechecks current SQL state.
- F09 wire DTOs match the backend. Display projection allowlists fields and adds
  `priceText`, preserving original decimal(18,2) JSON lexemes instead of formatting
  rounded JavaScript numbers. Test includes `9999999999999999.99`.
- `/m/:publicCode` reads actual F09 by-code, validates returned slug and issues one
  relative 302. Unknown/suspended/unpublished -> 404; malformed -> 400; temporary
  failure -> 503. A slug change preserves the code, changes the QR destination and
  makes the old slug 404 (historical 301 aliases are future S02 work).
- Generic noindex failures do not expose API errors, hidden names or configuration.
  GET/HEAD and gzip/identity preserve statuses. M02 may reject unsafe paths earlier
  with 404. Backend failures never become fake empty menus.
- Title, safe description, one H1, configured-origin canonical, lang/dir and robots
  are server rendered. Query-language variants share the canonical without query;
  no invented hreflang, ratings or business facts. Detailed live sitemap/JSON-LD
  intentionally remain S02; existing demo SEO remains intact.

## Trust boundary / security review

`PUBLIC_API_ORIGIN` and `PUBLIC_ORIGIN` are trusted environment configuration,
never Host/forwarded headers. Bare HTTPS origins, no credentials/path/query/hash;
HTTP is allowed only on loopback for local verification. The existing local-only
startup gate remains: no hosting/deployment or TLS bypass is introduced.

SSR and the local same-origin API adapter send only an Accept header to the
configured API. No incoming cookie, Authorization, tenant/restaurant/role header
is forwarded. No internal origin or credential enters HTML/transfer state. A/B
requests carry forged private headers; the SQL fixture bridge proves none reached
F09. Returned slug must match the requested slug; QR targets are constructed only
from a validated slug. Upstream redirects are disallowed. API deadline is 5s and
streamed body cap 16 MiB, sufficient for F09's bounded DTO even with JSON escaping;
100 categories/1000 items, lengths, GUIDs, currency/color and numeric shape checked.
Failure is generic 503, never truncation.

Tenant text uses Angular interpolation/DOM metadata APIs, never innerHTML. Tests
use `</script>`, `<script>` and an image onerror payload: literal text appears but
no tenant script/image executes. The only allowed executable inline script in
source assertions is Angular's exact pinned CSS-loader snippet. Public category/
item IDs are allowed by F09; restaurant/user IDs, private contacts/keys, credentials
and image URLs are excluded. No backend production handler/model/package changed.

`secure-assets.ts` is unchanged and remains before dynamic routing. No new static
fallback exists. All 59 original M02 regressions remain mandatory in Foundation,
including outside-root file/directory symlinks and post-start rename swaps.

## Real SQL -> API -> Node -> Angular tests

`PublicSsrTests` owns a unique migrated disposable SQL database through the existing
AuthFixture. Kestrel bridges the production Program/F09 TestServer to Node, without
fixture mutation HTTP endpoints. It launches the exact production SSR build and
executes `test-public-menu.mjs`: five Node tests include real source HTML, two locales,
ordering/filtering, malicious text, private-field exclusion, empty menu, GET/HEAD
encoding/status matrix, one-hop QR, 12 concurrent A/B renders, JS-disabled and
hydrated Playwright (four contexts), zero hydration API fetch, and three real-menu
Lighthouse runs. C# then changes slug/version directly in the disposable fixture,
checks fresh QR/old slug, unpublishes/suspends, injects malformed/slow API responses,
recovers, stops the bridge and checks GET/HEAD gzip/identity 503. The test asserts
one F09 call per render and no forwarded credentials.

Required Foundation now runs that fixture with pinned disposable SQL and also
runs the unchanged source-HTML, browser, 59 security and demo Lighthouse gates.
The SQL workflow builds the same frontend/browser before the full backend suite.
Both workflows retain thresholds, pinned action/image versions and masked ephemeral
SQL credentials. Frontend dependencies/lockfile and production backend are unchanged.

## Actual local results (Windows, Node 24.19.0, SDK 10.0.400, SQL Server LocalDB)

- `npm ci`, lint, production build: exit 0; one prerendered marketing route.
- Angular unit tests: 8 passed; design tests: 8 passed, exit 0.
- Locked .NET restore / Release build: exit 0; zero warnings/errors.
- Full SQL regression on final code: 91 passed, 0 failed/skipped, exit 0 (70s).
  Includes 90 prior tests plus the full real SQL/SSR/browser/performance scenario.
- Format verification, EF pending-model check and git diff check: exit 0;
  no pending model changes. NuGet scan: no vulnerable packages reported; npm audit:
  zero vulnerabilities. No new package or migration.
- Real-menu Lighthouse final full-suite sample: performance 97/81/93, **median 93**
  against unchanged >=90 gate; accessibility/SEO 100 in each run. LCP 2243.5/2201/
  2160ms; CLS <=0.00048. Prior isolated targeted sample 97/98/98. Variance is reported,
  not hidden or used to change thresholds. Same-host lab, not production/field CWV.
- First live render 407.0ms, warm 28.0ms; 12 parallel A/B requests p50 125.1ms,
  p95 193.5ms, zero errors. Small synthetic menus and a TestServer transport bridge,
  not regional hosting or a 100-tenant capacity benchmark. Initial HTML evidence is
  `.lighthouseci/s01-a-ar.source.html` and `s01-a-en.source.html` (ignored/artifact).
- Aggregate browser JS gzip: 114887 bytes < unchanged 184320-byte budget.
- Local M02 symlink gate NOT RUN on this Windows account (known file-symlink EPERM).
  Required Linux Foundation executes all 59 on the final pushed SHA. Final CI links
  and results are recorded in the Draft PR, rather than inferred from local tests.

Diagnosed initial checks without weakening assertions: local readiness originally
hit the legacy fixed API port, so the adapter now shares the validated configured
origin; the source checker initially rejected Angular's legitimate CSS-loader script,
now precisely allowlisted; Lighthouse's single-output filename was corrected by
using its existing dual JSON/HTML output convention. All failed attempts remain
superseded by executed passing checks; no fake data fallback was added.

## Reproduce

```powershell
cd frontend
npm ci
npm run lint
npm test -- --watch=false
npm run test:design
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH='E:/Codex-M02-Artifacts/browsers'
npx playwright install chromium
cd ..
$env:TEMP='E:/Codex-F08-Artifacts/Temp'; $env:TMP=$env:TEMP
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:/Codex-S01-Artifacts/Sql'
$env:S01_FRONTEND_DIRECTORY=Join-Path (Get-Location) 'frontend'
$env:PLAYWRIGHT_BROWSERS_PATH='E:/Codex-M02-Artifacts/browsers' # use your installed location
$env:CHROME_PATH=node -e "console.log(require('./frontend/node_modules/@playwright/test').chromium.executablePath())"
dotnet restore backend/DigitalMenu.slnx --locked-mode --artifacts-path E:/Codex-S01-Artifacts/build
dotnet build backend/DigitalMenu.slnx -c Release --no-restore --artifacts-path E:/Codex-S01-Artifacts/build -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --artifacts-path E:/Codex-S01-Artifacts/build --logger 'trx;LogFileName=s01-full.trx'
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet tool restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
npm --prefix frontend audit --audit-level=high
```

Run the unchanged Foundation source/browser/security/demo Lighthouse tests on Linux
through `S01_FRONTEND_GATES=1` and the filtered PublicSsrTests test (ports 4000/5080
must be free). Normal SQL tests use dedicated dynamic loopback ports and tear down
only their own processes/disposable database. TRX lives under the integration test
project's ignored TestResults. CI retains HTML/Lighthouse/TRX artifacts.

## Remaining gates

S02: live sitemap/robots lifecycle, detailed/verified structured data and historical
slug aliases. S03: responsive production media and measured cache/invalidation strategy.
U04: full public search/category UX. F08 Production/Staging storage/delivery is still
unavailable; no image URL added. Production SSR-capable hosting, distributed limits,
large-menu/regional benchmarks, native SBOM/release review and field CWV remain.
Canonical configuration/NG_ALLOWED_HOSTS and reserved-demo collision handling need
review before any real public use. This PR is not production readiness or deployment.

تسليم: أصبح المنيو الحقيقي ظاهرًا في HTML الأول من F09/SQL، مع عزل المطاعم وحالات
HTTP صحيحة وQR دائم يتبع slug الحالي. نجح 91 اختبار SQL وظهرت الأسعار الدقيقة دون
صور وهمية؛ تبقى بوابات S02/S03/U04 وF08 والمراجعة البشرية قبل أي دمج أو نشر.
