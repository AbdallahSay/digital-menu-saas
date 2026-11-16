# Bounded one-task subagent job packet

Use exactly **one** canonical entry from [tasks.json](tasks.json) per invocation. No autonomous work queue, vague "complete UI", continuous browsing or repeated Figma screenshot capture.

## Coordinator / dispatcher

1. Read `automation/atomic-backlog/tasks.json` and the current external board status.
2. Select the first READY issue with **all depends_on statuses DONE**; avoid parallel write conflicts; at most 2 implementation jobs.
3. Detect whether the task is already implemented or only partly implemented, by inspecting its specific files and tests. If fully verified, submit an **audit-only** evidence report for human review instead of rewriting it.
4. Pack ONLY task title, 2 ACs, dependency outcome links, relevant FR/US IDs, task-scope file paths, accepted Figma source links if UI, security notes and current base SHA.
5. Assign one role-specific subagent with its own isolated worktree/branch (e.g. `feat/FE-006-category-chips` or `fix/BE-013-concurrency`).
6. Gate PR/test/approval. An unrelated new failure should spawn its own linked task; do not silently expand scope.
7. When task is DONE, record reviewer/PR link/test evidence/merged SHA; then recompute READY from dependencies. On failure set BLOCKED with reason.

### Coordinator mini-prompt (send only concrete task metadata)

```text
You are the MenuSaaS coordinator. Pick exactly one READY atomic task
from automation/atomic-backlog/tasks.json whose dependencies are DONE.
Inspect current code before implementing; avoid redoing already present features.
Use one isolated branch and one subagent, bounded to task acceptance.
Max concurrent agents = 2, only when source scopes and dependencies are independent.
Do not launch visual screenshot loops or broad migrations.
Return Task ID, status, audit findings, exact file scope, tests run,
evidence URL, PR URL and blockers. Never merge or deploy automatically.
```

## Frontend subagent

- Read approved Figma Premium v2 **once per new component family** and reuse existing tokens/variants.
- Work only on selected `FE-* ` task; use shared Angular 22 components, preserve SSR raw HTML/SEO and no ordering/pay.
- Test affected interactions, RTL/LTR, focus, mobile width and semantic status. Screenshots only for new family/visual regression checkpoints or a concrete defect.
- Never implement unapproved owner publication privilege or ThemeId persistence; those require decisions.

## Backend subagent

- Work only on selected `BE-* ` task. Prefer audit-and-fix, not reimplementation of F01–F09.
- Enforce server-derived tenant, CSRF, Identity cookie, composite tenant FKs, 412 concurrency, status projection, media content validation.
- No frontend redesign, production SQL changes or data migrations without explicit approved ADR.
- Real SQL negative tenant tests mandatory for security-relevant work.

## Independent QA subagent

- Read PR diff pinned to exact HEAD SHA; execute relevant changed tests and negative failure paths.
- Reject fabricated test passes, unsupported claims, skipped SSR source HTML or cross-tenant cases.
- Does not silently edit same implementation branch to "help"; report actionable findings.

## Completion report format

```md
Task ID:
Current status:
Base SHA / Head SHA:
Audit existing code: implemented | partial | missing (with file lines)
Changes made (exact paths):
Acceptance criterion #1: PASS / FAIL / NOT RUN + evidence
Acceptance criterion #2: PASS / FAIL / NOT RUN + evidence
Verification commands + exit codes:
Security / SSR / RTL impact:
Figma comparison: NOT NEEDED | family-level evidence (only if UI)
PR URL:
Reviewer:
Decision/blocker:
Recommendation: READY FOR REVIEW | BLOCKED | AUDIT ONLY
```

## Budget and stop conditions

- S target ≤2 hours of developer-equivalent work, M ≤4 hours; split task if it is unexpectedly broad.
- No arbitrary repeated screenshots, huge Figma full-file dumps, repeated dependency scans or unbounded self-repair loops.
- First failure: one targeted diagnosis + repair and rerun; second unresolved failure: mark BLOCKED with reproducible evidence. Existing legacy automation has max 2 repair cycles.
- Never auto-merge high/critical change, never deploy or modify production.

