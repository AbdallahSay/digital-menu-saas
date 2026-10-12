# REST API Contract v1 — Draft to finalize before coding

## F03 implemented authentication contract (local/test delivery)

- Named `PlatformAdmin` and `Owner` policies require authentication and the
  corresponding server-generated role claim. Owner claims are derived from active
  memberships, not client input or a stale Identity Owner role. These policies do
  not select a restaurant or authorize tenant resources (F05).

- HTTPS-only `/api/v1/auth/*`. JSON login `{ "email": "...", "password": "..." }`
  returns 204 on success, 400 for invalid input/CSRF, 401 with generic
  `Invalid credentials.` for unknown/wrong/locked/ineligible accounts, 409 if
  already signed in, 503 if `ConnectionStrings:MenuDatabase` is unset.
- GET `/api/v1/auth/csrf` is anonymous and sets an HttpOnly secure antiforgery
  cookie plus readable Secure `XSRF-TOKEN`. Send its decoded value in
  `X-XSRF-TOKEN` on every unsafe API request, including login. Fetch a fresh
  token after login because tokens are identity-bound.
- POST `/api/v1/auth/logout` requires authentication and CSRF, returns 204 and
  revokes **all sessions** for that account via SecurityStamp. GET cannot log out.
- GET `/api/v1/auth/me` requires authentication and returns only
  `{ role: "PlatformAdmin" | "Owner", restaurants: [{ name: "..." }] }` for the
  authenticated user's active memberships in active restaurants (maximum 10).
  No client RestaurantId selects scope; CRUD tenant authorization remains F05.
- The session cookie is `__Host-DigitalMenu.Session`, Secure, HttpOnly,
  SameSite=Strict, Path=/, no Domain, browser-session persistence, with a fixed
  30-minute server ticket lifetime. Responses are no-store. All auth routes
  share a per-remote-IP limit of 10 requests/minute, queue 0; rejection is 429
  ProblemDetails. Five bad passwords lock an account for 15 minutes.
- Unsupported MFA-enabled accounts fail closed; no MFA completion route is
  provided. No public registration or general password reset. F04 adds the
  invitation-only onboarding endpoint and privileged provisioning described below.
- Full decisions, bootstrap restrictions, exact verification commands and
  release blockers: [F03 verification](../backend/F03-VERIFICATION.md).

F01 implements only anonymous GET /api/health/live and /api/health/ready (200
plain text Healthy, no dependency details), and Development-only
/api/openapi/v1.json. Readiness equals liveness until dependencies exist.
All other API paths challenge anonymous requests with 401 ProblemDetails.
There are no menu, admin, login, mutation or persistence endpoints in F01.
The Angular demo is an immutable fake public fixture, not the F09 projection.

**API base** `/api/v1`. JSON. ISO 8601 UTC timestamps. A consistent ProblemDetails error response for failures with traceId; don't leak entity existence across tenant boundaries. REST operations must be server-side authorized even if UI hides action. All mutating admin endpoints require CSRF defense when using cookies. Server responses must set restrictive caching for authenticated views.

## Authentication / profile
- `POST /api/v1/auth/login` — Identity cookie session on valid credentials; generic errors otherwise; strict rate limiting and lockout policy.
- `POST /api/v1/auth/logout` — invalidate session.
- `GET /api/v1/auth/me` — platform/owner role and safe authorized restaurant display info.
- `GET /api/v1/auth/csrf` — if chosen antiforgery handshake demands it, provides frontend-safe token metadata; implement according to official .NET/Angular integration. Never expose cookie authentication secret.

## Platform endpoints (PlatformAdmin only)
- `GET /api/v1/platform/restaurants?page=&pageSize=&search=` — paged owner-neutral view.
- `POST /api/v1/platform/restaurants` — create restaurant & owner invite/onboarding; safe provisioning (atomic as appropriate).
- `GET /api/v1/platform/restaurants/{id}` — details.
- `PATCH /api/v1/platform/restaurants/{id}/status` — suspend/reactivate, audit change.
- `PATCH /api/v1/platform/restaurants/{id}/publication` — publish/unpublish, audit change.

