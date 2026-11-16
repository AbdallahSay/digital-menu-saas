# MenuSaaS — System Specification v1

**Status:** DRAFT for owner and engineering review (2026-11-16). This is a documentation baseline, **not** release approval.
**Repository baseline:** main at 8eb7c0ac0b49f48cb7896082c6fc9bd2bdf17ec0.
**Visual design source:** [Approved Premium v2 on Figma](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=7-2). [Implementation handoff](https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe/Digital-Menu-SaaS?node-id=225-2).
**Architecture baseline:** ASP.NET Core 10 + Identity + EF Core 10 + SQL Server; Angular 22 hybrid SSR; modular monolith; shared database with strict tenant scoping.

## Read in order

1. [Scope, actors and glossary](01-SCOPE-AND-ACTORS.md) — what the MVP is and is not.
2. [Functional requirements](02-FUNCTIONAL-REQUIREMENTS.md) — FR identifiers, observable behavior and verification.
3. [Non-functional requirements](03-NONFUNCTIONAL-REQUIREMENTS.md) — measurable security, SEO, accessibility, reliability and performance gates.
4. [User stories and acceptance criteria](04-USER-STORIES.md) — implementation-ready slices with Given/When/Then.
5. [Business rules and state contracts](05-BUSINESS-RULES.md) — invariants and forbidden transitions.
6. [Architecture and data diagrams](06-ARCHITECTURE-DIAGRAMS.md) — context, containers, components, ERD, deployment and trust boundaries.
7. [Process, sequence and state diagrams](07-WORKFLOW-DIAGRAMS.md) — QR, login, catalog, upload, publish, demo and failure cases.
8. [Traceability and tests](08-TRACEABILITY-AND-TESTS.md) — requirement ↔ story ↔ API ↔ test ↔ Figma.
9. [Delivery roadmap](09-DELIVERY-PLAN.md) — phased PR-sized work, Definition of Ready/Done and handoffs.
10. [Decisions, gaps and risks](10-DECISIONS-AND-RISKS.md) — do not silently treat proposals as approved.
11. [API and data contract map](11-API-AND-DATA-MAP.md) — current contract families, screens and pending extensions.
12. [Agent kickoff guide](12-AGENT-KICKOFF.md) — concrete scoped execution process and deliverables.
13. [Machine-readable requirements index](requirements.csv) — 54 FR and 34 NFR records for filtering and issue trackers.
14. [Atomic development board](13-ATOMIC-EXECUTION-BOARD.md) — 144 small dependency-checked Frontend/Backend/QA/Operations tasks, import instructions and subagent execution.

## Precedence and change control

- Approved decisions and actual existing behavior remain in [PRD](../01-PRD.md), [architecture](../02-ARCHITECTURE.md), [data model](../03-DATA-MODEL.md), [API contract](../04-API-CONTRACT.md), [security](../06-SECURITY.md), [SEO](../12-SEO-STRATEGY.md), [test plan](../08-TEST-PLAN.md), [ADRs](../11-ADR-AND-RISKS.md) and [AGENTS.md](../../AGENTS.md).
- This package is a **normalized planning/traceability layer**, not a silent API or schema migration. Where it identifies a discrepancy with the existing contract it marks it **DECISION REQUIRED**, rather than overriding the earlier accepted contract.
- Figma describes the intended UI, **not proof** the API, production environment, integrations, metrics or automation exist. Do not implement unapproved behavior merely because a screen depicts it.
- A change to scope, persistence, security, publication authority, SSR hosting or SEO routing needs a separate, approved ADR/API amendment and test evidence.
- All product code changes require their own PRs and verification. This documentation PR must remain draft and must not be merged or deployed without review.

## MVP acceptance principle

Restaurant customer browses a published, safe, indexable bilingual menu from QR with no login; owner securely edits only their restaurant; platform admin provisions and governs tenants. No ordering, checkout, payments, POS, subscriptions or public self-registration.

## Implementation status snapshot — NOT a production release claim

The repository has F01–F09 backend feature code, S01 SSR foundation, schema and local tests. UI designs extend beyond currently wired Angular feature routes. S02/production hosting and several infrastructure decisions are still open. Existing verification reports describe historical local/CI evidence, not new testing by this documentation update.



