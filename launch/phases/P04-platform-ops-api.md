# P04 — Platform operations API

> ملخص: إنت كمسؤول منصة تقدر تنشئ مطعم في الإنتاج وتطلع رابط تفعيل تبعته واتساب، تشوف سجل العمليات، توقف أو ترجع وصول مالك، وتتابع الاشتراك.

Depends on: P00 · Decisions: D3, D4 · Size: large

## Context
- F04 provisioning works in Development only: `IOwnerOnboardingDelivery` is unavailable in Production,
  so production provisioning is blocked. Onboarding tokens expire after 1 hour and are never returned
  by any API. Audits are written but cannot be read.

## Scope
1. Admin-assisted onboarding (decision D3, needs explicit owner approval because it changes the F04
   security contract): a production delivery adapter that returns a one-time onboarding URL to the
   PlatformAdmin exactly once in the 201 response (and on explicit "regenerate link"), never logged,
   never stored in plaintext, single-use, expiry 72h (configurable), invalidating previous links.
   `POST /api/v1/platform/restaurants/{id}/owner/onboarding-link` regenerates. Audit without the token.
2. `GET /api/v1/platform/summary` for PLATFORM-DASHBOARD (82:1123): counts by status/publication,
   pending onboardings, recent audit.
3. `GET /api/v1/platform/audit?action=&restaurantId=&from=&to=&page=` + `GET .../audit.csv`
   (CSV-injection safe: prefix `= + - @` cells). Platform-wide, PlatformAdmin only.
4. Suspension reason: optional `reason` (<= 300 chars) on status PATCH stored in audit metadata, shown in audit.
5. Owner access: `PATCH /api/v1/platform/restaurants/{id}/owner/access { isActive, rowVersion }`
   (Figma PLATFORM-OWNER-SUSPEND / REACTIVATE). Ends active sessions via security stamp.
6. `GET /api/v1/platform/owners` list (email visible to PlatformAdmin only, onboarding state).
7. Restaurant edit: `PATCH /api/v1/platform/restaurants/{id}` for name only (slug rename is P11).
8. Billing fields (decision D4): `PlanName nvarchar(50) null`, `PaidUntilUtc datetime2 null` on Restaurant,
   PlatformAdmin read/write only, never in owner or public DTOs. No automation.

## Acceptance criteria
- Production-mode integration test: provisioning succeeds and returns the link once; a second GET never shows it;
  the link works once, then fails; regenerate invalidates the old one.
- Owners get 403 on every platform endpoint; anonymous 401.
- Audit CSV opens safely in Excel (injection test).

## Docs to update
`docs/04-API-CONTRACT.md`, `docs/06-SECURITY.md` (onboarding token handling), `backend/F04-*` note pointing to P04.

## Stop and ask if
The owner has not approved D3 (changing where onboarding tokens may appear).
