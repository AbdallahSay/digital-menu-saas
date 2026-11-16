# 08 — Requirements-to-implementation traceability and quality plan

**Purpose:** Prevent attractive Figma-only features or documentation claims from being mistaken for coded, secure or production-tested system capabilities.

## Requirement / story / API / diagram / test mapping

Test IDs below are proposed verification cases, not executed results. Existing [AC-01..AC-20](../08-TEST-PLAN.md) remain the authoritative acceptance numbering.

| Trace ID | Requirements | Story | Contract or code boundary | Diagram | Planned proof |
|---|---|---|---|---|---|
| T-001 | FR-001, FR-011–013; NFR-SEC-02/03/08 | US-AUTH-01 | /api/v1/auth/csrf, login, me, logout | D-FLOW-02 | Cookie/CSRF/role/lockout; AC-10 |
| T-002 | FR-002/003/008; BR-11 | US-PLAT-01 | /api/v1/platform/restaurants | D-FLOW-03, D-ARCH-04 | 201/409, transaction rollback and audit; AC-01 |
| T-003 | FR-004/005/009/010 | US-PLAT-02, 05 | Platform restaurant list/detail | D-ARCH-03 | Admin-only paging/search/no secrets |
| T-004 | FR-006/007/008; BR-03/12 | US-PLAT-03, 04 | Platform status/publication PATCH | D-FLOW-07 | 412, atomic audit, suspended hidden; AC-05 |
| T-005 | FR-020–023; BR-02/09 | US-OWNER-01 | Owner categories CRUD | D-FLOW-09 | Name/sort/publish, foreign denial, 409 |
| T-006 | FR-024–027; BR-02/05/08/10 | US-OWNER-02 | Owner items CRUD | D-FLOW-04, 08 | FK, availability, soft delete, 412; AC-03 |
| T-007 | FR-028/029; NFR-SEC-05 | US-OWNER-03 | Owner image upload/delete | D-FLOW-05 | Magic bytes, size, tenant and metadata; AC-08/11 |
| T-008 | FR-030/031/062 | US-OWNER-04, 05 | Restaurant settings + D-01 ThemeId proposal | D-ARCH-04 | Approved Figma theme snapshot; persistence pending ADR |
| T-009 | FR-032/033; BR-06 | US-OWNER-06 | Private preview, /m/:publicCode | D-FLOW-01, 11 | Private draft guard, immutable QR; AC-07 |
| T-010 | FR-034–036; BR-15/19 | US-OWNER-07/08 | Owner UI vs platform publication endpoint | D-FLOW-06, 14 | Accurate confirmation, role denial, ADR D-02 |
| T-011 | FR-050–053; NFR-SEO-01/03 | US-PUB-01/02 | /r/:slug, /m/:code, /api/v1/public | D-FLOW-01 | Raw HTML + one 302, hidden filtering; AC-04/15/16 |
| T-012 | FR-054–058, 062/063; NFR-ACC | US-PUB-03/04/05 | Public menu Angular SSR & image delivery | D-FLOW-08, 10 | AR/EN, search, image dimensions, no order UI; AC-09 |
| T-013 | FR-059–061; NFR-SEO-02/04 | US-PUB-06 | Canonical, metadata, schema, sitemap | D-FLOW-12 | Raw HTTP, schema and sitemap; AC-15–18 |
| T-014 | FR-070–072; BR-17 | US-DEMO-01 | Marketing prerender and demo-only components | D-FLOW-10 | No persistence/signup; Figma visual regression |
| T-015 | FR-080–081; NFR-SEC-01/04 | US-SYS-01 | TenantContext, scoped EF joins, composite FKs | D-ARCH-06, D-FLOW-13 | Negative A/B HTTP + real SQL; AC-02/03 |
| T-016 | FR-082–085; NFR-REL/SEC/PERF | US-SYS-02 | ProblemDetails, cache version, health | D-FLOW-06, 14 | Fresh SSR after edit, concurrency; AC-06/20 |
| T-017 | NFR-PERF-01–07 | US-PUB-06, US-SYS-02 | Public SSR/SQL/image path | D-ARCH-07/08 | Repeatable LHCI/field p75/load; AC-12/19 |
| T-018 | NFR-ACC-01–05 | US-PUB-04, US-DEMO-01 | Public + owner + platform templates | D-FLOW-10 | axe, keyboard, AR RTL/EN LTR and screenshots |
| T-019 | NFR-REL-01–04 | US-SYS-02 | CI/CD, infra and recovery | D-ARCH-07 | Staging restore, host/TLS/rollback; AC-13/14 |
| T-020 | NFR-MNT-01–04 | All epics | Figma tokens to Angular reusable components | D-ARCH-08 | Component audit, branch CI and review |

