# One-time GitHub bootstrap for autonomous work

Status: **NOT CONFIGURED** until the following items are completed on the actual repository. No repository or credentials have been connected by this documentation package.

## 0. Approve product and hosting
- Repository owner confirms name, private/public, licensing, CI usage allowance and whether production deployment is in scope.
- Approve PRD, architecture ADR-A1 (SSR-capable Node host), security boundaries, cost ceilings.
- Keep `.github/workflows/` edits on manually approved PRs.

## 1. Create or select repo and upload handoff pack
- Upload all root files and directories, including `AGENTS.md`, `docs/`, `automation/`, `.github/`, `prompts/`.
- Do not upload live secrets, user data, or archived zip itself into repo unnecessarily.
- Check repository has the expected default branch (`main`).

## 2. Protect branch & environments
- Ruleset: PR required, required CI statuses, prevent force pushes/deletes, do not permit agents to bypass. Create staging and protected production environments.
- Add labels `ai:approved`, `ai:ready`, `ai:leased`, `ai:implementing`, `ai:needs-review`, `ai:blocked`, `ai:human-required`, `ai:done`, `auto-merge-eligible`, `risk:high`.
- Enable appropriate repository security scanning, Dependabot alerts and dependency review if available.

## 3. Configure identities/credentials
- Codex GitHub Action: secure OpenAI API key in Actions secrets; provider bills independently from a ChatGPT subscription. Review official `openai/codex-action` docs and pinned SHA.
- Antigravity adapter: Gemini API key (for the SDK or managed agent) as a secret, separate least-privileged GitHub App credentials if needed, and a verified proof-of-concept in a sandbox. Preview APIs may change.
- GitHub App (preferred) for branch/PR/issue operations with minimum necessary rights; read-only reviewer token and limited write token. Never let protected production credentials enter agent runtime.
- Configure max cost, max parallel tasks, max repair attempts and alerts; fail closed when unknown.

## 4. Proof-of-concept (before autonomous activation)
- Use dry run F01 documentation-only variant, not a live app or prod deployment.
- Verify that one approved GitHub Issue can start one bot run, open a branch/PR, trigger actual CI status checks, invoke the other agent for read-only review, post evidence, and stop without merge.
- Simulate bot failure and unsafe issue text; verify no credential leak, no unexpected merges, and safe re-run.
- Record run URLs and SHA, then enable controlled pilot of one ticket at a time.

## 5. Load manifest and activate dispatcher
- Seed issue descriptions from `automation/tasks.json`. Ensure dependencies in GitHub issue bodies match the manifest; do not derive work from ambiguous free-text comments.
- In phase 1 the event dispatcher can be an orchestrator service or GH Actions. GitHub Actions does **not** automatically invoke the AI coding platforms without explicit adapter implementation and credentials.
- Reconcile status at least daily, enforce one leased issue per conflicting path group.
- Activate carefully. CI skeleton for quality gates must be adapted after F01 scaffold; do not mark placeholder commands successful.

## 6. Gate to stage 2
- Verify 10 completed low-risk tickets with documented tests and no critical misses, then propose branch protection/ruleset change through human reviewed PR.
- Only allow low-risk auto-merge when review + required deterministic tests are green on the current commit SHA. Never auto-merge workflows, auth, security, production and data migrations.

## 7. What to ask the user for to activate in their GitHub account
- Repository URL or approval to create a new repo under specified owner.
- Owner to connect authorized accounts and store required API credentials **in GitHub Secrets**, without pasting them into chat.
- Host/budget decision (including Node SSR host + SQL + image storage) and explicit approval of the first architecture milestone.
