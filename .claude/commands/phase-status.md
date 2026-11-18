---
description: Show the launch roadmap progress in Arabic without changing anything
---

Read `launch/state.json` and `launch/DECISIONS.md` from `origin/main` (after `git fetch origin`),
and list open PRs with `gh pr list --state open --json number,title,headRefName,url`.

Reply in Egyptian Arabic with:
1. A table: المرحلة | العنوان | الحالة (✅ خلصت / 🔄 PR مفتوح / ▶️ الجاية / ⏳ مستنية) | الـPR.
2. The next phase `/nextphase` would pick, and why.
3. Open decisions that block upcoming phases.
4. Overall progress as "x من y مرحلة".

Change nothing.
