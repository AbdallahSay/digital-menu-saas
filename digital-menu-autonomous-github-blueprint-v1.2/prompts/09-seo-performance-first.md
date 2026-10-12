# MANDATORY FIRST PROMPT — SEO / PERFORMANCE ARCHITECTURE AUDIT

Use with Codex (primary), then ask Antigravity to critically review it on a separate branch/worktree. READ AGENTS.md, README.md, docs/01-PRD.md, docs/02-ARCHITECTURE.md, docs/07-PERFORMANCE.md, docs/11-ADR-AND-RISKS.md, docs/12-SEO-STRATEGY.md and docs/13-SEO-PERFORMANCE-GATES.md.

**PLAN-ONLY for first run. Do not edit application code until explicit approval.**

Our users may arrive by QR or Google Search. SEO and performance are non-negotiable from Day 1, and real-world performance must be measured. We explicitly reject a CSR-only indexable restaurant shell and deferment of SEO to release. Produce:

1. Architecture diagram & route matrix: marketing SSG, `/r/:slug` Angular SSR+hydration, `/m/:immutableCode` same-origin 302 -> current canonical, admin CSR/noindex, `/api` ASP.NET .NET10, SQL Server, tenant-aware safe public menu projection. Correct public status codes.
2. Hosting feasibility matrix comparing SSR-capable deployment (Node runtime + .NET API + reverse proxy), with required hosting, process lifecycle, region latency, TLS, operational costs, cache, and clear blockers. Do not assume current static or ASP.NET host supports Node; if infeasible, propose an explicit server-rendered alternative for human review, NOT CSR fallback.
3. Detailed source-HTML SEO contract: restaurant title/description, semantic H1/category/item content, canonical, schema `Restaurant`, sitemap, robots/noindex, old slug redirect, localization and verified Search Console after launch. Truthful data only.
4. Security: SSR cross-request/tenant bleed, untrusted JSON-LD escaping, redirect validation, cache key isolation, admin response leakage, authentication cookies/CSRF, cross-tenant negative tests.
5. Performance budget and instrumentation: mobile CWV field targets, Lighthouse CI >=3 runs production build, cold/warm SSR TTFB, API load p95, media pipeline, `NgOptimizedImage`, JS budgets, HTTP transfer cache with public GETs only, content versioning/invalidation.
6. The EXACT F01 fixture/test list demonstrating the HTML contains restaurant+item without JS; correct status, canonical and first LHCI baseline. Propose scripts/commands and expected fixture outputs, never claim execution if unrun.
7. Concrete implementation issue breakdown, tradeoffs, and key human approval decisions. Mark each VERIFIED, ASSUMED or BLOCKED.

Wait for review. Do not deploy, buy services, access secrets or execute destructive actions.
