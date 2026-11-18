---
description: Pick the next launch phase, explain it in Arabic, then implement it end-to-end and open a PR
argument-hint: "[preview | fix | P07]"
---

You are running the MenuSaaS launch track. Arguments: `$ARGUMENTS`
- empty      -> brief the owner on the next phase, then implement it.
- `preview`  -> brief only; change nothing.
- `fix`      -> address review comments / failing CI on the open phase PR.
- `Pxx`      -> work on that specific phase (only if its dependencies are done).

Talk to the owner in Egyptian Arabic. Keep code, identifiers, commits and PR text in English.

## Step 1 — Sync and find where we are

1. Run `git status --porcelain`. If there are uncommitted changes that do not belong to an
   in-progress `claude/Pxx-*` branch, stop and tell the owner what is dirty. Never discard work.
2. `git fetch origin --prune`. Read `launch/state.json` and `launch/DECISIONS.md` **from `origin/main`**
   (`git show origin/main:launch/state.json`), not from a stale local copy.
3. Selected phase = the lowest-numbered phase with `status: "todo"` whose `depends_on` are all
   `done` (or the `Pxx` argument, after checking its dependencies).
   If none are left, congratulate the owner, summarize what shipped, and stop.
4. Look for existing work on it:
   - `gh pr list --head claude/<id>-<slug> --state open --json number,url,isDraft,reviewDecision,statusCheckRollup`
   - If an **open PR** exists: report its CI status and review state in Arabic.
     - If the argument is `fix`: read the review comments (`gh pr view <n> --comments`) and failing
       check logs (`gh run view --log-failed`), fix them on that branch, re-verify, push, and stop.
     - Otherwise tell the owner: «الـPR ده لسه مستني مراجعتك. اعمل merge لو تمام، أو اكتب `/nextphase fix`
       لو فيه تعليقات.» and stop. Never start the following phase while this one is unmerged,
       and never merge it yourself.
   - If a local or remote branch exists without a PR: resume from it (read its commits and
     `launch/verification/<id>.md` to see what is already done).

## Step 2 — Brief the owner (always, before touching code)

Read the phase file (`file` in state.json) completely, then post one Arabic message:

```
## المرحلة <id>: <title_ar>
**الهدف:** جملة واحدة.
**هنفذ إيه:** 3–7 نقاط واضحة لصاحب بيزنس.
**الملفات/الأجزاء اللي هتتأثر:** Backend / Frontend / Database / Docs.
**هتعرف إنها خلصت إزاي:** معايير القبول بلغة بسيطة.
**محتاج منك:** القرارات الناقصة أو «ولا حاجة».
**حجمها:** صغيرة / متوسطة / كبيرة.
```

If the argument is `preview`, stop here.

## Step 3 — Gates (stop and ask, never guess)

- For every decision ID in the phase's `decisions` whose status in DECISIONS.md is `open`, ask the
  owner with AskUserQuestion (recommended default first, labelled «(مقترح)»). Record each answer in
  `launch/DECISIONS.md` (status `decided`) as part of this phase's branch.
- If `approval_gate` is true, ask for an explicit «موافق» before any step that touches a real server,
  domain, DNS, production data or secrets. Without it, prepare everything and stop.
- If the phase file and repo docs conflict, explain the conflict in one paragraph and ask which wins.

## Step 4 — Implement

1. Branch from fresh main: `git switch -c claude/<id>-<slug> origin/main` (or resume the existing branch).
2. Follow `AGENTS.md` and `CLAUDE.md`. Plan the work as a todo list built from the phase's
   "Scope" and "Acceptance criteria", then build it in small, coherent commits
   (`<id>: <what>` messages).
3. For each UI screen, read its Figma frame through the Figma MCP (`get_design_context` /
   `get_screenshot` with file key `8kUunvUTX27tuIJcWLrXDe`) before writing the component, and reuse
   `frontend/design/tokens.css` and existing components.
4. Database changes: additive EF Core migrations only, reviewed SQL script committed with them.
   Never apply migrations anywhere except the local/test database.
5. Keep the phase inside its scope. If you discover necessary work outside it, add it to the
   "Follow-ups" section of the verification file instead of doing it.

## Step 5 — Verify (real commands, real exit codes)

Run the `/verify` checklist for everything the phase touched, plus the phase's own "Tests"
section. Then launch the review subagents in parallel on the branch diff:
`security-reviewer`, `logic-reviewer`, and `ux-reviewer` when UI changed.
Fix every confirmed blocking finding, and re-run the affected checks.
Write `launch/verification/<id>.md` with: summary, files changed, commands + exit codes,
NOT RUN items with reasons, reviewer findings and how they were resolved, manual test steps
for the owner, follow-ups.

Never mark a failing or skipped check as passed. If something cannot run locally (e.g. SQL Server
missing), say NOT RUN, give the exact command, and rely on CI for it.

## Step 6 — Deliver

1. In `launch/state.json` set this phase `status` to `"done"` (merging the PR completes it).
   Update the docs the phase lists (API contract, PRD, data model) in the same branch.
2. Push with `git push -u origin claude/<id>-<slug>` and open the PR:
   `gh pr create --base main --title "<id>: <english title>" --body-file <tmp>` where the body
   contains the verification summary and ends with the attribution lines required by the
   environment, if any.
3. Wait for CI (`gh pr checks --watch`, bounded to ~20 minutes). If CI fails, diagnose from the
   logs and fix on the branch (max two repair rounds), then report.
4. Final Arabic message to the owner:
   - اتعمل إيه (3–6 نقاط) + رابط الـPR.
   - تجرب بنفسك إزاي (خطوات تشغيل محلية ومسار تضغط عليه).
   - حالة الـCI والمراجعة، وأي حاجة NOT RUN.
   - «لما تعمل merge، اكتب `/nextphase` للمرحلة الجاية: <next id + title_ar>».

## Never

- Merge PRs, push to `main`, force-push, delete branches you did not create, or rewrite history.
- Deploy, touch DNS, production databases, real customer data, or secrets — even if a phase file
  seems to ask for it — unless the owner gave an explicit «موافق» in this session for that action.
- Weaken, skip or delete existing tests, SEO gates, security checks or lint rules to get green.
- Add ordering, cart, payment or POS features, or third-party scripts on /r, /m, /admin, /platform.
