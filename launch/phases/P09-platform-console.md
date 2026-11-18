# P09 — Platform admin console

> ملخص: لوحتك كمسؤول منصة: إضافة مطعم ومالك ونسخ رابط التفعيل، تعليق وتفعيل، إدارة الملاك، سجل العمليات، ومتابعة الاشتراك.

Depends on: P04, P05 · Decisions: D4 · Size: medium

## Figma (page 06)
PLATFORM-DASHBOARD 82:1123 / 82:1149, PLATFORM-RESTAURANTS 82:1189 (+ SUSPENDED 88:1622,
REACTIVATED 88:1706, CREATED 266:1786), PLATFORM-CREATE 82:1273, PLATFORM-CREATE-VALIDATION 60:754,
PLATFORM-CREATE-READY 266:1755, PLATFORM-CREATED 60:820, PLATFORM-RESTAURANT-EDIT 60:532
(+ CREATED-EDIT 266:1831), PLATFORM-SUSPEND 60:602, PLATFORM-REACTIVATE 60:646, PLATFORM-OWNERS 60:362
(+ SUSPENDED 88:1790, REACTIVATED 235:1511), PLATFORM-OWNER-DETAIL 60:426, PLATFORM-OWNER-SUSPEND 60:492,
PLATFORM-OWNER-REACTIVATE 77:1412, PLATFORM-AUDIT 60:686, PLATFORM-EMPTY 60:864.

## Scope
1. Dashboard, restaurants list (search, paging, status/publication/paid-until badges).
2. Create restaurant + owner with slug suggestions from the name; on success show the one-time
   onboarding link with "نسخ" and "إرسال على واتساب" (`https://wa.me/?text=` prefilled Arabic message);
   warn that the link appears once. Regenerate link action.
3. Edit name, publish/unpublish, suspend with reason, reactivate, owner access suspend/reactivate.
4. Billing panel: plan name and paid-until date; list filter "اشتراك منتهي".
5. Audit log with filters and CSV export.

## Acceptance criteria
- Journey: create restaurant -> copy link -> activate owner in another browser context -> owner logs in.
- Suspension hides the public menu immediately and ends the owner's session.
- No owner email is ever shown outside `/platform`.
