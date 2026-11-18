# P02 — Public images and branding in the public menu API

> ملخص: صور الأطباق واللوجو والغلاف والثيم تظهر للزبون في المنيو العامة، بروابط سريعة وآمنة.

Depends on: P01 · Decisions: D11 · Size: medium

## Context
- F09 public DTOs (`backend/src/DigitalMenu.Application/PublicMenu.cs`) return no images, logo, cover,
  theme or contact data. Images are stored privately under opaque tenant-scoped keys (F08).

## Scope
1. Public image delivery endpoint, e.g. `GET /media/{opaqueId}/{variant}.webp` with variants
   (`thumb` 320w, `card` 640w, `full` 1280w) generated at upload or lazily and cached on disk/storage.
   URLs are unguessable, contain no tenant or object key internals, and only resolve while the owning
   restaurant/item is publicly visible. `Cache-Control: public, max-age=31536000, immutable` (content-addressed URLs).
2. Extend F09 DTOs: restaurant `nameEn` (localized name), `description`, `themeKey`, `primaryColor`,
   `logo`, `cover`, and visible contact fields only when their flags are on; item `images[]` with
   `url`, `width`, `height`, `alt` (localized) ordered primary-first.
3. Apply decision D11: if approved, include published-but-unavailable items with `isAvailable: false`
   (Angular shows "نفد"); otherwise keep hiding them. Update PRD + contract either way.
4. Keep the existing response-size/count caps in the SSR fetch adapter coherent with the larger DTO,
   and update `frontend/src/app/public-menu-contract.ts` projection + its spec.

## Acceptance criteria
- Unpublished/deleted items, hidden categories, suspended or unpublished restaurants never leak an
  image URL; their image URLs return 404 after visibility changes.
- No ObjectKey, user id, email or private contact field in any public response (tests assert absence).
- Existing S01 SSR/SEO gates and Lighthouse stay green.

## Tests
SQL integration tests for visibility of images, DTO allowlist tests, frontend contract spec, `PublicSsrTests`.

## Docs to update
`docs/04-API-CONTRACT.md` public section, `docs/01-PRD.md` (if D11 changes behaviour), `docs/07-PERFORMANCE.md` image budget.

## Out of scope
Rendering images in Angular (P10), CDN/object storage (P13).
