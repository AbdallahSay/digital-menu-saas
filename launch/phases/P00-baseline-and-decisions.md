# P00 — Baseline and decisions

> ملخص: نتأكد إن المشروع بيتبني وكل الاختبارات خضرا على جهازك، نحسم القرارات المفتوحة، ونقرر مصير الـPRs المفتوحة. مفيش كود تطبيق في المرحلة دي.

Depends on: none · Decisions: asks for all `open` decisions (D1–D11) · Size: small

## Context
- main contains F01–F09 and S01. Open PRs: #45 (S02-I01 SEO metadata) and #46 (spec docs).
- `launch/` and `.claude/` were added by the launch-track PR.

## Scope
1. Toolchain check: .NET SDK from `global.json`, Node version used by CI, Docker. Report versions.
2. Run `/verify` fully on main (including SQL tests in Docker and the SSR harness). Record results.
   Known red on 2026-11-18: `npm audit --audit-level=high` fails in the foundation job on new advisories
   for transitive `qs` (GHSA-6pq8-jhm2-2vcw) and `undici` (GHSA-xjj6-f33q-929c). Fix by updating the
   lockfile to patched versions (`npm audit fix` without `--force`, or a reviewed `overrides` entry),
   confirm Angular SSR still builds and all gates pass. Never lower the audit level.
3. Review PR #45 and PR #46 (`gh pr view`, `gh pr diff`): for each, say keep / merge / close / fold into
   a later phase (P11 for SEO), with blocking issues only. Do not merge or close them.
4. Ask the owner for every `open` decision in `launch/DECISIONS.md` (one AskUserQuestion per group,
   recommended default first) and record the answers.
5. Add a short "Launch track" section to `README.md` and `START-HERE-AR.md` pointing to `launch/README.md`.
6. Write `launch/verification/P00.md`.

## Acceptance criteria
- Baseline results recorded with exit codes; any red check on main is explained (not fixed here unless trivial and in-scope).
- Every decision is `decided`, or explicitly left open with the phase it blocks.
- PR #45/#46 recommendation written in the verification file.

## Out of scope
Application code and migrations. Dependency updates only for the audit fix above.

## Stop and ask if
Main is red for a reason that is not environmental.
