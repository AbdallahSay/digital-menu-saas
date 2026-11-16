# 10 — Decision log, assumptions and risk register

**Status:** Pending human review. This is **not** an accepted ADR or a new implementation authorization. Earlier [accepted ADRs](../11-ADR-AND-RISKS.md) remain controlling. D-IDs below are review questions and candidates to resolve before the affected feature, not a silent scope expansion.

## Decisions

| ID | Status | Question / mismatch | Proposed narrow option | Approval owner / gate |
|---|---|---|---|---|
| D-01 | DECISION REQUIRED | Premium v2 allows Restaurant/Café choice, but current RestaurantSettings stores only PrimaryColor and no ThemeId | Explicit constrained ThemeId enum + reviewed settings API, migration, theme rendering and tests; separate from PrimaryColor | Owner + backend lead before FR-031 persistence |
| D-02 | DECISION REQUIRED | Figma owner publish/unpublish UI vs current PlatformAdmin-only restaurant publication PATCH | Preserve platform-only authorization for MVP unless specifically approved; owner sees status/preview, cannot call platform API | Owner + security lead |
| D-03 | BOUNDARY ACCEPTED; confirm details | Free Demo has multiple Figma steps; no customer registration in MVP | Illustrative, unpublished, local/session-only state; no live tenant, public QR or backend write | Product owner |
| D-04 | OPEN P0 | Production hosting, Node SSR runtime, same-origin TLS/proxy topology, trusted internal SSR calls, regional costs | Review infra options and service trust; measure latency/cold start; never silently deploy CSR-only public menu | Product/ops/security |
| D-05 | OPEN | F09 remote-IP public limiter aggregates SSR visitors | Separate authenticated bounded SSR service budget and trustworthy ingress client limits; reject spoofed forwarding/internal markers | Security/perf review; see docs/19 |
| D-06 | OPEN | Reserved /r/demo, historical slug aliases and safe renames still unresolved | Normalize/reserve demo; migration plan for existing demo names; one-hop 301 only after approved alias design | Product/SEO/data review |
| D-07 | OPEN | Durable media provider/backups not chosen for production | Select image object store with staging restore and reconciliation, no public write keys | Ops/product |
| D-08 | EXISTING MVP RULE | One normalized existing owner email cannot be attached to a second restaurant | Preserve strict 409 behavior; membership extensibility does not authorize linking | Any change is product+security ADR |
| D-09 | PROPOSED | Error states and Figma prototype use success navigation | Real Angular must await API success and differentiate 400/409/412/5xx; no optimistic fake success | UX/backend review |
| D-10 | PROPOSED | SEO locales: optional English content and canonical/hreflang policy | Arabic canonical until separately justified English localized canonical URLs with complete unique content | SEO owner |
| D-11 | PROPOSED | Should owner have table/order/WhatsApp CTA in menu? | No. Display-only MVP and no table-specific QR | New feature requires separate change request |
| D-12 | OPEN | Data privacy: public address/phone publication and photo alt requirements | Explicit owner flags; keep private identities out of anonymous DTO; refine localization defaults | Product/privacy review |

## Risk register

| Risk | Likelihood | Impact | Mitigation and evidence | Gate |
|---|---|---|---|---|
| R-01 Cross-tenant data exposure through IDOR/media | Medium | Critical | Real SQL A/B tests, scoped FKs and resource guards; no client-authoritative tenant scope | Block release |
| R-02 Incorrect SSR/public cache containing drafts/private content | Medium | Critical | Published-only projections, per-tenant/version/locale tests, concurrent A/B isolation | Block release |
| R-03 Theme diverges between owner preview, SSR and public browser | High until D-01 | Medium | One validated theme identifier, shared UI token/variant mapping, SSR/browser parity screenshots | Block feature acceptance |
| R-04 Owner publish UI bypasses approved platform permission | Medium | High | Preserve platform-only endpoint and unauthorized UI until D-02; role tests | Block publication UI |
| R-05 Shared IP limit incorrectly throttles all SSR visitors | High (documented) | High | Trusted service boundary and load test >=150 simulated distinct clients/min per docs/19 proposal | Release capacity gate |
| R-06 QR becomes invalid after rename or redirects unsafely | Medium | High | Immutable code, one-hop 302, normalized safe old slug aliases | AC-07/16 |
| R-07 No production SSR/SQL/media/backup decision | High | Critical | P0 host/proxy and R01 restore sign-off | Block deploy |
| R-08 Large image/JS bundle degrades mobile menu | High | Medium | Image sizes, LHCI >=90, CWV p75 and target-region traces | Perf gate |
| R-09 UI labels overlap at 320px or bidi numbers misrender | Medium | High UX | Exact Figma comparison and Playwright at listed widths, keyboard/accessibility | UI acceptance |
| R-10 False claims of “sent email”, “published”, or “saved” | Medium | High | Await committed API outcome and use truthful messages; test failure paths | Product trust gate |
| R-11 Existing S01 local test evidence interpreted as production-ready | High | High | Distinguish local CI versus staging, execute current-head tests and monitoring | Release gate |
| R-12 Agent edits main, combines unrelated PRs or changes auth/schema unchecked | Medium | High | Isolated branches, PR review, rules, approval checkpoint; no autonomous merge | Process gate |

## Decisions before code

1. Product owner reviews D-01, D-02 and D-03. Do not accept a ThemeId schema or change publication authorization by inference.
2. Security/ops review D-04, D-05, D-06, D-07 and D-12 before production-facing work.
3. Freeze the display-only boundary and exact UI tokens as approved.
4. Record the chosen option as a distinct accepted ADR (or explicit PRD/API amendment) with tests, migration plan and rollback.
5. Track each risk to an issue/PR and update this register as evidence is collected.

## Explicitly unverified

This documentation update did **not** run Angular build/SSR/E2E, SQL migration tests, staging benchmarks, production host deployment, backup restore, or a Figma-to-browser visual regression. These must be executed and recorded by implementation PRs, never assumed.

