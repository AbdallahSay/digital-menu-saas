# F09 — Public menu API (Issue #13)

Base `091d8d4a8b121935d353048b96048c0537bf0821`, verified unchanged before
delivery. Both required post-merge workflows succeeded before code changes:
[foundation](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38310926840)
and [SQL](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38310926855).
Followed Issue #13 handoff comment 6132976017. Branch `feat/F09-public-menu-api`;
backend-only increment, one Draft PR, human review before merge.

## Implemented API contract

- Anonymous GET `/api/v1/public/menus/{publicCode}?lang=ar|en` and
  `/api/v1/public/restaurants/by-slug/{slug}?lang=ar|en`. Both are included in F09.
  PublicCode is exactly 20 lowercase hex characters (F04 generated format),
  slug 1..100 lowercase ASCII letters/digits, single interior hyphens.
  Default Arabic; unsupported/empty locale or malformed identifier returns 400.
- Restaurant must be Active and published; categories published/non-deleted;
  items published/available/non-deleted with same-tenant published/non-deleted
  category. Categories and items each sort by SortOrder then SQL Id. Empty
  published categories and empty published menus return 200. Unknown, unpublished
  and suspended codes/slugs return indistinguishable generic 404, without names.
- DTO: `{ restaurant: { name, slug, primaryColor, currency: "EGP" }, language,
  publishedMenuVersion, categories: [{ id, name, items: [{ id, name, description,
  price }] }] }`. Category/item IDs are the existing allowed public DTO fields.
  Restaurant ID, owner/user/membership IDs, credentials, role/status/publish flags,
  rowversions, contact details, audit, private paths and keys are never returned.
  Version is a public freshness token; it does not select scope or grant access.
- English fallback is per field; whitespace/missing English uses Arabic.
  Missing descriptions become empty text. Restaurant Name uses existing single
  name field. Missing settings use default `#0F766E`. Text is plain JSON with
  normal safe serialization; future HTML/JSON-LD consumers must escape it.
- No images/logo/cover URLs or blobs are projected: F08 Production/Staging media
  storage/delivery remains deliberately unavailable (503). Do not fabricate URLs.
- At most 100 visible categories/1000 visible items; SQL takes limit+1 and returns
  generic 503 for excess, never a silently truncated menu. Missing SQL config and
  SQL deadlock contention also return generic 503. Public GET rate is 120/minute
  per remote IP, queue 0; 429 uses the existing ProblemDetails. Forwarded headers
  are not trusted/used to choose tenant or rate partition.
- All responses remain no-store with existing security headers. No shared cache,
  Redis, TTL, ETag or 304 behavior added. Every successful GET rereads current SQL,
  respecting F04–F08 version/state immediately on the next request. Future S03
  caching must key anonymous variants by tenant/locale/version and recheck status;
  no cache invalidation implementation is claimed when no cache exists.
- Public endpoints explicitly skip cookie authentication: cookie/Bearer/tenant/
  role headers cannot influence projection, invoke Identity queries or produce
  Set-Cookie. Protected endpoints retain authentication and CSRF. SSR clients must
  still avoid forwarding credentials or putting private state into HTML caches.
- Typed response/problem schemas are declared for OpenAPI. `/r`, `/m`, real SSR,
  sitemap/robots and JSON-LD remain S01/S02/S03/U04; no frontend/public-page changes.

This concrete contract supplements the existing illustrative docs/04 response
within the handoff's **backend/** scope. Existing optional/example image URLs
are intentionally omitted until verified production media delivery exists.

## Source and security review

Six files: `src/DigitalMenu.Api/Public/PublicMenus.cs`, API `Program.cs`,
`src/DigitalMenu.Application/PublicMenu.cs`,
`src/DigitalMenu.Infrastructure/Persistence/PublicMenuReader.cs`,
`tests/DigitalMenu.IntegrationTests/PublicMenuTests.cs`, this report.

Reader is a dedicated anonymous read-only boundary. It resolves a unique public
code/slug with explicit Active/published predicates, projects only allowed fields,
then freezes DbContext tenant scope from that server resolver. All subsequent
category/item queries have explicit RestaurantId predicates plus defense-in-depth
F05 filters. Item/category join uses both tenant and category ID. No Identity,
media, membership or audit table is queried, and no write/SaveChanges is exposed.
Owner endpoints still use ITenantDataSession; public handler only takes the
public reader interface. No mutable cross-request state or singleton data cache.

