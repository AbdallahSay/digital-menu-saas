# L1b — Public images in the F09 DTO and public image delivery

Branch `claude/quirky-ritchie-k0zolk`, based on `8eb7c0a`. Backend + docs only;
the Angular public page does not render images yet (next increment). Human review
required before merge (schema change + public cache policy).

## What changed

- **DTO** (`DigitalMenu.Application/PublicMenu.cs`, `PublicMenuReader.cs`):
  `restaurant.themeKey`, `restaurant.logo`, `restaurant.cover`,
  `item.primaryImage`, `item.gallery`. Image object
  `{ url, width, height, thumbnailUrl, thumbnailWidth, thumbnailHeight, alt }`.
  Full contract: [API contract, L1b section](../docs/04-API-CONTRACT.md).
- **Delivery** (`DigitalMenu.Api/Public/PublicMenus.cs`, `PublicMediaResolver.cs`):
  anonymous GET/HEAD for `main|thumb` variants of item and branding images,
  re-authorizing public visibility per request, immutable cache headers + ETag/304.
- **Storage** (`IImageStorage.OpenReadAsync`): local adapter reads existing private
  bundles (`main.webp`, `thumbnail.webp`), rejects reparse points, refuses
  `delete.pending` bundles and non-canonical keys. Default/Production storage
  stays unavailable (503). No static-file mapping was added.
- **Schema** (`20261118192703_L1bPublicImagesAndTheme`, script `L1b-migration.sql`):
  additive only on `RestaurantSettings` — `ThemeKey varchar(16) NOT NULL DEFAULT 'teal'`
  with CHECK allowlist, and nullable `LogoWidth/LogoHeight/CoverWidth/CoverHeight`
  with paired-bounds CHECKs. No data rewrites, no drops; Down removes them.

## Security review

- Object keys never leave the server: item URLs use the image Id; branding URLs use
  a truncated SHA-256 of the key. Tests assert neither the full key nor its random
  segment appears in the menu body or ETag.
- Tenant scope comes only from public resolution (image row joined to its own
  item/category/restaurant with composite tenant joins; branding by `publicCode`),
  never from client IDs, headers or cookies. Cookie auth is skipped for these
  routes (`PublicMenuMetadata`); forged cookies/headers cause exactly 1 SQL query.
- Draft, unavailable, deleted item/category, unpublished/suspended restaurant,
  deleted image row, stale branding token, kind swap, foreign `publicCode`, unknown
  id and missing blob all return the same generic no-store 404.
- Canonical-key check (`{restaurantId:D}/{guid:N}.webp`) is enforced at read time
  in both the DTO and delivery, so legacy/foreign keys are never advertised or served.
- Found and fixed during testing: `NULL BETWEEN …` makes a CHECK evaluate to
  UNKNOWN (passes). Constraints now require explicit `IS NOT NULL`; covered by
  negative SQL tests.

## Performance impact

- Menu read: +1 bounded SELECT only when visible items exist (per-item top-8 via a
  correlated subquery, plus a global cap of 8×1000). Large-menu test: 4 queries for a
  200-item tenant, 3 for an empty one (74 total for 20 parallel A/B reads).
- Image request: 1 SELECT + a streamed file read; 304 revalidation still runs the
  SELECT (by design, so unpublishing takes effect at the origin).
- `Cache-Control: public, max-age=31536000, s-maxage=600, immutable`. **Decision
  for review:** the 10-minute shared-cache bound trades CDN hit rate for prompt
  unpublish. Browsers that already downloaded an image keep it.
- Not measured: production storage throughput, CDN behavior, image LCP/CWV
  (the SSR page renders no images yet).

## Evidence (executed in this session)

Environment: .NET SDK 10.0.404, SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022-latest`
disposable container, `localhost,1433`), Node SSR build from `frontend/` (`npm ci && npm run build`).

```
dotnet build DigitalMenu.slnx -c Release   -> 0 Warning(s), 0 Error(s)
dotnet test  DigitalMenu.slnx -c Release   -> Passed! Failed: 0, Passed: 100, Skipped: 0, Total: 100
```

Baseline before changes: 90 passed, 1 failed (SSR test, frontend not yet built).
The SSR suite's JS-disabled/hydration subtest needed the project-pinned Playwright
browser (`chromium_headless_shell-1248`); this container only had build 1243, so a
local, non-repository symlink to the preinstalled shell was used. The 3-run
Lighthouse gate in that suite passed.

New tests (`PublicMediaTests.cs`, 9): DTO shape/order/alt fallback/branding/theme and
key non-disclosure; per-item cap and omission of legacy/dimensionless branding;
200/304/HEAD with cache headers and strong ETag; full 404 visibility matrix and
400 input bounds; branding token rotation and cross-tenant code swap; forged
cookies/headers; 503 without storage; local adapter read/pending/symlink/traversal;
key/token helpers. Updated: `PublicMenuTests` (query counts, new forbidden terms),
`PersistenceTests` (migration list, theme/dimension CHECK rejections),
`MediaTests` (test storage implements `OpenReadAsync`).

## Reproduce locally

```bash
docker run -d --name dm-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='<local-only-password>' -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

```bash
cd frontend && npm ci && npm run build
```

```bash
cd backend && F02_SQL_CONNECTION='Server=localhost,1433;User ID=sa;Password=<local-only-password>;TrustServerCertificate=True;Encrypt=True' dotnet test DigitalMenu.slnx -c Release
```

## Not done / next steps

- Angular SSR rendering of images (`NgOptimizedImage`, width/height, `srcset` from
  `thumbnailWidth`/`width`, eager only for the LCP image) and frontend decoder
  allowlist for the new fields, with source-HTML and Lighthouse evidence (SEO gate).
- Owner branding upload/theme endpoints (write path for logo/cover/themeKey).
- Durable production storage + CDN purge (F08 follow-up / S03); rate-limit partition
  behind a trusted proxy (existing F09 follow-up).
