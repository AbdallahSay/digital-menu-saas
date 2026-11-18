# L1a — Restaurant settings API

Branch `claude/restaurant-settings-api-dxjb2m`, based on `main` at `8eb7c0a`.
Contract: [docs/04 L1a section](../docs/04-API-CONTRACT.md#l1a-implemented-restaurant-settings-contract).

## Changes and decisions

- `src/DigitalMenu.Api/Profile/RestaurantProfile.cs` (new): owner GET/PATCH
  `/api/v1/admin/restaurant`, POST/DELETE `/logo` and `/cover`. Allowlisted DTO,
  strict merge-patch parser (unknown/duplicate fields, wrong types, invalid UTF-16
  rejected before any mutation), server-derived scope, `ITenantDataSession` only.
- `Media/MediaEndpoints.cs`: the F08 multipart read + normalization step is
  extracted unchanged into `ReadNormalizedAsync` and reused; `Cleanup` shared.
- `Media/MediaProblemHandler.cs`: 413 title is now the generic `Request too large.`
  because it also covers oversized JSON PATCH bodies (no test/doc asserted the old text).
- `Program.cs`: maps the routes; `/api/v1/admin/restaurant` JSON body cap 32 KiB
  (same as items; 2000-char Arabic text with JSON escapes exceeds 8 KiB). Upload
  routes carry `MediaUploadMetadata`, so the existing CSRF-before-parse rule,
  5 MiB+64 KiB cap and concurrency limiter apply unchanged.
- Domain/configuration: `RestaurantSettings.ThemeKey` (`grill` default) plus
  `PublishPhone`/`PublishAddress` flag constants for the existing 0..3 column.
- Migration `AddRestaurantThemeKey` (additive only): `ADD ThemeKey nvarchar(16)
  NOT NULL DEFAULT 'grill'` and `CK_Settings_Theme`. No drop/rename/data rewrite.
  Review script: `backend/L1A-migration.sql` (idempotent, this migration only).
- `Tenancy/TenantDataSession.cs`: `PublishedMenuVersion` also increments, once
  per transaction, when a public-visible restaurant/settings value changes
  (rule in docs/04). Owner writes can no longer change `IsPublished` or decrease
  `PublishedMenuVersion`.
- Tests: `RestaurantProfileTests.cs` (6 new SQL tests); `PersistenceTests.cs`
  now expects two migrations and proves an existing settings row survives
  down/up of the new migration with `grill`, plus raw-SQL CHECK rejection.

Single client precondition: the settings row's rowversion. Every successful
change (including name-only, uploads and deletes) rewrites that row, so any
stale token is 412. The restaurant row's rowversion is not exposed because menu
edits bump it constantly and would cause spurious 412s.

## Security review

- Deny-by-default: `TenantOwner` group; anonymous → 401; suspended restaurant
  owner → 401 (existing F03/F05 cookie revalidation behaviour).
- Tenant scope only from validated membership. Forged `X-Restaurant-Id`,
  `X-Tenant-Id`, `?restaurantId=`, body `restaurantId`, another tenant's
  rowVersion and another tenant's CSRF token were all tested: B's row, version,
  storage and DTO are unchanged.
- Mass assignment: slug, publicCode, status, isPublished and object keys are not
  writable; attempts are 400. The data session independently rejects owner
  changes to Status/Slug/PublicCode/CreatedAtUtc/IsPublished and version rewinds.
- No private data in DTO: no IDs, keys, paths, timestamps or emails (asserted).
- Media: same F08 validation; server-generated immutable tenant-prefixed keys;
  filename ignored; SVG/MIME spoof rejected; replaced objects cleaned only
  after commit; ambiguous commit keeps the object.
- Text is stored as plain text; public rendering remains Angular-encoded.
  Phone is display-only (no `tel:` link is generated server-side).

## Performance impact

GET: 2 indexed PK reads + the existing tenant validation. PATCH: same plus one
Serializable commit (existing F05 path); no-op PATCH skips the transaction.
No new index (PK lookups only), cache, queue or dependency.

## Executed evidence

Linux container, SDK 10.0.400,
SQL Server 2022 Developer (16.0.4325) on loopback, disposable database per fixture.

- Targeted `RestaurantProfileTests` (6) + `PersistenceTests`: all passed, exit 0.
- Full backend Release suite: **97 passed, 0 failed, 0 skipped** (91 prior + 6 new),
  exit 0, 1.3 min. Includes F01–F09/S01 regressions and the real Angular SSR test
  (`npm ci && npm run build` first; 3 Lighthouse runs >=90 mobile gates passed).
- Locked restore and Release build: exit 0, 0 warnings / 0 errors.
- `dotnet format --verify-no-changes`: exit 0. EF: "No changes have been made to
  the model since the last migration." `git diff --check`: exit 0.
- NuGet vulnerable scan (incl. transitive): no vulnerable packages in all 5 projects.
- Diagnosed during the run and fixed: a lone-surrogate JSON escape (`"\uD800"`)
  made `JsonElement.GetString()` throw (500) → now 400. One test expectation was
  corrected to the existing contract (suspended owner = 401, as F06/F07).
- Environment notes: SQL Server 2022 installed in the container for this run;
  the frontend's pinned Playwright expected browser build 1248, so the container's
  preinstalled 1243 headless shell was symlinked to that path (no repo change).

## Reproduce

```bash
export F02_SQL_CONNECTION='Server=localhost,1433;User ID=sa;Password=<local-only>;Encrypt=false'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet test backend/DigitalMenu.slnx -c Release --filter "FullyQualifiedName~RestaurantProfileTests|FullyQualifiedName~PersistenceTests"
dotnet test backend/DigitalMenu.slnx -c Release
dotnet format backend/DigitalMenu.slnx --verify-no-changes
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
git diff --check
```

## Not in scope / risks

- Public projection (F09/S01) still exposes only name and primaryColor; logo,
  cover, theme, description and published contacts are not rendered publicly or
  served as public image URLs yet (needs public media delivery + SEO gate).
- Admin UI (U03) not built. Production object storage still unavailable (F08).
- Phone validation is intentionally permissive display formatting, not E.164.
