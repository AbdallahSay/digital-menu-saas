# FIRST PROMPT — use in Codex OR Antigravity (planning only)

You are the engineering lead on a greenfield production-oriented Digital Menu SaaS repository. Read `AGENTS.md` and all `docs/*.md` including `12-SEO-STRATEGY.md` and `13-SEO-PERFORMANCE-GATES.md` before proposing code.

**DO NOT create or modify implementation files in this first task.**

Deliver:
1. Concise requirements summary in Arabic: who, what, MVP exclusions.
2. Feasibility/compatibility check of .NET 10, SQL Server, Angular current stable, SSR Node runtime, same-origin routing/proxy, Node hosting cost/region and dependency pins; list what you VERIFIED vs assumptions. An ASP.NET-only/static host is not silently acceptable for Angular SSR public menus.
3. Proposed repository/module structure, request flow for owner and public menu, authorization & tenant resolution strategy.
4. Top 10 security risks with explicit mitigations and test cases, prioritizing cross-tenant access, insecure uploads, CSRF, secrets, provisioning.
5. SEO-first route/SSR plan: `/r/:slug` indexable raw HTML, `/m/:code` 302 permanent printed QR alias, marketing prerender, admin CSR/noindex, unique metadata/schema/canonical, sitemap, true 404/410, published-only pages, optional real locale routes and Google indexing verification. Performance plan: initial F01 LHCI + raw HTML regression test, image/JS budgets, TTFB cold/warm, Web Vitals p75 and reproducible benchmark methodology; no unmeasured claims.
6. Detailed dependency-aware issue/PR plan mapped to `docs/10-BACKLOG.md`, estimate relative complexity (small/medium/large), suggest vertical slices.
7. All unresolved blocking decisions/assumptions and recommended defaults.
8. Minimum developer workstation prerequisites and verification commands.
9. Approval checklist for Phase F01 including sample live SSR route and green source-HTML assertions (JS disabled), first LHCI baseline, and verified Node SSR-compatible deployment target.
10. Resolve/record conflicts with previous CSR-only documents; do not propose deferring SEO to release. Stop and await review before modifying code.

Constraints: follow MVP scope exactly; no orders/payment/subscriptions. No vague 'secure and fast' claims. No autonomous deploy, paid services, destructive commands, or credentials. Discuss tradeoffs, keep design lean, include short learning notes (Arabic) for owner.
