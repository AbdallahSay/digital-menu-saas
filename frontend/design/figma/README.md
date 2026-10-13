# Digital Menu — Antigravity Design Reference (SAFE OFFLINE HANDOFF)

## Provenance — important

This pack is provided to let Antigravity proceed WITHOUT a Figma personal access token.

- `FIGMA-SCREEN-MAP.md` lists the REAL editable Figma nodes created earlier, including `7:3`, `11:2`, `11:83`, `9:2`, `9:104`, `10:2`.
- `svg/*.svg` and `reference-previews/*.png` are exports of SEPARATE STANDALONE WIREFRAMES created for Loading, 404 and Marketing pages. **They are NOT pixel-perfect exports of the Figma nodes listed above.** Do not misrepresent them as such.
- `wireframe-design-spec.json` is the structured source for those same standalone wireframes.
- Angular code/tokens presently in `main` remain the implementation baseline.

## How to continue in Antigravity

1. Keep the existing M02 working branch. Place the contents of this `frontend/design/figma` directory in the matching repository folder on your local machine. This is a design input, not production code.
2. Study `FIGMA-SCREEN-MAP.md`, the standalone SVG previews, and `frontend/design/tokens.json`, `frontend/design/tokens.css`, `frontend/src/app/marketing.ts`, and `frontend/src/styles.css`.
3. For **M02** marketing/loading/404, use the available standalone wireframes as a visual reference and implement the approved Modern Cairo brand refresh using the existing Angular structure. Avoid inventing unverified details from inaccessible Figma frames.
4. To claim 1:1 alignment to actual Figma nodes, first acquire exports of the six original frames from Figma (see below); record which nodes were inspected and which were not.
5. Run relevant tests, capture before/after screenshots, open a Draft PR; never merge/deploy without human approval.

## Exporting exact Figma frames manually (NO token necessary)

Open https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe and navigate to these node links:

- Public Menu RTL: `?node-id=7-3` -> `07-public-menu-rtl.png`
- Landing: `?node-id=11-2` -> `11-landing.png`
- Demo Builder: `?node-id=11-83` -> `11-demo-builder.png`
- Owner Dashboard: `?node-id=9-2` -> `09-owner-dashboard.png`
- Owner Items: `?node-id=9-104` -> `09-owner-items.png`
- Platform Admin: `?node-id=10-2` -> `10-platform-admin.png`

For each frame: select the frame in Figma Layers, use right sidebar **Export -> PNG 2x** (or desired readable resolution), and save under `frontend/design/figma/figma-frame-exports/` in the agent's working tree. Exports require permission to view/export the file. A screenshot is a _visual reference_ only, not editable Figma source. SVG export where available can supplement PNG.

If you are NOT authorized to view the file, ask the owner to share read permission or provide exports; do not brute force, bypass permissions, or request that tokens be pasted into chat.

## Known block

ChatGPT's connected Figma Starter MCP is at its call limit; screenshot/export attempts return a rate limit. Antigravity's independent environment got HTTP 403 and has no Figma MCP. No token is provided.

## Product constraints

MVP is display-only; public menu SSR/SEO, tenant isolation, no cart/ordering/payment, no fake working lead submission, authentic premium Egyptian Arabic, accessibility and reduced-motion, preserve repo architecture.
