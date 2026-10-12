# Test Strategy & Acceptance Matrix

## Test pyramid
- Unit tests: domain validation, price, fallback locale, visibility rules, public code immutability, category deletion conflict, sort order.
- Backend integration tests: real/ephemeral SQL Server (e.g. dedicated test container) for composite FKs, Identity, auth, tenant filters and API; do not use EF InMemory as sole proof of SQL isolation.
- API contract tests: schemas/status/problem details; unauthenticated/role-based and payload validation.
- Frontend component tests: forms, search/filter, RTL/LTR, failure/empty/loading.
- E2E browser: platform creates restaurant -> owner logs in -> category/item added -> QR resolves -> public menu displays only published items -> toggles language -> hides item -> refresh confirms absent.
- Security and load tests: direct cross-tenant requests; CSRF and upload; public read load with documented scenario.

## Release acceptance checks
| ID | Scenario | Minimum pass evidence |
|---|---|---|
| AC-01 | Platform admin provisions tenant + owner | Successful API/DB state + audit |
| AC-02 | A cannot read/update B categories/items | Negative integration tests + unchanged DB |
| AC-03 | Foreign category on create item rejected | Composite FK + app validation test |
| AC-04 | Guest can see public menu, not drafts | API integration test |
| AC-05 | Suspended/unpublished restaurant unavailable | API and browser test |
| AC-06 | Edit price + reload public menu | Browser test and cache invalidation evidence |
| AC-07 | QR remains stable after restaurant rename | Deterministic integration test |
| AC-08 | JPEG/PNG/WebP safe upload and bad inputs refused | Upload and file inspection tests |
| AC-09 | Arabic RTL + English LTR + optional fallback | Screenshot + browser assertions |
| AC-10 | No admin mutation without auth/CSRF | API security tests |
| AC-11 | Upload/script injection paths blocked | Security regression tests |
| AC-12 | Measurable load test and CWV lab report | Reproducible commands/artifacts, numbers, no invented claims |
| AC-13 | Restore backup to fresh DB works | Recovery test log |
| AC-14 | Mobile scan via real printed QR works | Manual verification on >=2 devices |

## Definition of Done for each PR
Acceptance criteria satisfied; code compiles; changed-component tests pass; cross-tenant tests added if data access changes; UI mobile+RTL checked if relevant; no disabling failing tests; docs/OpenAPI synchronized; security and performance risks written down; full run command output/CI URL included.

## QA test data
Two independently provisioned restaurants A/B with similarly named items, plus suspended tenant C and empty tenant D; category with 200 items; Arabic only and bilingual item; long texts, zero price, invalid price, malicious script text, invalid image bytes. Passwords for fixture users must be local-only and not committed as production credentials.

## Day-one SEO and performance acceptance checks
| ID | Test case | Evidence required |
|---|---|---|
| AC-15 | Published restaurant renders indexable HTML server-side | Fetch without executing JavaScript: real `<h1>` name + item text, `<title>`, description, canonical, status 200 |
| AC-16 | QR alias/canonical and rename | `/m/{code}` 302 -> current `/r/{slug}` in one hop; old slug -> current canonical; no redirect loop/unsafe external redirect |
| AC-17 | Sitemap and indexability lifecycle | sitemap only published canonical URLs; unpublished/suspended/missing routes non-200, admin/preview noindex; robots syntax valid |
| AC-18 | Structured data and locale truthfulness | valid JSON-LD Restaurant reflecting visible/approved information, proper lang/dir; hreflang only for genuinely localized canonical versions |
| AC-19 | Performance baseline available from first public route | LHCI production build and image/JS budgets with preserved reports; cold/warm SSR and API timings; NOT RUN explicit if unavailable |
| AC-20 | SSR tenant isolation and cache freshness | concurrent requests A/B do not leak titles/items; price edit is reflected in HTML after successful edit/refresh; cache key tested |

Automate raw-response tests against a running SSR server (no browser JS) **as well as** Playwright hydrated user flow. Lighthouse CI should test the production-built route with seeded stable fixtures. Real-world CWV requires field data; simulated tests are a baseline, not a substitute. Source-HTML missing public content is a hard failure before UI merge.
