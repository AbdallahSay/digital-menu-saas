# Delivery Backlog — smallest reviewable increments

Each item is a PR-sized unit. Agent must propose technical implementation and affected tests before coding; reviewer controls merge.

S01's local acceptance evidence, open production prerequisites and proposed S02
scope/ownership are reviewed in [S01 review and S02 plan](18-S01-REVIEW-AND-S02-PLAN.md).
That document is a proposal for human review: it does not authorize S02, change
the task graph or declare production readiness.

| ID | Milestone | Task | Verification gate |
|---|---|---|---|
| P0 | Planning | Approve PRD, API contract, SEO/SSR decision, SSR-capable host and constraints | Human review of docs, record open questions |
| F01 | Foundation | Initialize .NET 10 API and Angular hybrid SSR skeleton, hosting routes, baseline formatting, OpenAPI, health, initial LHCI + source-HTML tests | `dotnet build`, Angular SSR prod build, live `/r/demo` returns server HTML with fixture title/item and canonical; LHCI baseline stored |
| F02 | Persistence | SQL Server schema migrations, constraints and indexes, two-tenant dev/test fixtures | SQL integration tests; tenant relation FK denial |
| F03 | Identity | Identity, cookie/CSRF, platform/owner auth, bootstrap controls, rate limits | Authentication/CSRF/lockout integration tests |
| F04 | Platform | Provision restaurant + owner, active/suspended status, audit | Platform policies, negative role tests, audit record |
| F05 | Tenant security | Server-resolved tenant context, scoped queries/writes, resource/association guards | SQL adversarial service-boundary matrix now; actual HTTP matrix with F06/F07/F08 (no invented test routes) |
| F06 | Catalog API | Categories CRUD, validation, sorting/publish | Authorization, validation, concurrency tests |
| F07 | Catalog API | Items CRUD, publish/availability, soft delete | Cross-tenant FK tests and public visibility tests |
| F08 | Media | Image normalization, tenant storage abstraction, upload endpoints | MIME spoof/oversize/foreign item tests |
| F09 | Public API | Menu projection, locale fallback, public status, cache correctness, slug lookup | API contract + query count/profile tests, SSR A/B isolation |
| S01 | SEO | Implement SSR canonical public menu + stable QR 302 alias + correct 404/410 | Real source HTML, one-hop redirect, non-200, no tenant bleed tests |
| S02 | SEO | Per-restaurant metadata, Restaurant JSON-LD, sitemap/robots, indexing rules | Structured data parsing, sitemap publication lifecycle, raw HTML and language validation |
| S03 | Performance | Optimized responsive image delivery, hydration/transfer cache and SSR invalidation | Mobile production LHCI regression, no duplicate fetch, fresh HTML after edit |
| U01 | UX | User flows, component library, mobile public-menu Figma frames | UX checklist approval; RTL/LTR mockups |
| U02 | Admin | Login + owner/category screens, forms, error handling | Form tests, responsive layout |
| U03 | Admin | Item editor/media/theme/QR screens | E2E owner flow, asset download test |
| U04 | Public | Menu pages, category navigation, search, language fallback, QR deep link | Browser E2E + mobile screenshots + accessibility |
| Q01 | QA | Full end-to-end critical paths + security regression | All AC-01 to AC-11 |
| Q02 | Performance | 100-tenant/200-item load seed, mobile Lighthouse + load smoke, server cold/warm render, query plans and RUM readiness | Real baseline evidence + improvement loop; regressions against F01 baseline |
| R01 | Release | Staging, backup/restore, security headers, operations runbook | AC-12 to AC-14 + human approval |

**Dependencies:** P0 (including SSR hosting decision) -> F01 (SSR fixture + CI baseline) -> F02 -> F03 -> F04/F05 -> F06/F07/F08 -> F09 -> S01/S02/S03 -> Q01/Q02 -> R01. U01 can start after P0; U02/U03 after relevant contracts; U04 can use contract mocks after U01 and must satisfy S01/S02. SEO checks apply during every public PR and not only at S01/S02. Release after Q01/Q02 plus all SEO gates.

## Ready/Done example for F05
**Ready:** identities and restaurant memberships implemented; owner role and entity IDs modeled. **Done:** direct GET/POST/PUT/DELETE requests from Owner A against B's categories/items/images cannot disclose/mutate B, including foreign category association; logs redact protected identifiers; tests executed against SQL Server; review notes explain how context is derived and why bypasses are privileged.

## Git practice
`main` protected; one branch per ticket (`feat/F07-items-api`, `feat/U04-public-menu`); small PR with traceable story ID, tests and screenshots. Codex and Antigravity use separate branches/worktrees, not simultaneous edits to same uncommitted working tree.
