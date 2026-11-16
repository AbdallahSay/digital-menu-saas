# 11 — API and data contracts: implementation planning map

Use [docs/04-API-CONTRACT.md](../04-API-CONTRACT.md) for exact payloads, response codes, authentication, RowVersion requirements and implemented feature notes. This file is an **index and gap map**, not a replacement for the API contract or evidence that each route is already implemented and reachable in production.

## Auth / role

| Route / operation | Role | Requirements | Status/notes |
|---|---|---|---|
| GET /api/v1/auth/csrf | Anonymous | FR-011/084 | F03 local/test implemented handshake |
| POST /api/v1/auth/login | Anonymous with CSRF | FR-011/013 | F03, 204 on success, generic 401 on failure |
| POST /api/v1/auth/logout | Authenticated + CSRF | FR-012 | F03 invalidates account sessions |
| GET /api/v1/auth/me | Authenticated | FR-001/011 | Safe role and active restaurant display info |
| POST /api/v1/auth/onboarding | Invitation-only | FR-014 | F04 limited delivery; no public registration |

## Platform and tenant management

| Operation | Actor | Requirements | Critical constraints |
|---|---|---|---|
| GET/POST /api/v1/platform/restaurants | PlatformAdmin | FR-002–005 | Paged search; atomic provision + owner; unique normalized email/slug |
| GET /api/v1/platform/restaurants/{id} | PlatformAdmin | FR-005 | Safe DTO, no credential |
| PATCH /api/v1/platform/restaurants/{id}/status | PlatformAdmin | FR-006/008 | Active/Suspended, 412 stale RowVersion |
| PATCH /api/v1/platform/restaurants/{id}/publication | PlatformAdmin | FR-007/008/036 | Platform privilege only, no owner equivalent approved |
| Owner account details/audit UI | PlatformAdmin | FR-008–010 | UI exists in Figma; verify concrete API contracts before coding |

## Owner catalog and media

| Route family / operation | Actor | Requirements | Notes |
|---|---|---|---|
| GET/PATCH /api/v1/admin/restaurant | TenantOwner | FR-030/032 | Existing contract; theme persistence D-01 |
| GET/POST /api/v1/admin/categories | TenantOwner | FR-020/021 | Scoped by server tenant |
| PUT/DELETE /api/v1/admin/categories/{id} | TenantOwner | FR-021–023 | 409 nonempty, RowVersion, soft-delete |
| GET/POST /api/v1/admin/items | TenantOwner | FR-024–026 | Own category FK, price validation |
| GET/PUT/DELETE /api/v1/admin/items/{id} | TenantOwner | FR-025–027 | Soft-delete, concurrency |
| POST /api/v1/admin/items/{id}/images | TenantOwner | FR-028/029 | Multipart, signature and authorization |
| DELETE /api/v1/admin/items/{id}/images/{imageId} | TenantOwner | FR-029 | Own item AND image |
| GET /api/v1/admin/qr | TenantOwner | FR-033 | Verify route/asset contract before UI wiring |

## Public REST and SSR URLs

| Route | Access | Requirements | Contract |
|---|---|---|---|
| GET /api/v1/public/menus/{publicCode}?lang=ar/en | Anonymous | FR-052–055 | Visible-only safe projection; F09 |
| GET /api/v1/public/restaurants/by-slug/{slug}?lang=ar/en | Anonymous | FR-050/052 | F09/S01 SSR read path, not private |
| GET /r/{slug} | Anonymous | FR-050/059 | Actual server HTML, 200 only for valid visible tenant |
| GET /m/{PublicCode} | Anonymous | FR-051/059 | One temporary 302 to current canonical |
| GET /robots.txt and /sitemap.xml | Anonymous | FR-060 | SEO S02 lifecycle; confirm actual implementation |
| GET / | Anonymous | FR-070 | Prerender marketing, not blank CSR |
| GET /r/demo (illustration) | Anonymous | FR-071 | Reserved demo collision D-06; never treated as real tenant |

## Data-to-requirement ownership

| Model | Invariants | FRs |
|---|---|---|
| Restaurant | Id, immutable PublicCode, unique Slug, Status, IsPublished, PublishedMenuVersion, RowVersion | FR-002, 006, 007, 050, 051, 083 |
| ApplicationUser + RestaurantUser | Active server membership and no multi-restaurant owner provisioning by existing-email linking | FR-001, 003, 011–014, 080 |
| RestaurantSettings | PrimaryColor, logo/cover keys, public contact flags, default locale | FR-030, 031 pending D-01 |
| Category | RestaurantId, NameAr required, optional NameEn, publication, order, IsDeleted | FR-020–023, 052 |
| MenuItem | Same-tenant CategoryId, Arabic text, optional English, decimal Price, availability, publish, soft-delete | FR-024–027, 052–055 |
| MenuItemImage | Tenant/item association, opaque object key, alt/locales and sort | FR-028/029, 058 |
| AuditEntry | Actor/resource/action/time/correlation; no secret metadata | FR-008, 085 |

## Schema/API changes that require human approval

- **Theme selection:** Do not add MenuThemeId to SQL or an owner PATCH without D-01, data migration and SSR propagation review.
- **Restaurant publication:** Current contract is privileged platform PATCH, even though Figma includes owner publish confirmations; D-02 required for changed role.
- **Historical slug redirects:** Proposed model only until reserved route/alias ADR D-06 approved; avoid 301 for immutable QR aliases.
- **Production media provider:** Local/test storage is not a durable-hosting decision; D-07 is required.
- **Rate limiting and SSR service identity:** D-04/D-05 review before changing F09 budgets or trusting proxy headers.

## UI screen-state to transport contract

| UX state | Trigger | Required behavior |
|---|---|---|
| Loading | Async request in flight | Disable duplicate submit; keep content stable |
| Saved/Published/Created | Only after successful committed response | Show accurate state, refresh version and navigate |
| Validation | 400 | Inline guidance; preserve fields |
| Conflict | 409 | No partial create, explain duplicate/nonempty |
| Stale | 412 | Refresh/reconcile with no lost write |
| Authentication | 401/403 | Safe login/denial; no private data |
| Unavailable | 404/410/noindex according to route contract | Never show hidden or suspended menu |
| Rate limited | 429 / documented Retry-After, or SSR-facing safe 503 mapping | Non-sensitive retry message; evaluate D-05 |
| Server failure | 5xx | Generic retry, correlation ID where safe, do not claim success |

## OpenAPI compatibility rule

Where backend API paths/DTOs differ from the intended screen or this planning map, **first inspect actual OpenAPI and source**. Amend the approved API contract and tests before changing behavior; never infer new endpoints from Figma names.

