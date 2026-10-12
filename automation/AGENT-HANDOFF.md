# Agent-to-agent protocol

Exchange durable evidence through GitHub issue and PR artifacts, **not conversational memory**. The implementer posts PR description using `.github/pull_request_template.md` with:
- `Task ID`, issue link, branch, exact commit SHA, changed file paths
- Why the change exists and implementation summary
- API/schema/SSR/security/performance changes
- Tests **actually executed** (command, environment, exit status, log/artifact URL) and NOT RUN exceptions
- Screenshots or a11y evidence for UI; raw SSR HTML/HTML metadata assertions and LHCI report for public route
- Unresolved risks and explicit review request to different agent

Reviewer fetches diff and fresh base/head SHAs, checks spec and risky surfaces, runs independent test(s) where permissions allow, and responds with one of:
- `APPROVE` (with HEAD SHA, exact checks and limitations),
- `REQUEST_CHANGES` (file:line, severity, reproduction, suggested test),
- `BLOCKED` (reason and `human-required` label).

If a new commit lands, previous review is stale and must not authorize merge. The orchestrator validates review identity, scope, SHA, deterministic CI, timeout, budget, branch protection and high-risk file list. Agent comments alone never count as completed CI. Keep retries <= 2. If back-and-forth stalls, stop.

### Only machine-readable action contract (example)
```json
{"task_id":"F01","reviewed_head_sha":"<sha>","decision":"REQUEST_CHANGES","blockers":[{"path":"frontend/src/...","severity":"HIGH","detail":"Missing SSR canonical"}],"evidence_urls":["https://github.com/org/repo/actions/runs/123"]}
```
Do not treat a language-model-generated JSON assertion as an actual GitHub status check.
