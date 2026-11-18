# P16 — Go live and pilot (owner-approved actions only)

> ملخص: نرفع على السيرفر الحقيقي خطوة بخطوة معاك، نجرّب على موبايلات حقيقية، ونشغّل 3 مطاعم Pilot قبل الإعلانات.

Depends on: P14, P15 · Decisions: D1, D2, D8 · Approval gate: YES · Size: medium

## How this phase works
Claude prepares and guides; every action on real infrastructure needs the owner's explicit «موافق»
in the session, one action at a time. Claude never handles production secrets in chat: the owner types
them into the server or secret store directly.

## Steps
1. Pre-flight checklist from `deploy/RUNBOOK-AR.md` (domain, DNS, server, bucket, backups, monitoring).
2. Staging first on the same server or a second one: deploy, run migrations script, bootstrap admin,
   run smoke + e2e against staging, test printed QR on 3 real phones (Android budget + iPhone) on 4G.
3. Production deploy with the same steps; verify HTTPS, headers, sitemap/robots with the real domain;
   submit sitemap in Google Search Console (owner's account).
4. Pilot: provision 3 real restaurants with the owner, collect issues for 7 days, triage into fixes.
5. Launch checklist in `launch/README.md` ticked; recommend when to start Facebook ads.

## Acceptance criteria
- Production smoke green, restore tested on production backup, uptime alerts firing to the owner.
- 3 pilot owners edited their menus without help; no 5xx spikes for 7 days.
