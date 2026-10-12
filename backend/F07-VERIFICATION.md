# F07 — Menu Item Management APIs (Issue #11)

Base `989d45d`: F06 PR #37 merged, with ancestor `713aac3` verified before
creating `feat/F07-items-api`. F06 merge was explicitly authorized by the user.
F07 is Draft delivery only; peer review required before merge.

## Implementation and files

- `src/DigitalMenu.Api/Catalog/Items.cs`: GET list/detail, POST, PUT and soft
  DELETE; explicit request/response DTOs, bilingual validation and rowversion.
- `src/DigitalMenu.Api/Program.cs`: route registration and bounded 32 KiB item
  request bodies (maximum escaped bilingual descriptions exceed the previous
  8 KiB bound). Other existing routes keep their limits.
- `src/DigitalMenu.Application/TenantAccess.cs`: bounded item projection method.
- `src/DigitalMenu.Infrastructure/Tenancy/TenantDataSession.cs`: tenant-scoped
  SQL sort/pagination/search/category filtering; extends atomic menu version
  increments to item writes as well as F06 categories, once per transaction.
- `tests/DigitalMenu.IntegrationTests/ItemTests.cs`: eleven real SQL tests.
- `../docs/04-API-CONTRACT.md`: exact F07 fields/status/limits and semantics.
- This report. No schema, dependency, frontend, upload, deployment changes.

Arabic name required, English optional; names 150, descriptions 2000. Plain
text, optional blanks become null, descriptions allow newline/tab. Explicit
sort, publish and availability. Required price 0..9999999999999999.99 with at
most two significant decimal places, no rounding; currency exactly EGP.
Unpublished owned categories are valid; foreign/missing/deleted categories
are generic 404, including filters. List includes drafts/unavailable items,
excludes soft deletion; stable SortOrder/Id SQL order before Skip/Take.
DELETE takes JSON rowVersion and retains media for future F08 lifecycle.

## Security review

TenantOwner + validated named Identity cookie + server membership scope;
mutations retain identity-bound CSRF, HTTPS, no-store/security headers.
Handlers use only ITenantDataSession/ITenantContext, no privileged DbContext,
raw SQL or client-selected tenant. Create IDs are generated server-side.
Unknown role/ID/tenant/server/media fields fail 400. Foreign/missing/deleted
items return the same generic 404; stale own rowversion returns 412.
Response is an explicit 12-field allowlist, without tenant/user IDs, private
contacts, timestamps, storage keys or exception detail. CategoryId is an owned
admin association, not public information. Text must be escaped by renderers.

F05 commit revalidates identity and membership in Serializable SQL transaction,
checks canonical ownership and live non-deleted category, and persists the
item, restaurant version/timestamp and existing redacted audit atomically.
SQL composite FK, tenant/object-key immutability and rowversion remain intact.
F06 linked-active-item 409 remains intact. Failed requests never bump version
or commit a success audit. Account suspension between stage/commit rolls back.

## Verification

Windows, .NET SDK 10.0.400/runtime 10.0.11, actual SQL Server LocalDB
DigitalMenuF02, individually disposable fixture databases; no production data.

- Targeted SQL: 11 passed, 0 failed/skipped, exit 0 (18 seconds).
- Locked restore and Release build: exit 0, zero warnings/errors.
- EF migration consistency: exit 0, no pending model changes.
- NuGet vulnerability scan: exit 0; no vulnerable packages reported across
  the five projects using current sources. No packages/locks changed.
- Full SQL regression: 68 passed (57 previous + 11 F07), 0 failed/skipped,
  exit 0 (23 seconds). Format verification and diff check: exit 0.
- TRX: `tests/DigitalMenu.IntegrationTests/TestResults/f07-targeted.trx` and
  `f07-full.trx` (generated, ignored). CI evidence is linked in the Draft PR.

Coverage: CRUD/location GET/DTO allowlist, Arabic/English search and literal
wildcard characters, category moves/filtering, ordering/pagination/bounds,
zero/max/negative/overflow/precision/null prices, currency/text/flag validation,
publish/availability toggles, soft delete, category deletion conflict and
release after item deletion, foreign/missing resources/parents, deleted parent,
unknown fields on every mutation, header/query scope spoofing, anonymous,
platform-only, suspended/inactive accounts, missing/forged/identity-stale CSRF,
stale client PUT/DELETE, concurrent SQL update rollback, parent deletion after
stage, mid-write revocation, menu-version/audit atomicity and independent B.
All F01–F06 tests remain in the full regression suite.

## Performance and limitations

Twenty concurrent bounded A/B item GETs: 105.2ms total, zero errors, local
TestServer + LocalDB tiny fixture. Not a production p95/capacity claim.
List is projected/no-tracking and capped at 100; lookup uses existing owned
session lookup. Literal substring search can scan tenant rows; realistic query
plans/load profiling remain required. Offset pagination is not a snapshot and
has no total count. No speculative index, Redis, cache or service added.
Conservative version increments include draft/identical changes; same-tenant
writes can contend on restaurant rowversion and return 412/409, requiring
reload/retry. F09/S03 must consume version for public cache freshness; no cache
purge is claimed. Real public visibility/SEO belongs to F09/S01; public routes
unchanged. Production load/CWV, full release license audit and storage lifecycle:
NOT RUN. Human review required before F07 merge; no F08 uploads implemented.

## Reproduction

```powershell
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
sqllocaldb start DigitalMenuF02
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger 'trx;LogFileName=f07-full.trx'
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
git diff --check
```

Encrypt=false is only for dedicated disposable loopback SQL tests.

## تسليم عربي

أُضيفت إدارة العناصر: قراءة وبحث وتصنيف وإنشاء وتعديل وحذف منطقي، مع النصوص
العربية والإنجليزية والسعر والنشر والتوفر. tenant scope من الخادم وCSRF
وrowversion يمنعون التعديل غير المصرح وضياع البيانات. تُحفظ نسخة المنيو
وaudit مع التغيير في transaction واحدة. للتحقق شغّل الأوامر أعلاه على
LocalDB؛ راجع DTOs وDELETE body والتزامن قبل دمج Draft PR.
