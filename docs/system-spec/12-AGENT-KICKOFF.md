# 12 — Agent implementation kickoff (Codex / Antigravity / reviewer)

This is a **copyable execution contract for a coding agent**, not authorization to merge, deploy, modify production, migrate a live database or relax security. Follow [AGENTS.md](../../AGENTS.md) and the accepted ADR/API contracts above this planning package.

## Mandatory inputs for the agent

1. Repository: AbdallahSay/digital-menu-saas, base branch main; inspect HEAD and open PRs before choosing an isolated branch.
2. Approved visual direction: [Figma Premium v2](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=7-2), [Design System/Theme variants](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=103-2), [Implementation Handoff](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=225-2).
3. Product scope: [FR](02-FUNCTIONAL-REQUIREMENTS.md), [NFR](03-NONFUNCTIONAL-REQUIREMENTS.md), [stories](04-USER-STORIES.md), [business invariants](05-BUSINESS-RULES.md), [diagrams](06-ARCHITECTURE-DIAGRAMS.md), [workflows](07-WORKFLOW-DIAGRAMS.md).
4. Source of truth: root README, docs/01-PRD.md, 02-ARCHITECTURE, 03-DATA-MODEL, 04-API-CONTRACT, 06-SECURITY, 08-TEST-PLAN, 10-BACKLOG, 11-ADR-AND-RISKS, 12-SEO-STRATEGY and 18/19 unresolved architectural plans.
5. Traceability: [T-001..T-020](08-TRACEABILITY-AND-TESTS.md); do not invent current CI status or tests.

## First coding PR recommended: UI-01 Premium v2 design foundation

**Goal:** Implement reusable Angular view primitives and actual two-theme visual contract, preserving all existing S01 public SSR behavior. Do **not** build the entire SaaS in one PR.

**In scope:** Colors/spacing/typography tokens; Restaurant/Café theme variants; theme-aware primary/secondary buttons, category chips, menu card, availability indicator, basic dialog/form error; RTL/LTR support; responsive 320/360/375/390/412/430/768/1024/1440.

**Out of scope for first PR:** New SQL ThemeId migration or owner restaurant-level publish endpoints without decisions D-01/D-02; changes to sessions, public resolver, slug namespace, production hosting, tenant isolation, or media storage unless reviewed and explicitly scoped.

### Step-by-step instruction to the coding agent

1. Read the repository and Figma directly. Identify currently implemented Angular routes/components and constraints. Report confirmed facts versus gaps, with file paths.
2. Check the actual Figma variants/variables. Preserve Premium v2 layouts and the approved Restaurant/Café identity (Restaurant #0F766E; Café #6B402B) across cards, buttons, price and category controls. Keep semantic status colors independent. **Do not use a generic UI kit as a design replacement**.
3. Propose a small component architecture and list the exact files to edit. Do not change requirements, API or schema silently.
4. Implement only the chosen slice on a separate branch. Keep public menu SSR content and title/canonical intact; prefer reusable Angular components rather than one implementation per Figma frame.
5. Test with production build: component/visual snapshots at all listed widths, Arabic/English including bidi values, keyboard/focus/44px interactive targets, source HTML/SEO checks and relevant existing security checks. Record actual output or NOT RUN.
6. Self-review: no cross-tenant privilege expansion; no false publish/save flow; no order/pay/cart controls; no hidden draft content in anonymous HTML; no new secrets in repo.
7. Open a **Draft PR** with FR IDs, US IDs, T IDs, exact Figma nodes, changed files, executed commands/results, screenshots and unresolved issues. Do not merge or deploy.

### Explicit deliverable template

- Scope: UI-01, selected FRs/USs/T IDs and Figma nodes.
- Baseline: branch and commit SHA.
- Source inventory: what already existed vs new.
- Changed files: complete list.
- Visual proof: side-by-side AR/EN 320/390/768/1024/1440 and no clipped text.
- Automated proof: exact test commands, exit codes, and raw HTTP HTML assertions if public.
- Security: tenant/CSRF/role impact and negative test outcomes.
- Performance: measured build size and SSR/hydration impact or NOT RUN.
- Decisions: D-01/D-02 left unchanged; documented if blocking.
- Outcome: READY FOR REVIEW or NO-GO, never unverified “production ready”.

## Suggested division without conflicts

Codex: backend, identity/security, relational integrity, API contract and tests; Angular public SSR integrity review.

Frontend agent/Antigravity: Figma code mapping, Angular theme components, AR/EN responsive UI, Playwright visual/e2e evidence.

Reviewer: reconcile source-to-code parity, check cross-tenant test results, benchmark claims and staging impacts. **Never have two agents edit the same shared branch or uncommitted worktree simultaneously.**

## Start-of-work checklist

- [ ] Base SHA and existing open PRs verified
- [ ] Chosen story and FR/NFR/T IDs written down
- [ ] Figma source frames and component variants inspected
- [ ] D-01/D-02 not assumed resolved
- [ ] Scope excludes ordering/payment/self-signup
- [ ] 320px and Arabic text wrapping included
- [ ] Public route returns real raw HTML
- [ ] Tenant authorization/security regression tests included
- [ ] Evidence available, no fabricated pass claims
- [ ] Draft PR only; no merge/deploy/production edits

