# P10 — Public menu in Premium v2 with themes

> ملخص: المنيو اللي الزبون بيشوفها بعد ما يمسح الـQR بالتصميم النهائي: صور، ثيمين، أقسام لاصقة، بحث، وتفاصيل الطبق، وسريعة على الموبايل.

Depends on: P02 · Decisions: D6, D11 · Size: large

## Figma
PUBLIC-MENU 63:578 / 63:692, PUBLIC-CAFE 86:1208, PUBLIC-DETAIL 86:1172, PUBLIC-SEARCH 88:1182,
PUBLIC-CATEGORY 88:1402, PUBLIC-EMPTY 61:790, PUBLIC-NO-RESULTS 61:812, PUBLIC-ERROR 61:842,
PUBLIC-LOADING 61:864, PUBLIC-UNAVAILABLE 61:886. Theme system pages 09 (103:2) and 10 (115:2);
English LTR page 08 (95:1516); tablet QA pages 17–18; 1920 QA page 23.

## Scope
1. Rebuild `public-menu.ts` UI to Premium v2 while keeping the S01 SSR contract (server HTML contains
   restaurant name, every visible category and dish text, prices, statuses, canonical, one H1).
2. Theme tokens per `themeKey` and owner `primaryColor` as CSS custom properties set server-side
   (no flash of wrong theme). Contrast checked for both themes.
3. Header with logo/cover (sized, `fetchpriority` only for the LCP image), sticky horizontally
   scrollable category chips with scroll-spy, dish cards with responsive `<img srcset sizes>` from P02
   variants, explicit width/height, lazy loading below the fold.
4. Client-side search (Arabic normalization: hamza/alef/taa marbuta/diacritics; English case-insensitive)
   with no-results state; dish details as an accessible dialog with its own shareable URL
   (`/r/:slug?dish=<id>` canonicalized to the menu, or a `#fragment`), category view.
5. Language switch AR/EN (existing `?lang=` contract), contact block when enabled, sold-out badge per D11.
6. Keep `/r/demo` working with fixture images and both themes.

## Acceptance criteria
- Raw HTML gates (`npm run test:html`) and SSR harness pass; hydration has no duplicate API calls.
- Lighthouse mobile median: Performance >= 90, Accessibility/Best Practices/SEO 100 with images on.
- CLS < 0.05 locally; no horizontal scroll 320–1920 px; RTL and LTR screenshots match Figma.
- No ordering/cart UI, no third-party scripts.
