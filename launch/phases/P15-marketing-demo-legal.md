# P15 — Marketing page, free demo and legal pages

> ملخص: الصفحة اللي إعلانات فيسبوك هتوديها ليها: شرح، أسعار، ديمو مجاني يجرّبه صاحب المطعم على موبايله، زرار واتساب، وصفحات الخصوصية والشروط.

Depends on: P10 · Decisions: D4, D5, D7, D8 · Size: medium

## Figma
MARKETING 80:917 / 80:1007, DEMO-01 61:534 / 61:557, DEMO-02 61:580, DEMO-VALIDATION 61:638,
DEMO-03 61:682, DEMO-04 61:724, DEMO-DONE 61:764.

## Scope
1. Marketing page (prerendered) to Premium v2: hero, live example link (`/r/demo`), how it works in 3 steps,
   features (QR ثابت، عربي وإنجليزي، صور، تعديل فوري), pricing from D4 + trial from D5, FAQ, WhatsApp CTA
   (`https://wa.me/<number>?text=...` with UTM parameters, number from config), footer.
2. Free demo flow (`/try`): 4 steps from Figma, entirely in the browser (no account, no API writes,
   nothing published, state in memory/sessionStorage). Ends with a themed preview and a WhatsApp CTA
   carrying the restaurant name. Clearly labelled «تجربة — غير منشورة»; no working QR shown.
3. Arabic Privacy Policy and Terms pages (owner reviews the wording; mark as draft for legal review).
4. D7: if a Pixel is approved, load it only on marketing routes after consent; otherwise none.
5. Open Graph/Twitter cards and a share image for the marketing page.

## Acceptance criteria
- Lighthouse mobile >= 95 performance on `/`; SEO 100; no third-party requests without consent.
- Demo flow works offline after load and never calls admin APIs (network assertion in Playwright).
