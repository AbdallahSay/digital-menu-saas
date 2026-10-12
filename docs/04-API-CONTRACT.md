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

`IOwnerOnboardingDelivery` is a **test-only staging sink**, injected by local tests;
the normal app registers an unavailable adapter. Provisioning returns 503 without
writes unless Development has an available test adapter. Production provisioning
is deliberately blocked. Tokens stay in test memory, never HTTP provisioning
responses/logs/audits. A failed commit can leave an unusable staged token because
its random user ID has no committed account. Do not substitute a real email sender
inside this transaction; production needs a reviewed durable outbox/delivery,
retry/expiry/resend and Data Protection key management design.

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
- `GET /api/v1/admin/restaurant` / `PATCH /api/v1/admin/restaurant` — details/branding/basic contact.
- `GET /api/v1/admin/categories` / `POST /api/v1/admin/categories`.
- `PUT /api/v1/admin/categories/{id}` / `DELETE /api/v1/admin/categories/{id}` — deletion conflict if linked active items.
- `GET /api/v1/admin/items?page=&pageSize=&categoryId=&search=` / `POST /api/v1/admin/items`.
- `GET /api/v1/admin/items/{id}` / `PUT /api/v1/admin/items/{id}` / `DELETE /api/v1/admin/items/{id}` — soft delete.
- `POST /api/v1/admin/items/{id}/images` — multipart with image validation and bounded size.
- `DELETE /api/v1/admin/items/{id}/images/{imageId}` — verify both item/image belong to active owner tenant.
- `GET /api/v1/admin/qr` — returns public URL and optional QR asset reference; QR downloadable without exposing internal credentials.

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
