# F02/F03/F04/F05 — Persistence, Identity and Tenant Isolation (Codex preferred)

Read `AGENTS.md`, docs 02/03/04/06/08/10. Work in separate PRs **F02, then F03, then F04, then F05**; do not implement all simultaneously. Begin by proposing F02 plan, await code review/approval checkpoint for each subsequent PR.

F02: SQL Server EF Core schema + migrations + integrity constraints + two-tenant fixtures; prove foreign tenant Category->Item insert violates constraint.
F03: ASP.NET Core Identity same-origin cookie auth; anti-CSRF for unsafe methods, lockout/rate limits and safe bootstrap; no hardcoded production secrets.
F04: privileged platform admin provisioning/suspension with safe onboarding and audit.
F05: server-resolved active tenant membership, authorization and negative isolation tests for query/write/media paths (where present); no tenantId trusted from owner API inputs.

Evidence for each PR: changed files, SQL migration review, tests against actual SQL Server provider, unauthorized/cross-tenant test outputs and what was NOT RUN. Document cookie security and CSRF integration clearly. Stop on risky unapproved operations.
