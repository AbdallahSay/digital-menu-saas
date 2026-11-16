# MenuSaaS — Atomic implementation board

## Counts and purpose

A **reviewable, dependency-checked backlog of 144 microtasks**, split by responsibility:

| Lane | Count | Primary agent |
|---|---:|---|
| Planning/decisions | 12 | Product reviewer |
| Backend | 30 | Codex Backend subagent |
| Frontend | 73 | Angular Frontend subagent |
| Quality | 18 | Independent QA/security subagent |
| Operations | 11 | DevOps/release reviewer |
| **Total** | **144** | Max 2 independent implementation agents |

**88 S tasks (target ≤2h), 56 M tasks (target ≤4h).** If actual work exceeds the budget, split the task before continuing. These are sizing targets, not verified completion times.

### Files

- [Canonical board with status and dependencies](../../automation/atomic-backlog/tasks.json)
- [ClickUp spreadsheet import](../../automation/atomic-backlog/clickup-import.csv)
- [Linear import template](../../automation/atomic-backlog/linear-import.csv)
- [Raw planning/backend tasks](../../automation/atomic-backlog/planning-backend.json)
- [Raw frontend tasks](../../automation/atomic-backlog/frontend.json)
- [Raw QA/operations tasks](../../automation/atomic-backlog/qa-operations.json)
- [Subagent execution contract](../../automation/atomic-backlog/TASK-PACKET.md)
- [Board setup and sync guide](../../automation/atomic-backlog/README.md)

Existing [legacy backlog](../10-BACKLOG.md) and [automation/tasks.json](../../automation/tasks.json) are **not** replaced or activated. They represent larger milestone IDs and previously implemented modules. Microtasks start with an audit/reuse-first mode; do not assume previously closed milestone issues mean every visual requirement is complete or rewrite finished code.

## Workflow / status semantics

`BACKLOG → READY → IN_PROGRESS → IN_REVIEW → DONE`, with `BLOCKED` as an explicit exception.

- **BACKLOG:** dependency or acceptance pending. Initial 143 tasks are here.
- **READY:** all dependencies **DONE**, no pending architecture blocker, scope approved. Initially **PM-001** only.
- **IN_PROGRESS:** one named subagent owns a branch and is running the bounded task.
- **IN_REVIEW:** agent produced draft PR, exact test evidence, and reviewer is checking.
- **DONE:** evidence accepted and PR merged; for approved *audit-only* or *decision* tasks, reviewer approves documented evidence and a record link. **No code write is necessary for an existing verified feature.**
- **BLOCKED:** unmet ADR, CI failure, scope conflict, missing environment or risk; record reason and next action.

Never mark DONE based on a Figma screenshot, passing build alone, or the agent's statement. The board status is the single source of truth **after it has been imported** into the selected live project tracker. JSON/CSV on this branch are the versioned *initial snapshot*, not a two-way sync.

## Frontend versus backend work

- FE tasks modify `frontend/**` and affected frontend tests only, unless a reviewed cross-team exception.
- BE tasks modify `backend/**` and corresponding .NET/SQL tests only, unless a reviewed API coordination exception.
- QA tasks primarily add or run tests and reports; security QA is independent from implementer.
- PM tasks are requirements/decision artifacts; OPS tasks handle controlled staging, never production autonomously.
- Two agents may run in parallel only if all dependencies are DONE **and** affected files, contracts and branch/worktree boundaries do not conflict.
- One agent receives exactly **one Task ID** per run. Do not batch unrelated tasks into one prompt/PR.

## Minimal-credit visual verification policy

| Work type | Normal verification | Figma/screenshots |
|---|---|---|
| Backend/API/schema/tenant guard | Targeted unit/SQL/API tests and contract diff | None |
| Existing Angular component audit | Source inspection + component tests | None unless ambiguous visual constraint |
| Small Angular logic/error-copy fix | Component test + local preview / DOM assertions | No full screenshot sweep |
| First build of a **new component family** | Unit/accessibility check + representative Figma comparison | One mobile and one desktop representative, not every state |
| Complete Public / Owner / Platform family checkpoint | Playwright + AR/EN/320–1440 representative screens | Consolidated screenshots only for affected family (FE-029, FE-059, FE-073) |
| Final QA/release | Accessibility, SEO/SSR, security, performance and agreed browser matrix | Full regression *once* at final gate and only where changed |

**Never save credits by skipping real security/SSR tests.** Prefer static code/token reads and component tests over paid Figma screenshots. A failed targeted visual comparison permits an additional screenshot of the actual defect, not a full file sweep.

## Initial next tasks

1. **PM-001 READY**: audit actual main SHA, prior implemented issues and current PRs (no code changes).
2. After PM-001 is DONE, **PM-002, PM-003, BE-001, FE-001** become candidates for READY; run FE-001 and BE-001 concurrently only if scope/branch separation is confirmed.
3. PM-004, PM-005, PM-007 and further decision tasks gate persistent theme, publication permission and deployment respectively.
4. Implement FE Design Foundation as microtasks FE-002…014, then a public menu *vertical slice*, not all screens at once.
5. Reuse completed F01–F09/S01 modules where verified; prioritize remaining UI and blocker fixes.

## Acceptance checklist (every task)

- [ ] Agent read one task, its dependencies and exact relevant current source (not the entire repo history every time).
- [ ] Existing implementation audited; work mode selected: AUDIT, REUSE, FIX or BUILD.
- [ ] Scope restricted to a few related files; conflicts checked against other agent.
- [ ] Both specific acceptance criteria met.
- [ ] Relevant tests actually run and results/caveats recorded.
- [ ] No tenant leak or invalid-publication/SEO/privacy regression.
- [ ] Draft PR or approved audit/decision evidence linked to task.
- [ ] Independent review and accepted completion evidence.
- [ ] Only then update issue status to DONE and unblock dependents.

