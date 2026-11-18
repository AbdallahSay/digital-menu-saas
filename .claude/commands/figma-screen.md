---
description: Build or align one Angular screen from a Figma frame (node id) using project tokens
argument-hint: "<figma node id, e.g. 82:925>"
---

Figma file key: `8kUunvUTX27tuIJcWLrXDe`. Node: `$ARGUMENTS`.

1. Use the Figma MCP: `get_design_context` and `get_screenshot` for the node. Each screen exists at
   390px and 1440px on the same page (same name, "· 390" / "· 1440"); read both.
   Responsive contract (page 22): 320, 360, 375, 390, 412, 430, 768, 1024, 1440 px.
2. Treat Figma output as a reference, not final code. Map colors, spacing, radii and type to
   `frontend/design/tokens.css` / `tokens.json`; never hardcode a hex that has a token.
   Theme accents: grill #0F766E, cafe #6B402B. Semantic status colors stay separate from brand colors.
3. Build with real Angular components (standalone, signals, OnPush), semantic HTML, one H1,
   logical CSS properties (RTL first, LTR via `dir`), visible focus, 44x44px minimum touch targets.
   Copy text exactly as written in Figma (Egyptian-friendly Arabic); English is adapted, not literal.
4. Wire loading, empty, error, validation, saved and conflict (409) states shown in Figma.
5. Capture Playwright screenshots at 390 and 1440 (and 320 for tight layouts) and compare them with
   the Figma screenshots. Fix overlaps, clipped chips and horizontal scrolling before finishing.
