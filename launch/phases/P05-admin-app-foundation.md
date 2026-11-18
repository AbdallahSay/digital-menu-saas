# P05 — Admin app foundation (auth, shell, shared states)

> ملخص: هيكل لوحة الإدارة: تسجيل الدخول، تفعيل الحساب، القائمة الجانبية والتنقل في الموبايل، وصفحات الأخطاء والرسائل المشتركة.

Depends on: P00 · Decisions: none · Size: large

## Context
`frontend/src/app/admin.ts` is a placeholder. Backend auth exists: `/api/v1/auth/{csrf,login,logout,me,onboarding}`
with `__Host-` HttpOnly cookie sessions and antiforgery.

## Scope
1. Routes: `/admin/**` (Owner) and `/platform/**` (PlatformAdmin), lazy-loaded, CSR only
   (`RenderMode.Client` in `app.routes.server.ts`), `noindex,nofollow`, excluded from sitemap.
2. Typed API client layer (`frontend/src/app/core/api/`) with an HTTP interceptor that fetches the CSRF
   token, sends it on unsafe methods, maps ProblemDetails to typed errors (400 field errors, 401, 403,
   404, 409/412 conflict, 413, 415, 429, 5xx). No tokens in localStorage.
3. Auth: session service from `/auth/me`, role guards, return-url handling (same-origin paths only).
4. Screens (Figma page 06): AUTH-01 login 56:2/56:24, AUTH-02 login error 56:46, AUTH-03 activate
   account 56:90 (reads `userId` + `token` from the onboarding URL fragment/query, then clears it
   from the address bar), AUTH-04 link expired 56:128, AUTH-HELP 77:1368, AUTH-EXPIRED 77:1390.
5. Shells: owner sidebar (symbol 55:34) + mobile bottom nav (الرئيسية / الأطباق / الأقسام / QR);
   platform sidebar (symbol 59:376). Brand header with restaurant name.
6. Shared patterns as reusable components: buttons (55:3/55:5/55:7), form field with error,
   status feedback, saved (58:672), save error / 409 conflict (58:732), dirty-leave guard (58:792),
   confirm dialog, empty state, loading skeleton, toast. System pages SYSTEM-403 61:908, 404 61:934, 500 61:956.

## Acceptance criteria
- Playwright: owner logs in -> lands on `/admin`; wrong password shows generic error; platform admin
  lands on `/platform`; owner visiting `/platform` sees 403 page; logout clears session; expired session
  redirects to login with message.
- Activation flow works end-to-end against the real API in the e2e harness (development onboarding).
- RTL/LTR, 320–1440 px, keyboard-only login, axe checks clean on these screens.
- Admin bundles are not loaded on `/r/*` (check build stats); public Lighthouse unchanged.

## Out of scope
Feature screens (P06–P09).
