# Digital Menu SaaS — Agent Handoff Pack

**Version:** 1.1 / 2026-10-12 (SEO + performance first)  
**Status:** Approved planning baseline; no implementation or measurements claimed.

## Mission
Build a secure, measurable, maintainable multi-restaurant QR digital menu SaaS. **MVP is display-only**: no online orders, POS, checkout, payment, delivery, subscriptions, or consumer accounts.

## Chosen architecture
- Backend: ASP.NET Core 10 / C#, EF Core 10, SQL Server, Identity, REST/OpenAPI.
- Frontend: Angular (choose current stable compatible release when bootstrapping); responsive mobile-first, RTL Arabic default and optional English.
- Hosting baseline: Angular HYBRID SSR from the FIRST implementation: public `/r/:slug` menu content server-rendered + hydrated, platform marketing prerendered, `/admin` and `/platform` CSR. An SSR-capable Node runtime and .NET API share one PUBLIC origin through routing/reverse proxy. Production hosting must be compatible BEFORE coding; static-only hosting is not accepted for the public Angular SEO path. Document cost, cold starts, regional latency, and failure modes; if Node SSR hosting is infeasible, obtain human approval for a separate server-rendered public alternative before scaffolding (e.g. ASP.NET Core Razor public views while Angular admin remains CSR).
- Data: shared SQL Server DB, explicit tenant isolation, server-side authorization.
- Admin: platform administrator creates restaurants and owner accounts; owners manage their own menus. No public registration in MVP.

## Critical reading order for either AI coding agent
1. `AGENTS.md` — binding constraints and Definition of Done.
2. `docs/01-PRD.md` — product requirements and exclusions.
3. `docs/02-ARCHITECTURE.md` and `docs/03-DATA-MODEL.md` — boundaries and storage.
4. `docs/04-API-CONTRACT.md` and `docs/05-UX.md` — user-facing contracts.
5. `docs/06-SECURITY.md`, `docs/07-PERFORMANCE.md`, and `docs/12-SEO-STRATEGY.md` — launch and per-PR gates.
6. `docs/08-TEST-PLAN.md`, `docs/09-DEVOPS.md`, `docs/10-BACKLOG.md`.
7. `docs/11-ADR-AND-RISKS.md` — architectural tradeoffs/open questions.
8. `docs/13-SEO-PERFORMANCE-GATES.md` — automated tests and acceptance evidence.

## How to start
- **Do not ask an agent to build the entire SaaS in one prompt.**
- Start with `prompts/00-plan-only.md`; require a proposed plan and unanswered decisions; **no code**.
- Then give one prompt at a time from `prompts/01-foundation.md` through `prompts/07-release-readiness.md`. Each requires demonstrable tests before acceptance.
- For the cross-agent review process, use `prompts/08-review-another-agent.md`.
- Never grant automatic permission for production deploys, destructive DB migrations, exposure of secrets, or reading unrelated user files.

## Suggested division of work
- Codex: backend, database, security, tenant isolation, API tests.
- Antigravity: design review, Angular implementation, browser-based UX/e2e test reports.
- One feature per small branch/PR. Never let both agents change the same branch/worktree simultaneously.

## Proof of completion
Each agent's final report must identify changed files, decisions, tests and their actual exit codes, security implications, benchmark methodology/results (if applicable), known gaps, and how a human can reproduce verification. Say **NOT RUN** instead of inventing evidence.

## Day-one mandatory gates
- First vertical slice proves public `/r/:slug` delivers restaurant name and first visible item in the raw **HTTP HTML response** with correct title/canonical/200, even without JavaScript.
- Lighthouse CI and deterministic HTML SEO checks are present with the first public route; never defer them to prelaunch.
- QR stable `/m/:publicCode` is a one-hop temporary redirect to the canonical slug page; this trades one redirect for human-readable indexable URLs and stable printed codes. Evaluate QR navigation timings.
- Launch requires realistic production/staging mobile benchmarks and measured tenant-aware cache invalidation.

## Scope freeze
Adding ordering/WhatsApp ordering, payment, subscription billing, or analytics requires a separate change request after MVP.

## Autonomous GitHub execution (v1.2 blueprint)
See `docs/14-AUTONOMOUS-GITHUB-DELIVERY.md`, `docs/15-AUTOMATION-SECURITY-AND-APPROVALS.md`, `docs/16-GITHUB-BOOTSTRAP-RUNBOOK.md` and `automation/tasks.json`. These are **proposed operational contracts**, not a running integration. A one-time repository/credential/permissions setup and sandbox end-to-end test are prerequisites.
