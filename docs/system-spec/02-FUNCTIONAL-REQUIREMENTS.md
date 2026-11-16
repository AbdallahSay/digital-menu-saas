# 02 — Functional requirements (FR)

All FRs are **MVP candidate requirements** derived from approved scope unless explicitly marked Decision Required. Each has a stable ID for GitHub issues, stories, automated tests and PR descriptions. Priority: P0 must pass for MVP, P1 important for first usable release, P2 later/hardening. **Do not treat listed FR as already coded.**

| ID | Priority | Actor/module | Observable requirement | Acceptance evidence |
|---|---|---|---|---|
| FR-001 | P0 | Platform | Authenticate PlatformAdmin with secure session; refuse unauthorized role | 401/403 tests; no tenant leakage |
| FR-002 | P0 | Platform | Create restaurant, unique normalized slug, immutable PublicCode, owner and audit atomically | 201/409; rollback and concurrency tests |
| FR-003 | P0 | Platform | Reject existing owner email, including inactive account, instead of silently linking restaurants | 409 and no partial membership |
| FR-004 | P0 | Platform | List/search/page restaurants with safe non-secret details | Stable pagination, bounded page size |
| FR-005 | P0 | Platform | Read restaurant details only with privileged policy | Role denial, safe DTO |
| FR-006 | P0 | Platform | Suspend/reactivate restaurant via valid RowVersion | 200/412; public menu hidden when suspended |
| FR-007 | P0 | Platform | Publish/unpublish restaurant via privileged platform endpoint | Audit, version increment, public visibility |
| FR-008 | P0 | Platform | Record audit for create/lifecycle/publication changes without secrets | Durable safe audit entries |
| FR-009 | P1 | Platform | View owner details and account status without exposing credentials | Scoped privileged read tests |
| FR-010 | P1 | Platform | Present empty, suspended, conflict and retry UX in management screens | Figma-matched accessible states |
| FR-011 | P0 | Authentication | Login with Identity cookie + CSRF handshake; generic invalid-credential result | Integration tests for lockout and CSRF |
| FR-012 | P0 | Authentication | Logout and invalidate active sessions; session restricted to permitted role/membership | No access after logout |
| FR-013 | P0 | Authentication | Prevent suspended/inactive owner tenant mutation even with old cookie | HTTP and service denial |
| FR-014 | P1 | Authentication | Invite/setup owner only via controlled platform onboarding; never auto-send unconfigured mail | Token controls; no public signup |
| FR-020 | P0 | Owner | List own categories with publish flags, sort and visibility | Two-tenant tests |
| FR-021 | P0 | Owner | Create/edit/reorder own category; Arabic name required, English optional | Validation, persistence and order |
| FR-022 | P0 | Owner | Publish/unpublish category; unpublished category and descendants excluded publicly | Public projection tests |
| FR-023 | P0 | Owner | Soft-delete category only when business rule allows; refuse category with active items | 409 and explanatory UI |
| FR-024 | P0 | Owner | List own items with category, price, availability and publish flags | Tenant scope and pagination |
| FR-025 | P0 | Owner | Create/edit own item with category, Arabic name, optional English, descriptions, nonnegative price | Validation and foreign-category denial |
| FR-026 | P0 | Owner | Reorder items; toggle item published/available; preserve soft-delete semantics | Correct public visibility |
| FR-027 | P0 | Owner | Reject stale edit based on RowVersion; show refresh/conflict UI | 412, no lost update |
| FR-028 | P0 | Owner | Upload validated image, normalize to safe format, strip metadata, store opaque tenant key | Signature/size/format/security tests |
| FR-029 | P1 | Owner | Manage primary and additional item images, alt text and order | Only own item/media, sorted projection |
| FR-030 | P0 | Owner | Edit logo, cover, public contact fields, legal color inputs and locale | Safe persistence and opt-in public fields |
| FR-031 | P1 | Owner/UI | Select Restaurant/Café theme; persist it in explicit audited schema/API after D-01 approval | Figma variant, persistence and public SSR parity |
| FR-032 | P0 | Owner | See private preview including drafts only after server-side authorization | Not accessible to anonymous users |
| FR-033 | P0 | Owner | Copy/download stable QR linking to /m/{PublicCode}; printed route survives rename | QR integration test |
| FR-034 | P1 | Owner/UI | Show accurate published/unpublished/conflict/error confirmation states | No false success before API result |
| FR-035 | P1 | Owner/UI | Perform mobile CRUD and settings from 320–430px screen with clear actions | Responsive & accessibility screenshots |
| FR-036 | P1 | Owner/UI | Display restaurant-level publish controls only for approved authorized role | D-02 authority decision and tests |
| FR-050 | P0 | Public | Resolve valid active published slug as indexable SSR menu with real source HTML | 200 HTML tests |
| FR-051 | P0 | Public | Resolve immutable QR alias to current canonical slug in one temporary 302 | QR redirect tests |
| FR-052 | P0 | Public | Filter restaurant/category/item publication and item availability/deletion on server | A/B and hidden-state tests |
| FR-053 | P0 | Public | Render ordered category, dish, image and accurate EGP price without login | SSR + browser tests |
| FR-054 | P0 | Public | Search visible menu and filter visible categories without leaking drafts | AR/EN tests |
| FR-055 | P0 | Public | Switch AR RTL/EN LTR, fall back to Arabic for missing translation | Locale/dir/content assertions |
| FR-056 | P0 | Public | Render empty, unavailable and network/error states with correct status/noindex | Source HTML & E2E |
| FR-057 | P0 | Public | Show only opt-in public restaurant contact information, never owner identity/private metadata | DTO snapshot/security tests |
| FR-058 | P0 | Public | Return public media in optimized formats/sizes with stable layout dimensions | Asset/media tests |
| FR-059 | P0 | SEO | Set title, meta, one H1, canonical and correct server status for indexed menu | Raw HTTP assertions |
| FR-060 | P0 | SEO | Serve accurate published-only sitemap/robots and grounded structured data | Sitemap/crawl contract test; S02 approval |
| FR-061 | P1 | SEO | Keep former valid slug redirects without chain; protect reserved demo path | Approved D-06 mutation/alias design |
| FR-062 | P0 | Public/UI | Preserve two approved Premium v2 menu identities and theme-aware buttons/chips/prices | Figma visual regression |
| FR-063 | P0 | Public/UI | Do not render cart, order, checkout, payment, POS or booking affordances | Negative UI/API scope tests |
| FR-070 | P1 | Marketing | Prerender informative landing page with accessible routes to illustration/demo | HTML and E2E |
| FR-071 | P1 | Demo | Run clearly illustrative, unpublished preview of both menu identities | No real tenant/QR account creation |
| FR-072 | P1 | Demo | Complete guided demo steps and localized validation/recovery | AR/EN prototype and browser tests |
| FR-080 | P0 | System | Resolve owner tenant membership on server; deny foreign IDs and associations | Negative A/B HTTP tests |
| FR-081 | P0 | System | Enforce tenant-aware SQL joins/FKs, per-resource auth, and safe storage paths | SQL integration tests |
| FR-082 | P0 | System | Return consistent ProblemDetails without sensitive stack/tenant metadata | Error contract tests |
| FR-083 | P0 | System | Trigger version-aware public invalidation on approved edits | Fresh SSR HTML/load tests |
| FR-084 | P0 | System | Enforce HTTPS, restrictive protected caching, and CSRF on unsafe cookie mutations | Security tests |
| FR-085 | P1 | System | Expose health/readiness and redacted correlation-aware logs | Ops acceptance tests |

## Deferred and decision-dependent details

- **FR-031 and FR-036:** do not add a theme field or owner publication mutation before D-01/D-02 are approved. Existing restaurant publication endpoint is platform-only.
- **FR-060/061:** SEO S02 completion requires the existing open ADRs; source documents take precedence.
- **FR-071:** illustrative demo must never be treated as self-registration, a deployed tenant, or a working public QR.
- **All features:** must be implemented using existing route/API/schema truth and reflected in contract change review before code.

