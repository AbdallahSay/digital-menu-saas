# P03 — Owner tools API: dashboard, publish, reorder, QR, reserved slugs

> ملخص: الـAPIs اللي لوحة المالك محتاجاها: ملخص الرئيسية، نشر وإخفاء المنيو، إعادة ترتيب الأقسام والأطباق، وتحميل QR.

Depends on: P01 · Decisions: D8 · Size: medium

## Scope
1. `GET /api/v1/admin/summary`: counts of categories/items (published, draft, unavailable), items without
   photo, publication state, public URL, last update. Matches Figma OWNER-DASHBOARD (82:925).
2. Owner publication: `PATCH /api/v1/admin/restaurant/publication { isPublished, rowVersion }` with a
   pre-publish check payload (`GET .../publication/preflight`: published categories/items counts,
   unavailable count, blocking problems such as zero published items). Suspended restaurants cannot publish.
   Audit RestaurantPublished/Unpublished with actor = owner.
3. Bulk reorder: `PUT /api/v1/admin/categories/order` and `PUT /api/v1/admin/categories/{id}/items/order`
   with `[{ id, rowVersion }]` in the new order; all-or-nothing transaction; foreign IDs -> 404; stale -> 412.
4. QR: `GET /api/v1/admin/qr?format=svg|png&size=` returns a QR for `https://<PUBLIC_ORIGIN>/m/{publicCode}`
   generated server-side with a vetted, pinned library (justify the dependency). PNG sizes bounded;
   `Content-Disposition: attachment; filename="menu-qr-<slug>.<ext>"`. Origin from trusted config only.
5. Reserved slugs registry (docs/19 P-SLUG): `demo, admin, platform, api, m, r, media, assets, sitemap,
   robots, login, www` plus normalization; provisioning (and later rename) rejects them with 409/400.

## Acceptance criteria
- A/B isolation tests for every endpoint; reorder cannot move another tenant's rows.
- Publishing bumps PublishedMenuVersion and is reflected by F09 immediately.
- QR decodes (test with a decoder library in tests) to exactly the configured `/m/{publicCode}` URL.
- Provisioning `demo` now fails; existing data untouched (no migration of legacy rows).

## Docs to update
`docs/04-API-CONTRACT.md`, `docs/11-ADR-AND-RISKS.md` (accept P-SLUG for the registry part).

## Out of scope
Slug rename + history redirects (P11), UI (P06/P08).
