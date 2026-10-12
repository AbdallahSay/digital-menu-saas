# Runtime operation contract

**IMPORTANT:** This pack contains the architecture and task data for automation. It does NOT contain an activated autonomous runner, API credentials, or verified GitHub Actions implementation of either agent. See `docs/16-GITHUB-BOOTSTRAP-RUNBOOK.md`.

## Why the project cannot run without any prompting anywhere
Official `openai/codex-action` requires `prompt` or `prompt-file`; Google agent interactions also take a task instruction. The goal is **zero prompts typed by the owner per task**, not zero instructions to models. The central orchestrator assembles a bounded job instruction from pinned instructions + approved task + relevant code + acceptance checks. Preserve exact prompt/config SHA in audit report.

## Task dispatch pseudo-contract
```text
on approved_issue_or_prior_merge:
  acquire lease
  validate trusted label/actor, manifest, dependency DAG, scope, quota, risk
  choose issue with lowest approved sequence whose dependencies MERGED
  load versioned AGENTS.md + docs + task specification
  trigger Codex GitHub Action OR Antigravity SDK/API adapter
  verify branch and PR opened against correct issue and base SHA
  await actual CI status checks + cross-agent review pinned to PR head SHA
  if fail: retry max twice with scoped feedback, else human-required
  if pass and low risk and autopilot authorized: auto-merge
  else request human approval
  on merged: close issue, release lease, unlock next approved issue
```

Safe recovery: if adapter absent, preview unavailable, request times out, CI cannot execute, or budget exceeded, label `ai:blocked` and do not merge or claim completion.