## Figma design-to-code mapping (visual traceability)

| Domain | Figma authority / supplementary QA | Angular intended family | Visual acceptance |
|---|---|---|---|
| Public Restaurant | [Premium v2 approved](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=7-2), [mobile QA](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=115-2) | /r/:slug, dish details, search/category | Correct restaurant green/chips/prices, AR RTL/EN LTR |
| Public Café | Same approved Premium v2 + [theme system](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=103-2) | Same public components with theme variant | Café brown styling, semantic status preserved |
| Owner admin | [Admin responsive QA](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=177-2), [tablet QA](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=179-591) | /admin/* feature areas | Categories, item edit, media, QR, branding, honest errors |
| Platform | Same admin QA pages | /platform/* feature areas | Privileged directory/provision/status/audit; no owner data leak |
| Marketing and demo | [Theme selection extensions](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=125-2) | / marketing and illustrative demo | Non-persistent, no fake live QR or signup |
| Cross-product tokens | [Implementation handoff](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=225-2) | Angular design-system library | Responsive, accessible, native reusable variants |

Do not treat a design QA score or Figma hyperlink as implemented browser functionality; require screenshot and route-level evidence on the code PR.

## Proposed test execution layers

| Layer | Examples | Acceptance artifact |
|---|---|---|
| Domain unit | visibility predicate, locale fallback, normalized slugs, stable version | dotnet test exact count |
| SQL integration | composite FKs, cross-tenant IDs, constraints, concurrency | Real SQL fixture and results |
| API integration | Identity/cookie/CSRF, platform provisioning, CRUD, upload, errors | Authenticated & denied request assertions |
| SSR HTML | published/unpublished, canonical, JSON-LD, no hidden data | Fetch raw HTTP without JS |
| Angular component | theme tokens, direction, dialogs/forms, state transitions | Component tests, actual run output |
| Browser E2E | QR path, menu filtering/search, owner CRUD, error recovery | Playwright desktop/mobile AR/EN |
| Accessibility | focus, keyboard, labels/contrast, bidi text, 44px touch | axe and manual verification |
| Performance | LCP/INP/CLS, SSR TTFB, p95 API, 100-tenant fixture | LHCI + test environment/trace evidence |
| Operations | backup restore, origin/headers, secrets, alerting | Staging drill and sign-off |

### Representative E2E BDD — E2E-QR-01

Given Tenant A is active and publicly published with one visible and one draft dish,
when the guest follows the immutable QR and visits the canonical SSR page,
then exactly the visible item is present in the initial HTML and no private draft item or owner email is exposed;
and when A is suspended, subsequent public requests do not reveal either item.

### Representative E2E BDD — E2E-OWNER-02

Given Owner A is logged in and attempts to update B's item with B's ID and category,
when sending the unsafe method with a valid CSRF token,
then the server denies it without disclosing B and no A/B row is modified.

### Representative E2E BDD — E2E-THEME-03 (after D-01)

Given a tenant is explicitly persisted as Café, when the guest loads the public menu as Arabic and English, then the Café hero/chips/prices/primary buttons use the Café theme and all status badges preserve their semantic meaning; refresh and SSR output agree.

## Required test evidence in every PR

- FR/US/T ID and exact Figma frame link.
- Actual commands, exit codes, environment and changed files; say **NOT RUN** if not executed.
- Evidence for protected API paths including negative cross-tenant test.
- Source HTML/canonical test on any public/SSR change.
- 320/360/390/430/768/1024/1440 screenshots when layout altered, RTL/LTR and keyboard test.
- Database migration/ADR/operational impacts or explicit “none”.
- Reviewer sign-off before merge. No code change, production deployment or data migration is included in this spec branch.

