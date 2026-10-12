# System Architecture / Technical Design

## Deployment baseline
**Modular monolith API, hybrid-rendered frontend:** .NET API hosts Identity, tenant-aware CRUD and public read APIs. Angular app uses **SSR + hydration** for indexable `/r/:slug` restaurant/menu pages, **SSG/prerender** for marketing, **CSR** for authenticated `/admin/*` and `/platform/*`. Public origin routes `/api/*` to .NET, `/r/*` to Angular SSR Node runtime, `/m/{publicCode}` to a 302 one-hop redirect resolver mapping to current canonical `/r/{slug}`, and admin paths to Angular client shell with auth protection. SQL Server shared database. Media uses durable storage. Reverse proxy and SSR Node runtime compatibility/cost are prerequisites, not future work. Never serve the indexable menu as an empty JS-only shell.

## Suggested repository layout (agent may refine before coding)
```
backend/src/DigitalMenu.Api
backend/src/DigitalMenu.Application
backend/src/DigitalMenu.Domain
backend/src/DigitalMenu.Infrastructure
backend/tests/DigitalMenu.UnitTests
backend/tests/DigitalMenu.IntegrationTests
frontend/    # Angular web app (admin + public routes, lazy-loaded feature areas)
docs/
AGENTS.md
```
Dependencies: Api -> Application/Infrastructure; Infrastructure -> Domain/Application interfaces; Application -> Domain; Domain -> no EF/web dependencies. Avoid ceremonial layers: use feature folders, explicit dependencies and maintainability over folder count.

## Modules
- Identity/Access: Identity, sessions, platform role, restaurant memberships and policies.
- Restaurant: profile, lifecycle, branding, public code, publish state.
- Catalog: categories, menu items, images, sorting, visibility.
- Media: upload validation, image normalization, storage keys, image delivery.
- PublicMenu: projection optimized for read-only browsing, caching and safe localization.
- Audit/Operations: security-sensitive change events, metrics, health, structured logs.

## Trust boundaries
1. Customer browser/QR -> anonymous read-only `/api/public` endpoints, only non-sensitive fields.
2. Owner browser -> authenticated `/api/admin` endpoints with server-resolved active restaurant membership.
3. Platform admin -> `/api/platform` endpoints with strict policy and audit logging.
4. Backend -> SQL and tenant-scoped media store; never expose storage-write credentials to browser.

## Identity architecture
Prefer same-origin, server-managed ASP.NET Core Identity auth cookies: `HttpOnly`, `Secure`, correct `SameSite` and expiration strategy; antiforgery for unsafe methods (explicit endpoint coverage and Angular token integration). No credentials/tokens in LocalStorage. Require reauthentication for critical operations where applicable. Limit login attempts and protect bootstrap superadmin creation.

## Tenant resolution
- Platform admins have explicit privileged platform scope; owners have one active restaurant membership selected on server.
- Do not accept owner-supplied `RestaurantId` as authoritative; on every protected request determine scope from authorized identity/membership.
- Application query methods require tenant context; EF filters are additional protection. Join constraints and updates require tenant ownership checks. For legitimate platform-wide queries, use isolated privileged application service, with audit and explicit tests.
- Never trust public code or URL slug as proof of authorization.

## Public read model
One read-only endpoint returns lightweight restaurant brand and visible ordered categories/items with optimized URLs. Bound response size by paginating or policy-based maximum (initial target 200 visible items per restaurant); evaluate split endpoints if payload grows. Select only necessary columns; use `AsNoTracking`; avoid N+1 database calls. Query filters and projections keep suspended/pending content out. Cache only public responses keyed by `PublicCode + locale + version`, with invalidation on edits or deliberately bounded TTL and clear freshness contract. Never cache authenticated data in shared public cache.

## Responsive frontend design
- Angular feature routes: `/r/:slug` SSR public, optional localized indexable routes only when appropriate; `/admin/*` and `/platform/*` CSR; `/login` noindex; `/m/:publicCode` HTTP redirect resolver; `/unavailable` correct noindex/non-200 response.
- Avoid expensive dependencies in public route; lazy-load admin; image placeholders with stable dimensions and lazy load below-fold.
- Handle network offline/retry gracefully; accessible touch sizes, Arabic RTL and English LTR, explicit loading/error/empty states.
- SSR/hydration is an architectural requirement for the indexable public route; test raw HTTP HTML and metadata in F01 against fixtures. SSR must never render unpublished or tenant-private data. Ensure server/browser data transfer cache includes only anonymous, public information and does not leak across requests. SSG marketing is independently cacheable. Measure SSR timings, cold starts, TTFB, CPU, and conversion of real URLs to HTML; never claim SSR alone guarantees CWV.

## Operational notes
- Health checks: liveness without DB dependency; readiness verifies required dependencies with limited sensitive detail.
- Structured logs and correlation IDs; redact cookies/passwords/auth tokens; do not log sensitive request bodies.
- Database schema evolution: versioned migrations reviewed and backed up; non-destructive deploy sequence.
- Defense-in-depth: HTTPS, strict CORS (prefer same-origin), security headers, input validation, rate limits, least-privilege SQL/storage credentials.

## SEO/public navigation route contract (day-one)
- Canonical public restaurant route: `GET /r/{slug}` responds with server-rendered HTML and real visible menu text; **one unique canonical per published restaurant**. Slugs globally unique and sanitized, changed only with redirect/alias strategy.
- QR route: `GET /m/{immutablePublicCode}` issues one temporary `302` to current canonical `/r/{slug}`. Never embed a renameable slug in the printed QR. Do not 301 QR alias because target can change; preserve QR stability and benchmark the added round trip.
- Slug rename: keep historical slug -> new canonical `301` redirects only for legitimately moved public pages. Guard against redirect chains/open redirects.
- Marketing route: pre-rendered. Admin routes: CSR and authenticated; never index. Nonexistent and unpublished routes return actual non-200, not 200 app-shell (avoid soft 404).
- Language-specific canonical URLs `/ar/r/{slug}`, `/en/r/{slug}` MAY be adopted if each locale has meaningful unique localized content and server metadata; until then one canonical public page with client switch and no false `hreflang`. Document final locale routing choice in F01 ADR.
- SSR runtime and API must share a stable public origin; internal cross-service calls never use private cookies on shared public pages. Any caching must key by canonical restaurant identity/locale/publication version and prohibit user-specific SSR data.
