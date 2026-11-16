# 09 — Development roadmap and safe release strategy

**Status:** Planning proposal. Existing milestones P0, F01–F09, S01–S03, U01–U04, Q01/Q02, R01 in [backlog](../10-BACKLOG.md) and [automation/tasks.json](../../automation/tasks.json) are the canonical work graph; this document refines UI delivery without silently changing issue ownership or dependencies.

## Baseline audit first

- The backend contains .NET 10 Identity, platform provisioning, tenant-scoped catalog/media and public read modules. The frontend is Angular 22.2.2 with hybrid SSR foundations and limited wired feature routes; do not rebuild established features from scratch.
- Historical F01–F09/S01 test reports are not current release proof. Check current CI and write down gaps against live main before making code changes.
- Production Node SSR origin, trusted proxy/service boundary, durable media, real Egypt-serving latency, backup/restore and S02 issues are not approved complete.
- Visual system Figma Premium v2 is approved; responsive design boards are reference prototypes that still need real Angular/browser implementation and testing.

## Work packages with PR sized outcomes

| Order | Work package (suggested branch) | Scope and IDs | Dependencies | Minimum test gate |
|---|---|---|---|---|
| 0 | SPEC-00 planning review | Approve FR/NFR/US/diagrams, decide D-01..D-07; keep draft PR | Current repo + Figma | Link/traceability/architecture review |
| 1 | UI-01 design foundation | Shared Angular tokens, typography, 2 themes, buttons, chips, cards, form fields, dialog/feedback variants | Figma; D-01 for persistence | Component snapshots, AR/EN and 320–1440 |
| 2 | UI-02 public mobile | SSR public menu Restaurant/Café, category/search/dish cards/details, empty and unavailable; no cart | F09/S01, UI-01 | AC-04/05/09/15/20, source HTML |
| 3 | UI-03 marketing/demo | Prerender marketing, illustrative 4-step demo, Restaurant/Café selection/preview, explicit unpublished state | UI-01; demo scope locked | Browser flows, no account creation |
| 4 | UI-04 owner shell | Login/csrf/me/logout integration, route guards, mobile/desktop nav, forms/loading/errors | F03/F05 + UI-01 | Role denial, CSRF, AR/EN/a11y |
| 5 | UI-05 categories and items | UI wired to existing F06/F07, reorder/availability, concurrency/validation | UI-04 | F06/F07 cross-tenant, 409/412 and e2e |
| 6 | UI-06 media/branding/QR | Safe F08 upload, owner cover/logo, preview and stable QR; theme persistence only after D-01 | UI-04/05 + D-01 where relevant | F08 invalid bytes, QR one-hop, screenshot |
| 7 | UI-07 platform | Admin directory, create and edit, owner details, suspend/reactivate, audits; publication role stays platform-only unless D-02 approved | F04 + UI-01/04 | AC-01, audit and denial |
| 8 | SEO-02 + PERF-03 | S02 metadata/sitemap/JSON-LD/slug policy, media/SSR freshness and caching | Open ADRs D-04/D-06 | AC-15–20, load evidence |
| 9 | QA-01/QA-02 | End-to-end cross-tenant, published/hidden, mobile RTL/LTR, accessibility, regional perf | Above slices | AC-01–20, CI reproducible |
| 10 | REL-01 | Staging deployment, restore, monitoring, rollback, production host acceptance | Human approvals + QA | R01 checklist, explicit GO/NO-GO |

## Two-day coding kickoff (target, not commitment to ship full SaaS)

**Day 1 — UI foundation vertical slice:** Audit actual Angular app/routes, extract approved Figma tokens and reusable component/variant contract, establish Router layout and SSR-safe theme data model, implement one green Restaurant public menu composition from public fixtures/actual safe DTO; run build, component and source-HTML tests. Do not break existing S01 raw-HTML behavior.

**Day 2 — Second theme + hardening slice:** Add Café variant using the same components, mobile/desktop responsive behavior, AR RTL/EN LTR and key search/empty states; connect stable existing public API path, run E2E/mobile visual comparison and tenant-security regression. Owner/platform can be separate next PRs; do not claim “all SaaS delivered in two days”.

**Ready for next PR only if:** project compiles, exact changed source files are listed, screenshots show no crowding on 320px, tests actually run, and public HTML contains visible menu data without JS.

## Dependencies and agent split

~~~mermaid
flowchart LR
  P0["P0 approvals + baseline audit"] --> Tokens["UI-01 theme components"]
  P0 --> Infra["SSR host/trust decision D-04"]
  Tokens --> Public["UI-02 public menu"]
  Tokens --> Demo["UI-03 marketing/demo"]
  Tokens --> Owner["UI-04 secure owner shell"]
  Owner --> CRUD["UI-05 catalog"]
  CRUD --> Media["UI-06 media/branding/QR"]
  Owner --> Platform["UI-07 platform UI"]
  Public --> SEO["S02/S03 SEO + cache"]
  Infra --> SEO
  Media --> QA["Q01/Q02 cross-system QA"]
  Platform --> QA
  Demo --> QA
  SEO --> QA
  QA --> Release["R01 human release gate"]
~~~

Work packages can be parallelized only on distinct branches and nonconflicting files. Suggested coordination: backend/security/EF ownership with Codex; frontend/Figma visual QA with Antigravity or a dedicated UI agent; reviewer reconciles tests/contracts and controls merge. Do not run unreviewed autonomous merges.

## Definition of Ready

- Accepted FR + US + test identifiers and Figma node reference.
- Existing behavior and API/schema assessed; decisions approved if required.
- One small cohesive change with defined failure cases, security and performance implications.
- Source HTML and frontend/hydration implications assessed where relevant.

## Definition of Done

- Acceptance behavior proved in real code; no tenant regression or leaking public projection.
- AR RTL/EN LTR, 320/360/375/390/412/430/768/1024/1440 evidence for affected UI.
- Automated tests and CI run with commands/exit codes; no invented “passed”.
- Accessibility and source-HTML/SEO gates run on public changes.
- Documentation updated, PR self-reviewed, human approval before merge.
- No production changes, migrations, secrets or deployment without separate authorization.

## Risk-based release checkpoints

**NO-GO** if any of: cross-tenant leak, false public status/canonical, SSR empty shell, security audit high/critical without mitigation, missing hosting/proxy trust approval, unproven backup restore, missing tests, or inaccessible mobile core flow.

**GO** only after Q01/Q02/R01 evidence on actual target staging/production-like environment and explicit human sign-off.