RepeatableRead transaction holds the restaurant/version row while building the
projection. Existing owner/platform writes update version in the same transaction,
so a response does not mix committed menu generations. Requests authorized/in
flight can finish just before a subsequent change; next GET rereads state.
Read/write lock contention can return safe 503 for deadlock; never add NOLOCK or
weaken tenant/publish checks to hide failures. No new index/schema/dependency.

## Actual verification

Windows .NET SDK 10.0.400/runtime 10.0.11, SQL Server LocalDB DigitalMenuF02;
fixtures create separate disposable databases. E-drive build/SQL/temp artifacts
avoid the documented F08 native-symbol disk pressure. No production data touched.

- Locked restore and Release build: exit 0, zero warnings/errors.
- Targeted F09: **8 passed** (7 SQL +1 missing-config test), 0 failed/skipped,
  exit 0 (32 seconds).
- Full backend: **90 passed =82 existing +8 F09**, 0 failed/skipped,
  exit 0 (50 seconds), including existing tenant/CSRF/media regressions.
- Format verification, EF migration consistency: exit 0, no pending model changes.
- Dependency vulnerability scan: exit 0, no vulnerable packages reported by current
  sources. No new dependency or lock changes; full native license/SBOM audit from
  F08 remains a release gate.
- Diff check: exit 0. TRX: `tests/DigitalMenu.IntegrationTests/TestResults/`
  `f09-targeted.trx`, `f09-full.trx` (ignored). CI links attached to Draft PR.

Matrix: code/slug equivalence, locale/default/per-field fallback, hidden/deleted
parent/item and unavailable item, empty menu/category, generic hidden/missing 404,
identifier/locale bounds, DTO/private-ID/key/PII exclusion, omitted F08 media,
expired cookie + forged Bearer/roles/tenant selectors with exactly three public
queries/no Set-Cookie, protected session still expired, capacity safety, A/B
parallel isolation, freshness after real F06/F07 owner mutations and F04
publication/status API changes, plus server-side branding change fixture.

## SQL/performance evidence and limits

Interceptor counts **3 SELECTs per successful menu**, including root/settings
projection, ordered categories and ordered joined items. AsNoTracking narrow
projections; no Include/N+1. Unknown/hidden lookup uses one SELECT; category cap
failure uses two. Test with 200 items still uses three.

Twenty concurrent A/B requests (A 200 items, B empty), local TestServer + LocalDB:
p50 **37.0ms**, p95 **45.8ms**, max **47.6ms**, zero errors; 63 SELECTs for warmup
plus 20 requests. Same-host small-fixture evidence, not production latency/CWV
or maximum capacity. Cold-start, realistic wide-text/100-tenant load, SQL execution
plans/Query Store and intended hosting profiling **NOT RUN**. Existing indexed
slug/code and tenant category/item constraints/indexes retained; no speculative
index, migration or cache added without plan evidence.

## Reproduce

```powershell
$env:TEMP='E:\Codex-F08-Artifacts\Temp'
$env:TMP=$env:TEMP
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:\Codex-F09-Artifacts\Sql'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode --artifacts-path E:/Codex-F09-Artifacts/build
dotnet build backend/DigitalMenu.slnx -c Release --no-restore --artifacts-path E:/Codex-F09-Artifacts/build -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --artifacts-path E:/Codex-F09-Artifacts/build --logger 'trx;LogFileName=f09-full.trx'
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
```

Scratch E paths optional with sufficient disk space; Encrypt=false only for the
dedicated disposable loopback test SQL instance. Do not configure production data.

## تسليم عربي

أُضيفت قراءة المنيو العامة بالكود والـslug، وتظهر البيانات المنشورة والمتاحة
فقط مع fallback عربي. لا تؤثر Cookie أو tenant headers على النتيجة. كل طلب
يقرأ SQL الحالي دون cache وبثلاثة SELECTs محدودة؛ الصور محذوفة من الإسقاط
حتى تُعالج حدود F08 الإنتاجية. نجح 90 اختبارًا؛ الأوامر أعلاه للتحقق محليًا.
التخزين/التعافي الإنتاجي وSSR الحقيقي والقياسات الإنتاجية ما زالت release
gates. PR Draft لمراجعة بشرية، دون دمج أو نشر.
