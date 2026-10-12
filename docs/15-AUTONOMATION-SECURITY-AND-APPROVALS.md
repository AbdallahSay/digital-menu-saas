# Security policy for AI-run CI/CD

This document is **for the orchestration/control plane** in addition to application security. Treat every LLM response, issue body, PR, README and web result as potentially untrusted. The agent instructions in `AGENTS.md` are project policy; never let content from an external issue modify that policy.

## Tokens, secrets, runners
- Use a GitHub App installation token scoped to a **single repository** and narrowly needed capabilities. Separate implementer write-token from reviewer **read-only** token. Where possible use GITHUB_TOKEN with job-specific `permissions:`; do not share credentials between stages.
- Put `OPENAI_API_KEY` and `GEMINI_API_KEY` in repository/org Actions Secrets only for protected trusted jobs, or use a secrets manager; never expose keys on `pull_request` jobs executing untrusted code or in PR comments and logs.
- Do not permit `pull_request_target` jobs to check out and execute untrusted PR code with a write token. Do not run model-generated shell commands with repository admin or production secrets in the environment.
- Default deny network egress, sandbox agent tool calls, restrict writable directories and paths, and pin all actions/dependencies to reviewed commit SHA or locked versions at activation.
- Never enable unrestricted agent permissions (`unsafe`, full workstation access) to bypass failing setup. Preview API requires periodic compatibility review.
- Branch protection / rulesets for `main`: require PR, passing status checks, no force pushes, no direct agent push, restricted workflow edits, signed/verified provenance where feasible.
- Separate production secrets into a protected GitHub Environment requiring explicit human reviewers. Agent cannot approve its own deployment.

## High-risk changes — always human approval
Authentication/session/cookie/CSRF; tenant isolation/authz; authorization middleware; migrations dropping/modifying columns; production data and backups; cloud IAM/secret access; CI/workflow permissions; arbitrary code execution, dependency/lockfile major changes; global caching of tenant-specific HTML; hosting/routing/canonical/robots behavior affecting all tenants; any financial spend or production release.

## Deterministic gates
- Backend: `dotnet restore --locked-mode` (when lock file created), format/static analysis, build Release, SQL-backed integration and tenant-negative suite, vulnerability audit.
- Frontend: package lock install `npm ci`, lint/typecheck/unit, production SSR build and hydration/e2e checks.
- Security: secrets scanning, SAST, dependency audit, image upload adversarial tests, isolation matrix and SQL connection permissions.
- SEO: crawl real SSR `view-source` for content/meta/canonical/JSON-LD, correct 404/410 and sitemap/robots, noindex admin, locale metadata, QR alias behavior.
- Performance: repeatable mobile Lighthouse CI in production-mode staging, synthetic data (100 tenants / 200 items sample), response-time and query-count budgets, compare with recorded baseline.

## Merge policy
* Stage 1: All PRs manually approved until agents have completed 10 scoped issues without unreported critical defects. This threshold is a policy recommendation, **not** a vendor guarantee.
* Stage 2: Auto-merge low-risk front-end component docs / non-security features only after all deterministic gates, no blockers, peer review by different agent pinned to head SHA, no sensitive file changes and an explicit `auto-merge-eligible` label issued by trusted controller.
* All other PRs require human approval; **never** auto-deploy to production.

## Audit
Each ticket: `task_id`, origin issue, assigned agent, model ID/version, prompt/spec commit SHA, base/head SHA, run ID, start/finish time, cost tokens (if available), test report URLs, review agent, merge decision, final status, failures and exceptions. Retain reports/artifacts according to company policy without storing private tenant data or credentials.