### F04 implemented contract (local/test only)

All five endpoints require the existing `PlatformAdmin` policy and HTTPS, return
`Cache-Control: no-store`, and apply the F03 CSRF handshake to every mutation.
Only the server assigns ownership. Unknown JSON properties (including `role`,
`PublicCode`, or a client password in provisioning) are rejected with 400.

- POST body: `{ "name": "مطعم مثال", "slug": "example", "ownerEmail": "owner@example.test" }`.
  Name is trimmed, required, max 150, without control characters. Slug is trimmed
  and lowercased, max 100, ASCII lowercase letters/digits with single interior
  hyphens. Email is trimmed, validated, max 256. Existing email accounts are
  rejected rather than linked or granted privileges. 201 returns a Location and
  the restaurant DTO. Slug, email, generated PublicCode collisions and SQL deadlock
  contention return 409; retry requires a fresh request. This is duplicate-safe,
  not an idempotency-key API.
- Response DTO: `id`, `name`, `slug`, `publicCode`, `status`, `isPublished`,
  `publishedMenuVersion`, `rowVersion` (base64 SQL rowversion). No owner ID/email,
  credentials or invitation token. New restaurants are Active and unpublished;
  settings default to Arabic and `#0F766E`; membership is active Owner.
- GET list defaults to page 1 / pageSize 20; bounds page 1..100000, pageSize 1..100,
  search max 150. Search is a literal substring over name/slug using SQL collation.
  Stable ordering is CreatedAtUtc then Id. Response: `page`, `pageSize`, `total`,
  `items` (restaurant DTOs). Pagination is offset-based, not a snapshot.
- GET details returns the same DTO; unknown Guid returns 404 ProblemDetails.
- Status PATCH: `{ "status": "Active" | "Suspended", "rowVersion": "..." }`.
  Publication PATCH: `{ "isPublished": true | false, "rowVersion": "..." }`.
  Both require the last-read 8-byte base64 rowversion; invalid input is 400, stale
  version/concurrent writes 412, success 200 with the current DTO. Identical state
  is a no-op after version validation. State changes atomically persist an audit,
  increment PublishedMenuVersion and update UpdatedAtUtc. Suspension preserves
  the publication choice. Public visibility must require both Active and published
  in F09. Reactivation does not activate memberships or unlock accounts.
- Audits: RestaurantProvisioned, RestaurantSuspended, RestaurantReactivated,
  RestaurantPublished, RestaurantUnpublished. Only actor/resource IDs, action,
  UTC timestamp and safe correlation ID are persisted, never email/password/token.

Provisioning creates a passwordless Identity account, restaurant, membership,
settings and audit in one serializable SQL transaction. A 20-character PublicCode
uses 80 bits of cryptographic randomness and existing immutable/unique F02
constraints. No schema migration is needed. Delivery failure rolls all writes back.

`IOwnerOnboardingDelivery` defaults to an unavailable adapter. Development can
explicitly enable `DevelopmentOnboarding:Enabled=true` to deliver committed
invitations over a private OS-user pipe; no HTTP retrieval endpoint exists.
Production/Staging never register this pipe, even when the flag is true, and
Production provisioning remains blocked. The pipe releases an invitation only
after transaction commit, drops aborted staging, bounds pending invitations to
16, and validates the Identity token before delivery. Tokens remain in memory/
private IPC, never files, API responses, application logs or audits. Windows ACL
allows only the actual current user SID and explicitly denies network logons;
Unix uses CurrentUserOnly peer-credential checks. The local consumer performs the
existing anonymous CSRF + HTTPS onboarding/login flow, without certificate bypass.
This is non-durable development tooling, not real email or a production outbox.
Setup, actual HTTPS end-to-end evidence and restart/disconnect limitations:
[local onboarding guide](../backend/F04-LOCAL-ONBOARDING.md). Production still
needs reviewed delivery/outbox, retry/expiry/resend and Data Protection key management.

