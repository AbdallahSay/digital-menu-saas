# PR: [Issue ID] — [Title]

## Scope / exclusions
- User story / acceptance criteria covered:
- Explicitly NOT included:

## Changes / technical decisions
- Files and high-level changes:
- DB migration and rollback impact (if any):

## Security checklist
- [ ] Identity/role checks applied
- [ ] Tenant scope derived server-side and direct ID abuse tested
- [ ] Data ownership including nested category/image references verified
- [ ] CSRF protections for authenticated unsafe requests
- [ ] Inputs/uploads validated, outputs safe
- [ ] Secrets not added or logged

## Performance checklist
- [ ] Query shape/indexes considered, no unbounded lists/N+1
- [ ] New image/JS payload budget reviewed (if UI)
- [ ] Benchmark results included if performance-sensitive or NOT RUN

## Test evidence (not assertions)
| Command/scenario | Environment | Result/exit code | Evidence link or excerpt |
|---|---|---|---|
| | | | |

## UI evidence (if relevant)
RTL / LTR screenshots, mobile widths, empty/error/loading states, accessibility results.

## Risks, review requested, rollback
Known issues; needed reviewer approvals; deploy and migration impact. No production deploy without human approval.

## Mandatory SEO gate (public route / content changes)
- [ ] `/r/{slug}` source HTML (without JS) contains real restaurant and published item(s), unique server-rendered title/description and correct HTTP status.
- [ ] One canonical per restaurant; `/m/{publicCode}` 302 directly to current canonical, no open redirects or redirect chain.
- [ ] Meta robots, sitemap publication rules, optional hreflang, JSON-LD Restaurant accurately reflect safe published data.
- [ ] Nonexistent/unpublished content is not soft-404 200; admin/preview not indexed.
- [ ] Raw-source automated test and JS-disabled browser proof attached, or NOT RUN with reason.

## Mandatory performance evidence (first public PR and updates)
- [ ] LHCI production-build results (mobile and page fixtures) with link or log.
- [ ] SSR cold/warm TTFB, public API timings, route JS/image weights and hydration duplication considered.
- [ ] Regressions vs recorded baseline addressed; RUM not claimed before live traffic exists.
