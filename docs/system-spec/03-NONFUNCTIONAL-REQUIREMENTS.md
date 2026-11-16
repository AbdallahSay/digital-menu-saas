# 03 — Non-functional requirements (NFR) and measurable acceptance

Every target below needs **evidence from the target environment**. Historical local Lighthouse or CI results are not production measurements. P0 = launch blocker; P1 = follow-up before broad rollout. Existing docs/07-PERFORMANCE.md, docs/06-SECURITY.md and docs/12-SEO-STRATEGY.md take precedence if values diverge.

| ID | Pri | Quality attribute | Required condition / provisional target | How to verify |
|---|---|---|---|---|
| NFR-SEC-01 | P0 | Tenant isolation | No Owner A read/write/media path can access Tenant B, including guessed GUIDs/foreign FK | SQL + HTTP negative A/B matrix |
| NFR-SEC-02 | P0 | Authentication | Secure, HttpOnly, same-origin Identity cookie; no token in localStorage; MFA unsupported fails closed | Cookie/security integration suite |
| NFR-SEC-03 | P0 | CSRF | CSRF token and validation on all unsafe cookie-authenticated endpoints; safe login handshake | Forged/missing token denial |
| NFR-SEC-04 | P0 | Authorization | Default deny; server-derived active membership, no client-authoritative RestaurantId | Policy/IDOR tests |
| NFR-SEC-05 | P0 | Input/media | Validate length/type/ranges; image signatures, size, dimensions, re-encode, strip metadata | Fuzz/malformed/oversize tests |
| NFR-SEC-06 | P0 | Transport/headers | HTTPS + HSTS as appropriate, sane CSP, no sensitive info in headers/response | Deployment inspection + scanners |
| NFR-SEC-07 | P0 | Secret handling | No credentials in repo, bundles, logs, screenshots or issue comments | Automated secret scan and log review |
| NFR-SEC-08 | P0 | Session & abuse | Lockout 5 failed/15min and auth throttle 10/min/IP per existing F03; public rate limit solution must avoid unfair SSR shared bucket | Contract/integration + multi-visitor load |
| NFR-SEC-09 | P0 | Concurrency | Guard against lost edits; 412 on stale approved RowVersion | Race/integration tests |
| NFR-SEC-10 | P0 | Privacy | Public DTO includes only approved fields; authenticated/private responses no-store | DTO snapshots & header tests |
| NFR-PERF-01 | P0 | CWV mobile | LCP <= 2.5s, INP <= 200ms, CLS <= 0.1 at field mobile p75 after sufficient sample | RUM, segmented p75 |
| NFR-PERF-02 | P0 | Lab baseline | Mobile Lighthouse performance >= 90 on documented representative throttling | Repeatable LHCI, not single screenshot |
| NFR-PERF-03 | P1 | API responsiveness | Warm public menu API p95 <= 300ms under agreed load scenario; track p99 | Target-region load traces |
| NFR-PERF-04 | P0 | Query efficiency | No N+1 for menu; bound size, initial target max 200 visible items per restaurant | Query counting/SQL plans |
| NFR-PERF-05 | P0 | Media budget | Responsive images, stable dimensions; typical small thumb <= 100 KiB above fold | Image review & network audit |
| NFR-PERF-06 | P0 | Cache safety | Anonymous public cache tenant + locale + version aware; never cache private content | Cross-tenant concurrency & invalidation tests |
| NFR-PERF-07 | P1 | Error rate | Under agreed valid traffic load, API error rate < 1%, excluding injected invalid requests | Measured reproducible load |
| NFR-SEO-01 | P0 | Initial HTML | /r/{slug} returns meaningful restaurant/item text in raw server HTML without JS | curl/source-HTML assertions |
| NFR-SEO-02 | P0 | Indexability | One accurate title, meta, H1, canonical; only active published indexable | Source HTML tests |
| NFR-SEO-03 | P0 | Routes | Valid QR 302 one hop; hidden/invalid exact 404/410 policy; no duplicate canonical | Redirect/crawl tests |
| NFR-SEO-04 | P0 | Discovery | Published-only robots/sitemap/JSON-LD with factual fields | Sitemap/schema validators |
| NFR-ACC-01 | P0 | Visual accessibility | WCAG 2.2 AA target; text contrast >=4.5:1 normal and >=3:1 large, where applicable | axe, manual color audit |
| NFR-ACC-02 | P0 | Interaction | Keyboard/focus, descriptive labels/errors; no keyboard trap; touch targets >=44x44px **project target** | Playwright/axe/manual mobile |
| NFR-ACC-03 | P0 | Language | Arabic first-class RTL; English LTR; screen-reader lang and correct numeric/price bidi | Real-device AR/EN checks |
| NFR-ACC-04 | P0 | Breakpoints | Designed/tested 320, 360, 375, 390, 412, 430, 768, 1024, 1440; no horizontal scroll or clipped chips/headlines | Browser visual regression, not Figma alone |
| NFR-ACC-05 | P1 | Content hierarchy | One primary H1, short headings, noncrowded dialogs; loading/empty/error/retry wording natural | Content review + screenshot diff |
| NFR-REL-01 | P0 | Recovery | Production SQL + media backup/restore successfully tested; document RPO/RTO before go-live | Destructive TEST restore in isolated env |
| NFR-REL-02 | P0 | Release safety | Migration backup, staged rollout, rollback path, no destructive change without approval | Runbook drill & change review |
| NFR-REL-03 | P0 | Observability | Correlation IDs, readiness, structured redacted logs, alerting on 5xx/cold starts/media failures | Staging fault injection |
| NFR-REL-04 | P0 | Dependency readiness | SSR-capable Node/.NET shared public-origin hosting, TLS/proxy/header trust and cost accepted | P0 ADR, staging deployment proof |
| NFR-MNT-01 | P0 | Maintainability | Reusable Angular components/tokens; single source for Restaurant/Café variants | Component/storybook-equivalent review |
| NFR-MNT-02 | P0 | Quality CI | Build, format/lint, unit/API/SQL security, source HTML, e2e a11y/RTL and dependency audits on affected PRs | GitHub Actions logs, actual exit codes |
| NFR-MNT-03 | P0 | Traceability | Every feature PR lists FR, US, AC/test ID, Figma frame and acceptance evidence | PR template/checklist |
| NFR-MNT-04 | P1 | Capacity | Validate 100 tenants x 200 public items and concurrent visitors on selected region | Seeded Q02 load/perf test |

## Test methodology and exceptions

- Run real SQL tenant-isolation tests, not only in-memory EF fixtures.
- Test source HTML and HTTP status in addition to hydrated DOM; do not infer SEO from visual screenshot.
- Record hardware/network, origin/region, dataset, repetitions, percentile and baseline version with performance figures.
- Browser QA: representative viewport widths, AR RTL, EN LTR, low bandwidth, reduced motion, keyboard and images disabled.
- Performance/operations budgets are **provisional launch gates pending actual environment selection**; do not claim achieved or relaxed without owner-reviewed evidence and ADR.

