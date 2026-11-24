# Tenant sitemap: opt-in design (DRAFT, not implemented)

Status: design only. Today `frontend/src/server.ts` serves a static `sitemap.xml` with one URL, the demo fixture `/r/demo`. It is not tenant-aware and the demo fixture should not be indexed in production.

## Principles
- No tenant is listed unless the restaurant owner opted in. Existing restaurants stay unlisted after deploy (default off).
- Only published, active tenants can be listed. Suspending or unpublishing removes the URL at once.
- The public listing exposes slug and last-modified only. No names, owner data or counts.
- The listing endpoint is bounded (page size cap, total cap per file; sitemap index above 50,000 URLs) and rate limited.
- The demo fixture is excluded from production output by an explicit environment flag, not by name matching.

## Proposed pieces
1. Column `Restaurants.IsIndexable bit NOT NULL DEFAULT 0` (migration, default false for all existing rows).
2. Owner setting (admin settings page): "Allow search engines to list my menu", off by default, with a plain-language note. Changing it uses the existing rowVersion concurrency and bumps the menu version.
3. Public read `GET /api/v1/public/sitemap?page=N` returning slugs of rows where `IsIndexable AND IsPublished AND Status = 'Active'`, ordered by slug, fixed page size. Identity-free path (public projection rules apply).
4. SSR `/sitemap.xml` builds from that endpoint, with `lastmod` from the menu version timestamp; on API failure it returns 503, never a stale or partial file presented as complete.
5. `robots.txt` keeps `Disallow: /admin` and `/api/`; the tenant page emits `noindex` when `IsIndexable` is false.
6. Tests: default-off for migrated rows, only opted-in published active tenants listed, suspended/unpublished removed, tenant isolation (no cross-tenant leakage), pagination bounds, 503 on API failure, demo excluded.

## Open decisions for the owner
- Whether tenants may opt in themselves, or the platform admin controls it.
- Canonical public origin per environment.
