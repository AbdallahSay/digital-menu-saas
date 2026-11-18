# P06 — Owner dashboard and categories

> ملخص: الصفحة الرئيسية لصاحب المطعم وإدارة الأقسام كاملة: إضافة، تعديل، ترتيب، إخفاء، وحذف.

Depends on: P03, P05 · Size: medium

## Figma (page 06, 390 / 1440 siblings)
OWNER-DASHBOARD 82:925 / 82:958, OWNER-DASHBOARD-UNPUBLISHED 235:1475, OWNER-CATEGORIES 58:14 / 58:47,
OWNER-CATEGORY-EMPTY 58:186, OWNER-CATEGORY-CREATE 77:588, OWNER-CATEGORY-VALIDATION 77:674,
OWNER-CATEGORY-EDIT 58:100, OWNER-CATEGORY-SORT 58:240, OWNER-CATEGORY-DELETE 58:324,
OWNER-CATEGORY-NOT-EMPTY 77:746, success states 257:8140, 257:8173, 235:1291, 235:1324, 235:1357, 266:1873.

## Scope
1. Dashboard from `GET /admin/summary`: counts, publication state, shortcuts (add dish, QR, preview),
   "next best action" (e.g. "3 أطباق من غير صور").
2. Categories list with item counts and status; create/edit form (Arabic required, English optional,
   published toggle); delete with confirmation; 409 "category has items" state; reorder screen using
   up/down buttons (accessible, matches Figma) saving via bulk reorder.
3. Handle 412 stale rowVersion with the save-error screen and "جلب أحدث البيانات".

## Acceptance criteria
- Playwright journey: empty state -> create first category -> edit -> reorder -> hide -> delete empty one;
  non-empty delete shows 77:746 message.
- All server validation messages appear next to the right field in Arabic.
- Works at 320 px with no horizontal scroll; keyboard-only reorder.
