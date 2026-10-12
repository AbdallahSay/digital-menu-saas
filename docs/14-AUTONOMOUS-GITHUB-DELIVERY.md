# Autonomous Delivery Model — GitHub is the Source of Truth

**Status:** Proposed architecture / bootstrap specification. NOT a live bot or verified integration. Owner approval is required before activating credentials or writing GitHub repository settings.

## Objective
After a one-time configuration, the agents consume fully specified GitHub issues, implement one small dependency-ready ticket at a time, review each other's changes, run independent automated tests, and update GitHub themselves. No per-ticket human-written prompts. Prompts **still exist** as version-controlled templates and task descriptions; nothing is inferred safely from repo name alone.

## Reality and adapters
- **Codex:** `openai/codex-action` can run from GitHub Actions given a prompt or `prompt-file`, and an appropriately configured API credential; can perform review or task work with repo write privileges only in carefully sandboxed runs.
- **Antigravity:** Current official Antigravity SDK (Python) and Gemini API managed Antigravity agents support programmatic/sandboxed invocation; API is preview and must be validated in a minimal proof-of-concept. Do not assume the desktop IDE Agent Manager is an always-on GitHub webhook daemon. Use an independently versioned adapter and a fall-back to manual review when unavailable.
- **GitHub:** Issues, labels, projects, PRs and Actions are the durable state. Actions runners are ephemeral; they are not a permanently running conversation between models.
- Live costs include OpenAI API usage, Google API usage (subject to service quotas), GitHub runners/hosting, preview deployments and infrastructure. Consumer chat subscriptions are not a substitute for API credentials.

## Recommended stages
1. **Bootstrap/Approval (one time):** Human approves PRD, architecture, API contracts, ADRs, permitted model/version, budgets, repo and secrets; tests one single low-risk ticket end-to-end in staging.
2. **Assistive:** Auto-label and select issue, generate work branch/PR, automatically run checks and AI review; human merges. Remains default until measured reliability.
3. **Controlled Autonomy:** Auto-merge low-risk changes after all required CI gates, trusted reviewer status, retry limits, and branch protection; no production deployments. Critical categories always human review.
4. **Release:** Deploy to staging automatically with synthetic tenant data. Production requires protected environment + explicit human approval, migration backup and smoke/runbook.

## State machine
`BLOCKED_BY_DEPENDENCIES` -> `READY` -> `LEASED` -> `IMPLEMENTING` -> `PR_OPEN` -> `CI_RUNNING` -> `PEER_REVIEW` -> (`FIXING`, max 2 loops, or `ACCEPTED`) -> `MERGED` -> `VERIFIED` -> unlock next issue.

Error exits: `HUMAN_REQUIRED`, `SECURITY_BLOCKED`, `UNVERIFIED`, `BUDGET_EXHAUSTED`, `TOOL_UNAVAILABLE`, `RETRY_LIMIT`, `CONFLICT`.

Every state change must be written as an issue comment or GitHub label with run ID, sha, actor, timestamp and short explanation. Labels are convenience only; final validity derives from immutable GH event identifiers, check run conclusions and fresh PR SHA.

## Actor responsibilities
| Actor | Builds | Reviews | Can merge? |
|---|---|---|---|
| Orchestrator (non-LLM controller) | selects ready ticket, locks ID, invokes trusted adapters, records state | validates check and branch status | only permitted low-risk PRs after all gates |
| Codex | backend/security/data/.NET | independent frontend review and tenant API test review | no direct main writes |
| Antigravity | frontend/SSR/mobile/a11y/UX | independent backend contract and SEO review | no direct main writes |
| CI / deterministic gates | none | compiles/tests/linters/secret scan/security/SEO/lighthouse | required status checks only |
| Human | product decisions and incident response | initial architecture, auth/tenant/isolation, data migration, permissions, production | approves protected operations |

No agent can mark its own review as an independent peer review. A review must pin a diff SHA and be repeated after new code changes. A second LLM's approval is not proof of safety; use real tests and manual review for high-risk work.

## Ticket selection algorithm
1. Read `automation/tasks.json` + live issue status. Only select tickets with all dependencies merged; explicitly approved P0; owner `codex|antigravity`; no conflicting path locks.
2. Acquire a single-leader lease using GitHub Actions `concurrency` and a unique issue lease marker / check for open PR. Ensure idempotent restarts.
3. Verify issue author/label operator is trusted, issue template schema valid, low-risk scope; never execute instructions submitted by external issue authors without moderation.
4. Invoke chosen agent via pinned prompt and issue context. Agent creates branch `agent/<task-id>-<run-id>`, changes only allowed paths, opens PR, adds checklist and evidence.
5. Trigger deterministic CI and independent review. If changes needed, reassign fixing agent with bounded loops. Track build artifact/log URLs. Do not trust an agent's claim that a test ran.
6. On verified merge, close related issue and make only newly-unblocked next task READY. Else stop and create `human-required` issue/comment.

## Event design
- `workflow_dispatch`: manual bootstrap/dry-run, validate credentials and connectivity.
- `issues.labeled` using trusted label `ai:approved`: start a ready ticket **after validation**.
- `pull_request`: CI and AI peer review against checked-out merge SHA (read-only review token).
- `workflow_run` or `check_run`: reconciliation; do not use untrusted PR artifacts/scripts with a privileged token.
- `schedule` hourly/daily: recovery of stuck leases, retry reconciliation, budget reporting; not an unlimited self-triggering loop.

## Versioned context
1. `AGENTS.md` (global mandatory rules)
2. `docs/01-PRD.md`, `docs/04-API-CONTRACT.md`, `docs/06-SECURITY.md`, `docs/12-SEO-STRATEGY.md`
3. `docs/07-PERFORMANCE.md`, `docs/13-SEO-PERFORMANCE-GATES.md`
4. `automation/tasks.json` (task and DAG)
5. `.github/ISSUE_TEMPLATE/agent-task.yml` (ticket contract)
6. `automation/AGENT-HANDOFF.md` (immutable proof/evidence format)

## Definition of completion for unattended tasks
Scoped PR linked to exactly one ticket; acceptance criteria implemented; green source-tested checks on correct head SHA; reviewer has no BLOCKER; coverage/evidence attached; no TODO in security pathways; no changes outside allowed scope; safe rollback documented; docs match code; main remains protected. Never equate `PR opened` with `task completed`.

## Architecture decisions
ADR-A1: deploy Angular SSR at runtime for public pages, CSR admin, .NET API separate service behind HTTPS reverse proxy. Any change needs architecture ADR approval.
ADR-A2: tenant enforcement from server-verified membership; negative cross-tenant tests mandatory.
ADR-A3: static GH docs and issues are single source; do not store product requirements in chat history.
ADR-A4: pending Google preview stability: Antigravity failure must leave task pending, not trigger a fake review by the same agent.

## Anti-loop safeguards
Max parallel implementation jobs: 2 (non-overlapping work only); max peer review repair cycles: 2; no auto re-plan of unrelated tickets; no automatic issue creation outside approved task manifest; maximum tokens/cost per ticket configurable; stop after persistent failure; daily spend alert. Never run arbitrary scripts from untrusted issue bodies with write tokens.
