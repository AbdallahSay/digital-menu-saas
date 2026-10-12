# Digital Menu SaaS — Figma Design Handoff v2

**Status:** Design exploration / editable Figma frames. Not production code; not all screens are complete.
**Figma file:** https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe
**Code repository:** https://github.com/AbdallahSay/digital-menu-saas
**Source of truth for existing design tokens:** `frontend/design/tokens.json`, `frontend/design/tokens.css`.

## Editable frames completed

| Area              | Screen                                                        | Figma link                                                         |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Foundations       | Design System v1 (colors, type, component examples)           | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=3-14   |
| Public menu       | Premium Arabic RTL home — restaurant                          | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=7-3    |
| Public menu       | Dish detail (view only)                                       | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=7-97   |
| Public menu       | Café branding variation                                       | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=7-134  |
| Public menu       | Search / unavailable state                                    | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=7-185  |
| Owner admin       | Overview — desktop RTL                                        | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=9-2    |
| Owner admin       | Dishes and prices table — desktop                             | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=9-104  |
| Owner admin       | Overview — mobile                                             | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=9-214  |
| Platform admin    | Overview — desktop                                            | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=10-2   |
| Platform admin    | Tenant directory — desktop                                    | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=10-84  |
| Platform admin    | Create restaurant — form/modal concept                        | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=10-169 |
| Marketing         | Arabic conversion landing page                                | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=11-2   |
| Marketing / Trial | Free demo builder, editable form + phone preview mockup       | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=11-83  |
| Owner admin       | Add/edit dish drawer, photo, category, price and availability | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=12-2   |
| Owner admin       | Branding and QR studio (QR explicitly non-scannable)          | https://www.figma.com/design/8kUunvUTX27tuIJcWLrXDe?node-id=12-60  |

Older reference frames (not current visual direction) remain on Figma's second page: Arabic v1 `4:3`, dish details v1 `4:59`, search v1 `4:82`, and English v1 `4:117`.

## Design principles

- **MVP is display-only**: no cart, orders, checkout, payments, POS or reservation flow. Customer sees menu categories, prices, descriptions and availability.
- **Public menu first**: QR scan leads to the existing planned SSR route `/r/{slug}` via permanent redirect `/m/{publicCode}`; public SSR only uses published, anonymous data.
- **Arabic RTL first**, English LTR; build responsive layouts for mobile (390 px), tablet (768 px) and desktop (1440 px).
- **Tenant isolation is entirely server-authorized**: never trust a supplied `restaurantId`, role or `tenantId` from frontend requests. F05 is required before tenant CRUD.
- **No fake capabilities**: the QR vector in the design is decorative and not scannable; buttons in Figma are visual design, not connected interactions. Public preview illustrations are editable vectors; replace them with licensed, optimized food images before production.
- **Photos and iconography**: maintain accessible alternative text and image fallback; avoid SVG uploads by restaurant owners unless backend security requirements explicitly permit them.
- **Sample data only**: restaurant names, counts, sample dish prices and statuses are illustrative. They are not live analytics or real customers.

## Visual system

- Teal default primary `#0F766E` (tenant-brand customizable).
- White surfaces, warm neutral public menu backgrounds, deep evergreen header highlights and light gray admin dashboard canvas.
- Figma designs use **Cairo** for Arabic display text. Repo's current token stylesheet specifies **Tajawal** for Arabic; the implementation owner must explicitly reconcile the typography choice in a small reviewed design-token PR, rather than silently changing the entire app.
- Use the existing token contracts from the repo wherever possible; buttons and availability chips should come from a shared Angular component library.
- Mobile touch targets >= 44 px. Preserve RTL keyboard navigation, focus management, screen-reader labels and correct text direction.

## Implementation sequencing and ownership

1. **Codex** completes F04 local/test provisioning review. Production owner invitation delivery is not enabled in the current F04 approach.
2. **Codex** implements F05 server-derived tenant context and cross-tenant negative tests, then F06 categories and F07 menu items.
3. **Antigravity** may refine Figma-aligned visual prototypes now. Do not implement live owner admin APIs before their backend dependencies are ready.
4. **Antigravity** implements the public SSR menu only when F09/S01 public projection/canonical routing is ready, with SEO and tenant-safe response caching.
5. For every screen shipped, review desktop/mobile screenshots against these Figma frames and run real browser accessibility tests; never claim screenshots alone prove behavior.

## Backend contracts to follow

- F03 cookie sessions, `/api/v1/auth/csrf`, `login` **204**, generic `401` for invalid/suspended credentials, HttpOnly+Secure+SameSite Strict, 30-minute non-sliding session, lockout 5 attempts/15 minutes.
- F04 privileged `/api/v1/platform/restaurants` CRUD-style provisioning/list/detail/status/publication paths; all mutations require CSRF and `PlatformAdmin` authorization.
- Owner admin routes are future work; owner resource access must derive tenant from server-side active membership (F05).
- Public menu is anonymous, published-only, cached by tenant/locale/version; no private identity data in SSR response.

## Remaining design work / limitations

- Full English variant of the updated premium menu, final image photography, real logo identity and production-grade icon set.
- Platform audit timeline, confirmation/suspension screens, detailed settings and account flows.
- Owner onboarding / password setup screens and guided first-menu flow.
- Pricing page, FAQ, comparison table and final responsive marketing variants.
- Demo success/limit states and accessibility error flows.
- Finished reusable Figma component/variant library and approved typography reconciliation.

**Figma limitation:** the connected Figma Starter plan allows only three pages per file and hit its MCP tool-call limit during this session. Subsequent screens were therefore organized as frames on page 3, and further canvas writes stopped when the usage cap was reached. No upgrade or payment was attempted.
