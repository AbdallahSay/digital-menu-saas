# Architecture Decision Records / Assumptions / Risks

## ADR-009 — F01 reversible local SSR harness (2026-10-12)

The human F01 request explicitly authorizes development-only SSR and defers
production hosting. This is a narrow exception to the pre-scaffold production
hosting prerequisite in ADR-003, README and P0, not completion of P0 or a
production architecture approval. Angular Node on loopback port 4000 routes
same-origin /api to .NET loopback port 5080. It requires F01_LOCAL_ONLY=1;
canonical and sitemap origin are fixed localhost, and no service is deployed.
Arabic is the single canonical locale; no hreflang or English canonical exists.
No shared SSR cache, database, entities, Identity users or CRUD are implemented.
The API cookie scheme only supplies deny-by-default challenges until F03.

Before production: select an SSR-capable Node/.NET host and Egypt-serving region;
measure regional latency/cold starts, cost and failure recovery; decide trusted
HTTPS origin/proxy headers, production cookie/CSRF integration, and durable SQL
and media hosting. The local proxy deliberately drops credentials and is not
suitable for F03 authenticated traffic. See 17-F01-FOUNDATION.md for evidence.

## ADR-001 — Modular Monolith (accepted for MVP)
One .NET deployable with clean feature/module boundaries; simplest to test, host and operate for early restaurants. No premature microservices/message broker.

## ADR-002 — Shared SQL Server with tenant scope (accepted, high-risk)
Efficient initial operating costs. Risks: cross-tenant access, noisy neighbor load, migration blast radius. Mitigations: server-derived scope, cross-tenant relationship constraints, query filters plus explicit authorization, isolation integration tests, load monitoring. Reassess dedicated DB tiers if contracted data isolation later required.

## ADR-003 — Angular hybrid SSR + hydrated public menu (accepted; supersedes former CSR-first ADR)
SEO and mobile performance are first-day product requirements. Render public `/r/{slug}` on the server (actual menu items in initial HTML); prerender marketing; CSR-only protected admin. Requires a compatible Node runtime/proxy and separate .NET API deployed under the same public origin. Confirm infrastructure and session/caching design before scaffolding; test cold/warm performance. If SSR Node hosting cannot be supported, propose a specific equivalent server-rendered public alternative for **human architecture approval**; never silently fall back to CSR only. Follow `docs/12-SEO-STRATEGY.md`.

## ADR-008 — Canonical SEO URL + permanent QR (accepted)
Index canonical `/r/{slug}`. Printed QR uses immutable `/m/{publicCode}` and 302 to latest canonical route. Prevent duplicate URLs; maintain historical slug redirects and limit to one hop. Include only published canonical URLs in sitemap. Document the QR redirect latency trade-off.


## ADR-004 — Authentication via ASP.NET Core Identity cookies (accepted)
Server-side login for owner/platform and same-origin frontend. Use secure cookie flags, CSRF on unsafe methods, lockout, rate limits, no localStorage bearer token default. Review mobile browser and proxy configuration.

## ADR-005 — PublicCode immutable random (accepted)
Deep link `/m/{PublicCode}` stays valid after name/slug change. Code visible on paper is not a secret. Revocation handled via restaurant publish/status, not by expiring QR.

## ADR-006 — English optional, Arabic required (accepted)
Simple onboarding for Arabic-first restaurants, progressive bilingual menu; fallback logic covered by tests.

## ADR-007 — Provisioning by platform admin (accepted for MVP)
No self registration/billing. Production-safe bootstrap admin and owner onboarding must be designed prior to deployment.

## Risks to address before production
1. **Media hosting**: local uploads lost on deployments/scaling; select durable object storage or persistent external mount prior to release.
2. **Auth/session deployment**: reverse-proxy cookie settings, antiforgery, Identity key persistence, password reset/invite delivery. Verify same-origin route strategy on chosen host.
3. **Visibility/caching**: ensuring price changes appear on refresh despite CDN or proxy cache; test invalidation.
4. **Localization quality**: Arabic truncation/RTL, fonts, mixed numerals, accessible layout.
5. **Slow/large menus**: response size, decoded images and SQL query shape; profile with representative 200-item fixture.
6. **Single database failure domain**: backup/restore, monitoring and planned maintenance required.
7. **Operational ownership**: registration/publish policy, restaurant deletion policy, support, incident response, backups.

## Decisions deferred until implementation planning
- Final product name/domain.
- Hosting service that supports Angular SSR Node runtime, proxying to .NET API, required region/service latency, and durable object storage (implementation blocker).
- Production user-invite email path (if unavailable, admin-assisted safe temporary onboarding with forced reset).
- Max published items/media tiers; 200 items/restaurant is only a load-test fixture.
- Precise public not-found vs unpublished UX and public cache invalidation scheme.
- Availability of external transactional email for password resets, or alternative secure admin process.

If a deferred decision blocks safe implementation, agent must log it and choose a documented, reversible local-only default without pretending it is production-ready.

## SEO/performance risks from initial planning
1. **Unindexed public shell:** missing server HTML or wrong metadata → raw-response assertions in first vertical slice.
2. **SSR cross-tenant bleed:** global mutable state/shared HTML cache → request-scoped dependencies and isolated cache keys; concurrent restaurant A/B leak tests.
3. **SSR cost and TTFB:** Node cold starts, uncached DB queries → observe SSR p95, warm/cold timings and right-sized deployment before launch.
4. **QR redirect adds latency:** one hop only, benchmark mobile on typical regional connection; don't add chained redirects.
5. **Stale price/page:** cache invalidation on changes, verify final rendered HTML and fresh QR visit after price edit.
6. **Index bloat:** draft/suspended/duplicate-language URLs excluded; accurate canonical and sitemap policy; real 404/410.