Current business rule: an existing normalized owner email cannot provision a
second restaurant, including a pending or inactive owner. F04 always creates a
new Identity account and rejects existing email accounts with 409 rather than
linking them. This rule is unchanged and requires human approval to change.

POST `/api/v1/auth/onboarding` is anonymous, invitation-only and HTTPS + CSRF
protected, sharing the F03 auth rate limiter. Body: `userId`, `token`, `password`.
UserId must be a nonempty Guid, token max 4096, password max 256 and must satisfy
the existing Identity password policy. The token expires after one hour. Only
passwordless, unlocked, non-MFA, non-platform accounts with active ownership in
an Active restaurant can complete it. Success 204 sets a hashed password and
rotates the security stamp; replay/concurrent reuse, expired/forged tokens and
invalid credentials return 400. An authenticated caller must sign out first (409).
It never signs in, creates accounts, changes roles or reactivates membership.
Obtain a fresh anonymous CSRF token, complete onboarding, then use normal login.

F03 session validation already rechecks current account/membership/restaurant
state on every authenticated request. A suspended owner loses the current session;
reactivation requires a fresh login and still requires active membership and an
unlocked account. F05 will authorize individual tenant resources; none are added here.

Verification and production dependencies: [F04 report](../backend/F04-VERIFICATION.md).

## Owner endpoints (server-derived restaurant scope, no arbitrary tenant input)

### F05 authorization infrastructure (no catalog/media HTTP endpoints yet)

F05 adds `ITenantContext`, `ITenantDataSession`, the `TenantOwner` policy and
`TenantRestaurantRequirement`. It does not implement the F06/F07/F08 endpoints
below or introduce a test-only route. F03 `Owner` remains a global role eligibility
policy; owner feature groups must require **TenantOwner** and use the tenant data
session for every resource operation. RestaurantId authorization alone is not a
replacement for the scoped resource lookup.

Tenant scope comes only from the named Identity cookie authentication result
(signature/security-stamp validation), a current eligible account, exactly one
active Owner membership, and an Active restaurant. Two active memberships are
ambiguous even if one restaurant is suspended. Zero, inactive, locked,
passwordless, MFA-enabled or expired/revoked identities fail closed. PlatformAdmin
has no implicit owner-scope bypass. Headers/query/body/role or tenant claims never
select the tenant. No owner tenant-selector endpoint or mutable scope setter exists.

The data session offers bounded (1..100) projected reads, owned tracked lookup,
explicit rowversion lookup, staged writes and commit; no raw IQueryable, DbContext
or bulk SQL is exposed. Each operation resolves current scope. The session is
request-scoped and cannot switch user/restaurant after binding. Before commit it
revalidates user/stamp/membership/status inside the same Serializable SQL
transaction as the writes. Key/tenant changes, detached foreign IDs, foreign
CategoryId/MenuItemId and non-canonical/foreign media keys are rejected; only
Restaurant/Category/MenuItem/MenuItemImage/RestaurantSettings are allowed. Owners
cannot provision/delete restaurants or change Status/Slug/PublicCode/CreatedAtUtc
through this boundary. Image ObjectKey remains immutable, including detached edits.

Generic error mapping via TenantBoundaryException: missing authentication 401;
invalid/ambiguous scope 403; foreign/missing resources/associations 404 with the same
`Resource not found.` title; stale rowversion 412; SQL deadlock contention 409;
invalid bounded read/constraint input 400. An invalidated F03 cookie can be rejected
with 401 before tenant resolution. Error responses are no-store ProblemDetails,
without tenant/resource IDs, membership counts, SQL, exception detail or secrets.
Filtered lists return an empty result for foreign predicates; detail/mutation
lookups reject with 404. Denied batches clear pending changes and cannot commit
earlier tracked edits accidentally. Successful writes and audit are atomic.

