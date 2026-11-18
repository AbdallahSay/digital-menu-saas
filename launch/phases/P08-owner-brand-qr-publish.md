# P08 — Owner branding, settings, QR, publish and private preview

> ملخص: صاحب المطعم يظبط هوية المطعم والثيم، يحمّل الـQR، يعاين المنيو قبل النشر، وينشرها أو يخفيها.

Depends on: P01, P03, P07 · Decisions: D6 · Size: medium

## Figma
OWNER-BRAND 82:1339 / 82:1374 (brand palette, logo, cover), theme selection pages 11/13/16
(nodes 125:2, 133:2, 153:2), OWNER-SETTINGS 58:514, OWNER-QR 82:1429, OWNER-QR-COPIED 82:1495,
OWNER-PUBLISH 58:600, OWNER-UNPUBLISH 77:1238, OWNER-PUBLISHED 235:1435, OWNER-UNPUBLISHED 235:1455,
OWNER-PREVIEW 77:1296.

## Scope
1. Brand screen: theme picker (grill / cafe) with live mini-preview, primary color from palette,
   logo and cover upload/remove.
2. Settings screen: name Ar/En, description Ar/En, phone/address with "show to customers" toggles.
3. QR screen: QR preview, copy public URL (`/r/{slug}`) and permanent QR URL (`/m/{code}`), download
   SVG (print) and PNG (share), print tips. Never show a QR when the restaurant is suspended.
4. Publish flow using preflight (counts, unavailable dishes, blockers) and confirm; unpublish confirm.
5. Private preview: owner-only route rendering the menu with drafts clearly marked, `noindex`,
   never cached publicly, never reachable anonymously.

## Acceptance criteria
- Changing theme/color/logo is visible on `/r/:slug` after publish (PublishedMenuVersion bump).
- Downloaded QR decodes to `/m/{publicCode}` and opens the menu on a real phone (manual step in verification).
- Anonymous request to the preview route -> login; another owner -> 404.
