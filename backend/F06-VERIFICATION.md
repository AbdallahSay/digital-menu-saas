# F06 — Category Management APIs (Issue #10)

Base: latest `origin/main` at `249ff35` (F05 merge, PR #36).
Branch: `feat/F06-category-api`. Draft delivery; human peer review before merge.

## Behavior and files

- `src/DigitalMenu.Api/Catalog/Categories.cs`: four HTTP operations, explicit
  DTO allowlists, bilingual names, validation, visibility and rowversion.
- `src/DigitalMenu.Api/Program.cs`: route registration; extends the existing
  HTTPS and 8192-byte request-body protection to admin routes.
- `src/DigitalMenu.Application/TenantAccess.cs`: bounded category projection API.
- `src/DigitalMenu.Infrastructure/Tenancy/TenantDataSession.cs`: SQL sorting and
  offset pagination, transactional linked-item deletion guard and menu version.
- `tests/DigitalMenu.IntegrationTests/CategoryTests.cs`: eight real SQL Server
  tests, with HTTP cookies/CSRF and direct session race assertions.
- `tests/DigitalMenu.IntegrationTests/TenantSecurityTests.cs`: existing fixture
  made internal for reuse; existing F05 tests retained.
- `../docs/04-API-CONTRACT.md`: exact request/response/status and version rules.
- This report.

No migrations, packages, lock changes, F07 endpoints, frontend or deployment.
Arabic name required, English optional, both max 120 without control characters;
sort nonnegative; tied sort values ordered by SQL Id. List includes drafts but
excludes deleted categories. DELETE takes an eight-byte base64 rowversion in JSON.
Any non-deleted linked item blocks deletion with 409, including hidden/unavailable
items. Every accepted category mutation increments menu version conservatively;
even draft/identical PUTs increment it. Cache consumers are future F09/S03 work.

## Executed verification

Windows, .NET SDK 10.0.400/runtime 10.0.11, SQL Server LocalDB `DigitalMenuF02`.
Every fixture creates its own randomly named disposable test database, applies
existing migrations and cleans up only that database. No production connection.

- Locked restore: exit 0.
- Release build: exit 0, zero warnings/errors.
- Targeted F06 SQL tests: 8 passed, 0 failed, 0 skipped, exit 0 (10 seconds).
- Final full SQL regression: 55 passed (47 existing + 8 F06), 0 failed,
  0 skipped, exit 0 (33 seconds).
- `dotnet format --verify-no-changes --no-restore`: exit 0.
- EF migration consistency: exit 0, no pending model changes.
- NuGet vulnerability scan: exit 0, no vulnerable packages reported by current
  sources across all five projects. No new dependency; full release license
  audit NOT RUN.
- `git diff --check`: exit 0.
- TRX: `tests/DigitalMenu.IntegrationTests/TestResults/f06-targeted.trx` and
  `f06-full.trx` (generated/ignored, not committed).

An intermediate full run had 54 passes and one setup failure: repeated auth
handshakes exceeded F03's unchanged 10/minute limiter. The test now checks expiry
using the existing B session, avoiding unnecessary logins. No limiter/test disabled.

## Security review and test coverage

All routes require TenantOwner; authenticated identity and scope come from the
named Identity cookie and live SQL membership. No privileged DbContext injected
in catalog handlers; only ITenantDataSession and ITenantContext. Existing F05
Serializable reauthorization, explicit tenant predicates, canonical ownership,
query filters, composite SQL FKs/triggers and atomic audit remain intact.

HTTP coverage: anonymous denial for all methods; PlatformAdmin has no implicit
owner access; A/B independent lists; foreign/missing PUT and DELETE use identical
404 title/status; forged create IDs/tenant/roles/server fields rejected with 400;
header/query spoofing cannot select B; absent/forged/identity-stale CSRF rejected
on each mutation; suspended restaurant, inactive membership, locked account and
expired session denied. Existing 47 tests preserve F03/F04/F05 adversarial coverage.

Business coverage: CRUD, normalized bilingual names, validation and bounds,
sort/pagination, publishing, soft deletion, linked active and deleted items,
stale client PUT/DELETE, concurrent SQL update rollback, item arriving after edit
but before commit, atomic own version/audit and unchanged B version.
Errors use existing generic ProblemDetails; no foreign names, credentials, SQL
or private metadata returned. Text stays inert JSON; rendering must escape it.

## Performance and remaining gates

Projected AsNoTracking list, SQL ordering before Skip/Take, maximum 100 rows.
Twenty concurrent bounded GETs across A/B completed in 110.0ms total with zero
errors in the targeted local TestServer + LocalDB smoke. Tiny fixture/same host:
not a production latency or capacity claim. Category commits add one restaurant
load/update; deletes add an indexed linked-item existence check under Serializable.
Same-tenant mutations can contend on restaurant rowversion and return 412/409;
clients must reload/retry. No cache/index/service added without measurement.

Public routes/SSR unchanged; SEO, RTL UI and Lighthouse gates are not applicable
to this private backend increment. Production CWV/load and real cache freshness:
NOT RUN. F09/S03 must key caches by PublishedMenuVersion; no existing public cache
is claimed to be purged. DELETE JSON body support must be retained in admin client.
Peer review and realistic load profiling remain required before launch.

## Reproduce locally

```powershell
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
sqllocaldb start DigitalMenuF02
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger 'trx;LogFileName=f06-full.trx'
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
git diff --check
```

Encrypt=false is restricted to the disposable local SQL test instance.

## تسليم عربي

أُضيفت APIs التصنيفات لإنشاء وتعديل وترتيب ونشر وحذف تصنيفات المطعم الحالي.
الحذف منطقي ويُرفض عند وجود عناصر غير محذوفة، مع rowversion لمنع ضياع
التعديلات. تُحفظ نسخة المنيو وaudit والتغيير داخل transaction واحدة حتى لا
تنجح كتابة جزئية أو تتغير بيانات مطعم آخر. للتحقق شغّل الأوامر أعلاه على
LocalDB الاختباري؛ راجع DTOs وDELETE body والعزل قبل دمج Draft PR.
