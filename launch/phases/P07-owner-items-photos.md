# P07 — Owner dishes, prices and photos

> ملخص: إدارة الأطباق والأسعار والتوفر، ورفع صور الأطباق مع شريط تقدم ورسائل خطأ واضحة.

Depends on: P02, P06 · Size: large

## Figma (page 06)
OWNER-ITEMS 82:1011, OWNER-ITEMS-EMPTY 77:806, OWNER-ITEM-CREATE 89:1269, OWNER-ITEM-EDIT 77:864 / 77:913,
OWNER-ITEM-VALIDATION 77:982, OWNER-ITEM-DELETE 77:1066, OWNER-ITEM-READY 266:1600,
OWNER-ITEMS-CREATED 266:1649, OWNER-ITEM-CREATED-EDIT 266:1700, OWNER-ITEMS-DELETED 235:1389,
OWNER-PHOTOS 58:380, OWNER-PHOTO-PROGRESS 77:1122, OWNER-PHOTO-SUCCESS 82:1557,
OWNER-PHOTO-ERROR 58:454, OWNER-PHOTO-REMOVE 77:1182. Media library: page 04 41:68.

## Scope
1. Items list filtered by category with search, paging, quick availability toggle (optimistic UI with
   rollback on error), published/draft badges, "no photo" hint.
2. Item form: category select, name Ar/En, description Ar/En, price (EGP, 2 decimals, Arabic and Western
   digits accepted, sent as a decimal string without float rounding), availability, published, sort.
3. Photos: primary + extra photos, client-side type/size precheck (JPEG/PNG/WebP, 5 MiB as F08),
   upload progress, cancel, server error mapping (413/415/422), remove with confirmation, reorder.
   Show server-normalized thumbnails via P02 URLs (owner preview may see unpublished images through an
   owner-authenticated endpoint if needed; never via public URLs).
4. Bulk reorder of items inside a category.

## Acceptance criteria
- Journey: create dish without photo -> add photo -> mark unavailable -> publish -> visible on `/r/:slug`
  (or shown as "نفد" if D11 approved).
- Price `0` displays as "مجاني" only if the owner explicitly enters 0; large prices round-trip exactly.
- Failed upload leaves existing photos unchanged.