This is authorization/persistence infrastructure, not field-validation/business
CRUD. F06/F07/F08 must still implement DTO allowlists, validation, pagination/sort,
soft deletion, category deletion conflict, public-version invalidation, and storage
validation. Use the explicit expected-rowversion lookup for client PATCH/PUT
preconditions (versioned entities); internal snapshot concurrency alone does not
detect a stale client payload. Media namespace validation does not prove that a
blob exists or has valid content; F08 must verify storage metadata/ownership and
both nested route IDs before file operations. Full future HTTP matrix and current
executed SQL evidence: [F05 verification](../backend/F05-VERIFICATION.md).

- `GET /api/v1/admin/restaurant` / `PATCH /api/v1/admin/restaurant` — details/branding/basic contact.
- `GET /api/v1/admin/categories` / `POST /api/v1/admin/categories`.
- `PUT /api/v1/admin/categories/{id}` / `DELETE /api/v1/admin/categories/{id}` — deletion conflict if linked active items.
- `GET /api/v1/admin/items?page=&pageSize=&categoryId=&search=` / `POST /api/v1/admin/items`.
- `GET /api/v1/admin/items/{id}` / `PUT /api/v1/admin/items/{id}` / `DELETE /api/v1/admin/items/{id}` — soft delete.
- `POST /api/v1/admin/items/{id}/images` — multipart with image validation and bounded size.
- `DELETE /api/v1/admin/items/{id}/images/{imageId}` — verify both item/image belong to active owner tenant.
- `GET /api/v1/admin/qr` — returns public URL and optional QR asset reference; QR downloadable without exposing internal credentials.

### F06 implemented category contract

All `/api/v1/admin/categories` operations require `TenantOwner`, the validated
Identity cookie and HTTPS; mutations require identity-bound `X-XSRF-TOKEN`.
Responses are no-store. The handlers use only `ITenantDataSession` and
server-resolved `ITenantContext`, never privileged persistence.

- GET accepts `page` (default 1, 1..100000) and `pageSize` (default 20, 1..100).
  Response: `{ page, pageSize, items: [...] }`. Only own non-deleted categories
  appear, including drafts. SQL ordering is `SortOrder`, then `Id`, before
  pagination. Offset pagination is not a snapshot; no total count is returned.
- POST requires `{ nameAr, nameEn?, sortOrder, isPublished }`. Arabic is required,
  trimmed, nonblank, max 120 characters. English is optional, trimmed, max 120;
  blank becomes null (public English fallback remains Arabic). Control characters
  are rejected in both names. `sortOrder` is an integer 0..2147483647; ties are
  permitted. `isPublished` must be explicitly supplied. Names are plain text,
  never HTML. 201 returns a category DTO and a retrievable Location resource URL.
- GET `/{id}` returns 200 with the existing category DTO and current rowVersion
  for an owned non-deleted category, including drafts. Foreign, missing and
  soft-deleted IDs return indistinguishable generic 404 ProblemDetails. Successful
  reads do not change the category, write audit or PublishedMenuVersion. U02 can
  fetch the latest rowVersion here before PUT or DELETE; DELETE still requires
  JSON `{ rowVersion }` and CSRF.
- DTO: `{ id, nameAr, nameEn, sortOrder, isPublished, rowVersion }`;
  rowVersion is base64 SQL Server rowversion. No restaurant/user IDs, timestamps
  or administrative fields. Unknown JSON fields are rejected with 400.
- PUT `/{id}` requires the same full fields plus `rowVersion`; returns 200 DTO.
- DELETE `/{id}` requires JSON `{ rowVersion }`; returns 204, preserving the
  database row with `IsDeleted=true`. Any linked **non-deleted** item blocks
  deletion with 409, even if unpublished/unavailable. Soft-deleted items do not.
