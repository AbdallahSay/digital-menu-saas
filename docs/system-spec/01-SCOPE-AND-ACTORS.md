# 01 — Product scope, actors and glossary

## Product objective

Enable an Egyptian restaurant or café to display a fast, mobile-first, bilingual digital menu, managed by its owner and accessed through a stable printed QR code. Support multiple restaurants safely under one SaaS backend. **Display-only** MVP.

## Actors and privileges

| Actor | Authentication | Allowed | Explicitly forbidden |
|---|---|---|---|
| Anonymous customer | None | Scan QR; browse public restaurant menu; search/categories; choose AR/EN | Read drafts/private data; edit menus; order or pay |
| Restaurant Owner | Same-origin Identity cookie, active tenant membership | View own private preview; own categories, dishes, images, settings, public QR; view publication status | Discover another tenant's data; create platform accounts; bypass restaurant suspension |
| PlatformAdmin | Privileged Identity role | Provision restaurant/owner; browse platform records; change restaurant lifecycle/publication status; review audit | Skip audit; bypass constraints; access credentials; silently delete tenant data |
| System/service | Explicit trusted identity/boundaries | SSR public projection; storage and SQL operations; observability | Treat public code as authorization; trust spoofed forwarding headers |
| Demo visitor | Anonymous / illustrative only | Try a non-persistent demonstration of menu/theme selection | Create real restaurant account or publish a live QR without platform provisioning |

## Scope boundaries

**In MVP:** secured login/logout/onboarding, platform tenant management, owner categories/items/images and restaurant branding, Restaurant/Café visual theme selection (UI approved; persistence contract pending), immutable QR, published menu visibility, Arabic RTL/English LTR, search, SSR SEO, loading/empty/error/suspended states, audit, tests and operating controls.

**Not in MVP:** cart, orders, payment, table ordering, table-specific QR, reservations, delivery, POS, customer accounts, marketing analytics, subscription billing, restaurant self-registration, multi-location, custom domains, notifications or staff role management. These require separately approved change requests.

## Source alignment and implementation caveats

- Canonical published URL: /r/{slug}; immutable print QR alias: /m/{publicCode}, one 302 to the current canonical URL.
- Tenant boundary: an owner's restaurant is resolved by the server, never accepted solely from a client-controlled ID.
- Arabic data required; English translation optional with Arabic fallback; EGP is MVP display currency.
- Figma Premium v2 has two distinct customer-facing designs: **Restaurant & Grill** and **Café & Desserts**. Buttons, category chips, prices and prominent controls must match the selected identity; availability/success/error remain semantic states.
- Existing SQL RestaurantSettings has PrimaryColor but **no persisted MenuThemeId yet**. Adding durable theme selection is a requirement candidate and requires a reviewed API/schema contract (D-01).
- Existing restaurant-level publication API is **PlatformAdmin-only**. Figma owner publication confirmation screens do not automatically authorize an owner to publish the restaurant (D-02).
- Demo on Figma is illustrative; no signup, deployment or data persistence is implied (D-03).

## Glossary

| Term | Meaning |
|---|---|
| Restaurant/Tenant | One organizational boundary with isolated catalog, settings, media, membership |
| Publication | Restaurant-level and category/item-level visibility decisions, evaluated together |
| Availability | Per-item temporary customer visibility flag, distinct from deletion |
| PublicCode | Cryptographically generated immutable public route identifier; never a secret |
| Slug | Human-readable SEO canonical URL key; may change only via approved alias handling |
| RowVersion | Database concurrency token; stale write rejection (412 in approved platform contract) |
| Theme | Approved visual menu identity, not the same as arbitrary brand PrimaryColor |
| SSR | Server-rendered initial public HTML with actual visible menu text and metadata |
| Prototype | Clickable Figma simulation; not proof of functional backend implementation |

## Product quality priorities

1. Never expose tenant/private content.
2. Never show unpublished/suspended/unavailable catalog data publicly.
3. Avoid regressions in canonical SEO/QR navigation and crawlable source HTML.
4. Preserve exact approved Figma visual direction while implementing responsive reusable Angular components.
5. Favor short, natural Egyptian Arabic and concise English; no overlapping labels or crowded headings.

