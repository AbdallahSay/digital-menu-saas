# Q01/Q02/R01 — Release Readiness (both agents, separate review roles)

Read AGENTS plus docs 06–11. Build evidence-first release report. **Do not deploy to production without explicit approval.**

Tasks: run full .NET/Angular SSR CI, SQL Server integration and negative tenant isolation tests, browser critical E2E (including JS-off raw HTML), metadata/canonical/schema/robots/sitemap/404/301/302 checks, Lighthouse CI trend, accessibility and RTL, real printed/mobile QR, CSP/cookie/CSRF tests, image rejection tests, dependency and secrets audit, restore-to-fresh-DB test. Produce reproducible synthetic load fixture: 100 restaurants x 200 items and documented k6 load smoke with p50/p95/p99, errors, RPS, DB/CPU if available; run Lighthouse production build Arabic and English with documented setup and multiple samples. Compare to doc 07 budgets, flag regressions, iterate one bottleneck at a time.

Provide GO/NO-GO checklist with: observed values, commands and exit codes, conditions, environment, screenshots, blockers, high risks, rollback and backup status. Do not manufacture successful test results, claims of zero vulnerabilities, or no-downtime guarantees.