- Foreign, missing and soft-deleted category IDs return the same generic 404.
  Malformed fields/version return 400; stale client or concurrent SQL rowversion
  returns 412. Ownership is checked before semantic/version validation.
  Common malformed JSON/binding failures also use ProblemDetails.
- Every successful category mutation conservatively increments the restaurant
  `PublishedMenuVersion` and UTC `UpdatedAtUtc`, including draft/identical PUTs.
  Version update, category write, linked-item check and F05 audit share the
  Serializable transaction; failed writes roll back all of them. Public caches
  do not exist yet; F09/S03 must consume this version for freshness/invalidation.
  No schema migration or new dependency is introduced.

Verification and reproduction: [F06 report](../backend/F06-VERIFICATION.md).

### F07 implemented item contract

All `/api/v1/admin/items` routes require the existing authenticated cookie,
`TenantOwner`, HTTPS and no-store; POST/PUT/DELETE require identity-bound CSRF.
Only ITenantDataSession is used for data operations and the server resolves scope.

- GET collection: `page` default 1 (1..100000), `pageSize` default 20 (1..100),
  optional `categoryId` and `search` (trimmed literal substring, max 150, no control
  characters). Search covers Arabic/English names and descriptions using SQL
  collation. `%`, `_`, `[` are literal text, not wildcard expressions. SQL sorts
  by SortOrder then Id before offset pagination. Response `{ page, pageSize, items }`,
  no total count/snapshot. Only own non-deleted items appear, including drafts and
  unavailable items. Foreign/missing/deleted category filters return generic 404.
- GET `/{id}` returns the current item DTO. Foreign/missing/deleted item IDs use
  indistinguishable 404 ProblemDetails. Successful reads make no writes.
- POST body: `{ categoryId, nameAr, nameEn?, descriptionAr?, descriptionEn?,
  price, currencyCode, sortOrder, isPublished, isAvailable }`. The referenced
  category must be owned and non-deleted; unpublished categories are valid.
  Arabic name required and nonblank, English optional, names max 150. Descriptions
  optional, max 2000. Text is trimmed; optional blank becomes null. Names reject
  control characters; descriptions permit CR/LF/tab but no other controls.
  Text is plain JSON, never HTML. Names/descriptions are not required to contain
  a particular script; rendering must safely escape them.
- Price is required, 0..9999999999999999.99 with at most two significant decimal
  places; no silent rounding. CurrencyCode must be exactly `EGP`. SortOrder is
  required integer 0..2147483647, ties allowed. Publish/availability booleans are
  required explicitly. 201 returns DTO and retrievable item Location.
- PUT `/{id}` requires the full POST fields plus eight-byte base64 `rowVersion`;
  can move to another owned non-deleted category. 200 returns updated DTO.
- DELETE `/{id}` takes JSON `{ rowVersion }`, soft-deletes and returns 204.
  Images are retained; upload/storage/delete lifecycle belongs to F08.
- DTO fields: `id`, `categoryId`, `nameAr`, `nameEn`, `descriptionAr`, `descriptionEn`,
  `price`, `currencyCode`, `sortOrder`, `isPublished`, `isAvailable`, `rowVersion`.
  No restaurant/user IDs, timestamps, raw image keys or administrative metadata.
  Unknown JSON fields on every write (including client IDs/roles/tenant fields)
  return 400. HTTP item request body is capped at 32 KiB to accommodate escaped
  bilingual descriptions at the declared maximum; other existing limits remain.
- Malformed/range/currency/version input returns 400; foreign/missing/deleted
  resource or parent returns generic 404. Owned stale client/concurrent SQL
  rowversion returns 412; deadlock contention returns 409. Item ownership is
  checked before version/semantic validation. F05 transaction revalidation,
  audits, SQL integrity and F06 category-linked-item 409 remain enforced.
