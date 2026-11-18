# P14 — QA, security and load hardening (Q01/Q02)

> ملخص: اختبار شامل لكل رحلات المستخدمين، ومراجعة أمان كاملة، واختبار تحميل قبل ما نسلّم لأول مطعم.

Depends on: P08, P09, P11, P13 · Size: medium

## Scope
1. Playwright journeys on the compose stack: platform creates restaurant -> owner activates -> builds
   menu with photos -> brands -> publishes -> customer scans `/m/{code}` -> searches -> switches language;
   suspension and reactivation; slug rename; two tenants in parallel with cross-access attempts.
2. Accessibility: axe on every screen in AR and EN; keyboard-only owner journey; screen reader labels.
3. Full security review using the `security-reviewer` subagent across the whole app plus the
   repository's security checklist; dependency audits; header checks (CSP, HSTS, cookies).
4. Load smoke (Q02) on the compose stack: public menu at target RPS, owner edits during load, image
   delivery; record p95 latency, error rate, CPU/memory.
5. Fix everything blocking found here (small fixes only; larger ones become new phases in state.json
   with the owner's approval).

## Acceptance criteria
- All journeys green in CI; zero high/critical findings open; load results recorded with environment details.
- `launch/verification/P14.md` contains a go/no-go table for launch.