- Every accepted item mutation conservatively increments PublishedMenuVersion
  and restaurant UpdatedAtUtc once per transaction, including identical/draft
  changes; item write and audit commit atomically. Failures roll back all writes.
  Public visibility in F09 requires active/published restaurant, published category,
  published/available/non-deleted item; this admin API does not implement F09.
  Future F09/S03 caches must consume the version. No schema/cache/package added.

Evidence and local commands: [F07 verification](../backend/F07-VERIFICATION.md).

## Public endpoints
- `GET /api/v1/public/menus/{publicCode}?lang=ar|en` — active + published restaurant only; visible categories and items only; response `200`, `404` when nonexistent or intentionally hidden (exact unavailable strategy clarified before coding); cache only response safe for public reuse. Search in frontend over visible menu.

## Example public response shape (illustrative, no real data)
```json
{
  "restaurant": {
    "name": "Example Restaurant",
    "logoUrl": "/media/public/opaque-logo.webp",
    "primaryColor": "#0F766E",
    "currency": "EGP"
  },
  "language": "ar",
  "categories": [
    {
      "id": "e3d2ad85-aaba-4eaa-bf27-13acbe32d32a",
      "name": "المشروبات",
      "items": [
        {"id":"a4c4df84-a1d9-424c-bd08-f825c37842a4", "name":"قهوة", "description":"", "price":45.00, "imageUrl":"/media/public/opaque.webp"}
      ]
    }
  ]
}
```
No `RestaurantId`, `UserId`, status internals, private drafts, e-mail, storage bucket or raw object keys in public payload.

## Status/validation policy
- 200 read/update, 201 create with resource reference; 204 delete/logout.
- 400 malformed input, 401 unauthenticated, 403 authenticated but forbidden platform/role, 404 resource absent or foreign-tenant resource (non-disclosing), 409 conflicting state, 412 optional rowversion conflict, 413 oversize, 415 unsupported media, 422 semantically invalid fields if chosen consistently, 429 rate-limited; 500 generic error and correlation id.
- Backend validates lengths, categories, membership, price and image format. Paginate admin lists with server-side hard cap.
- API response DTO never returns EF entities directly. Avoid mass assignment by explicit request DTO allowlists.
- Generate OpenAPI and contract tests; frontend client should be generated or typed against one source of truth.

## Concurrency / state
- Avoid double writes: rowversion conflict or equivalent optimistic concurrency.
- Edit invalidates public menu cached read model; if adopting TTL, define user-visible maximum stale duration and verify in tests.

## Public SEO route contract (SSR edge and .NET API)
- `GET /r/{slug}`: SSR runtime returns full public HTML from authorized **anonymous public data only**, status 200 with restaurant header, categories and items in source. Include unique title, description, canonical, `lang`/`dir`, verified Restaurant JSON-LD and optional Open Graph/Twitter tags.
- `GET /m/{publicCode}`: same-origin redirect resolver returns **302** to the current canonical route. Only platform-generated local redirect targets; if unknown/unpublished, use correct non-200, not external URL or soft 404. QR string remains unchanged after rename.
- `GET /api/v1/public/restaurants/by-slug/{slug}?lang=ar|en`: anonymous public projection for Angular SSR route; do not expose draft/identity info. Resolver may query API internally; document stable non-public infrastructure endpoints vs same-origin public contract.
- `GET /sitemap.xml` and `/robots.txt`: published **canonical** restaurant pages only; exclude QR aliases, drafts, admin/preview, suspended/unpublished. Sitemap returns valid XML and actual public-change `lastmod` when available; split if >50,000 URLs.
- Unknown/deleted/unpublished slug -> correct HTTP 404/410 or planned unavailable policy; no 200 app shell. Deindexing policy must be explicit. Avoid exposing unpublished names in error response.
- Cache-safe page responses must invalidate/update on public changes, including price, visibility and canonical metadata. Verify SSR render, public API and subsequent QR visit show updated state.
