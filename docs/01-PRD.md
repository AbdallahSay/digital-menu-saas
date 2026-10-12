# Product Requirements Document (PRD)

## Vision / users
A platform admin provisions restaurants. A restaurant owner manages a digital menu and brand without programming. An anonymous customer scans a printed QR code and instantly opens a mobile menu without an account or app.

### Jobs to be done
- Platform admin: provision/suspend/reactivate restaurants and owners; see coarse operational status.
- Owner: manage profile, bilingual categories, products, prices (EGP), availability, images and presentation; copy public URL and download QR asset.
- Customer: scan QR, see restaurant identity and available/published products, navigate categories, search visible menu, switch languages; understandable empty/offline/error states.

## MVP scope
1. Platform admin (seeded securely via deployment bootstrap): sign in; provision restaurant, owner; list and suspend/reactivate restaurants; audit admin changes.
2. Restaurant owner: sign in/out; edit restaurant brand/logo/contact info, color and cover; CRUD categories with order; CRUD menu items with name/description bilingual fields, price, one primary photo and optional additional photos, sort, availability and publish status; preview menu; download or copy permanent QR.
3. Public browsing: fixed random public code (not an auth token) resolves an active published restaurant; display logo, restaurant title, sections, only active published items, localized name/description with fallback; search and category navigation; mobile RTL/LTR; informative 404/temporarily unavailable screen.
4. System: tenant isolation, safe uploads, observability, backups, accessibility, CI and tests.

## Explicitly out of scope
Ordering, cart, table-specific QRs, payment, coupons, billing automation, restaurant self-registration, staff role management, analytics dashboard, POS, booking, inventory, delivery, push notifications, native apps, QR scan tracking, custom domains (future consideration).

## Business invariants
- One owner can be scoped to a restaurant in the MVP; design membership table for extensibility.
- Current F04 provisioning rule: an existing normalized owner email cannot be
  assigned to a second restaurant. Existing Identity accounts are rejected with
  409 rather than linked, including inactive or not-yet-onboarded owners. Changing
  this rule requires explicit human approval; the extensible membership schema
  does not authorize multi-restaurant owner provisioning.
- Each restaurant has a permanent `PublicCode`. Changing its display name or slug doesn't break existing QR.
- Only active and publicly published restaurants are browseable; categories/items must be published and items must be available to appear in public menu.
- Prices stored as `decimal(18,2)` with nonnegative constraint, displayed as EGP. For truly zero-priced product, product may use 0; UI must label free if desired, but never show a fake price.
- Image ownership is tenant-scoped. Deleting a product is soft-delete for operational safety; existing public result hides it.
- Bilingual: Arabic title required. English text optional; fallback to Arabic if missing. Default locale Arabic. Language switch persists only in browser preferences; no personal accounts for consumers.
- Public business contact details are opt-in owner-managed fields; internal emails/credentials not exposed.

## User stories and acceptance criteria
**US-01: Admin provisions restaurant**: Admin provides name and owner email; system creates unique restaurant, public code and owner invitation/secure setup path. Owner not authorized for another restaurant. Audit entry created. Provisioning cannot auto-send unconfigured mail; if email is unavailable, documented admin-assisted password setup requiring forced password change.

**US-02: Owner signs in**: Correct credentials sign in; wrong ones yield generic failure with rate limiting/lockout. Suspended restaurant owner denied menu management. Session logout invalidates access.

**US-03: Category management**: Owner creates, renames, sorts, publishes/unpublishes own categories. Names required in Arabic and constrained length. Cannot edit another tenant's category. Hidden category's items not public.

**US-04: Product management**: Owner creates and edits item with category, Arabic name, price, optional English translation, descriptions, availability/publish flags and images. Category belongs to same restaurant. Invalid price and foreign category are rejected. Item is hidden publicly when unpublished, unavailable or soft-deleted.

**US-05: Image upload**: Owner can upload supported raster image within documented limits. Backend verifies bytes, rewrites image to approved format with metadata stripped, generates optimized sizes, and stores under tenant-scoped opaque object names. Disallowed/malformed files fail safely.

**US-06: Brand and menu**: Logo/cover/color/theme saved and shown to customer; owner-only preview accessible securely and does not expose unpublished data anonymously.

**US-07: Permanent QR**: Owner copies URL/downloads PNG or SVG QR pointing to stable `/m/{publicCode}`. URL remains valid after editing name or products. Suspended/unpublished restaurant returns an unavailable view.

**US-08: Public menu**: Customer sees only published menu. Search filters visible items, works Arabic and English, responsive for narrow phones, supports direct URL/bookmarks, accessible keyboard/touch. No login required.

**US-09: Cross-tenant denial**: Manipulated IDs/paths/requests cannot read, edit, delete or upload into another restaurant. Unauthorized foreign resources respond with a non-disclosing status such as 404; tests enforce invariant.

## Non-functional launch gates
- No known critical/high security findings left open without documented business-approved mitigation.
- Public menu usable on representative mobile devices; Arabic RTL and English LTR tested.
- Core Web Vitals targets, API latency/load and image budgets defined in `07-PERFORMANCE.md` and verified with evidence on intended infrastructure.
- Restore test completed, HTTPS in production, no secrets in client bundle, admin mutation protection present.

## Excluded later-phase ideas
Paid plans, invoice/subscription lifecycle, restaurant self-service, analytics, table QR differentiation, ordering & WhatsApp, POS integration, multiple locations, custom domains.

## SEO-first and performance-first product constraints (accepted 2026-10-12)
- Customers must be able to find published restaurant menu pages in search in addition to scanning QR. SEO is an explicit product requirement from Day 1; Google indexing/rank cannot be guaranteed.
- The **initial server HTML** of an indexable menu must contain actual restaurant/menu content, unique title/description, canonical and grounded Restaurant structured data, not a generic Angular JS shell.
- Separate renameable human-readable canonical `/r/{slug}` from permanent printed `/m/{publicCode}` QR (one-hop 302). No duplicate indexable URL variants.
- Only active, published, publicly approved information may appear in index, sitemap, structured data or shared SSR cache. Suspended/unpublished non-indexable; app admin private.
- Adopt hybrid SSR public / prerender marketing / CSR admin from initial scaffolding, with production-compatible hosting and explicit measurable mobile performance benchmarks. RUM/core vitals success requires data, not optimistic claims.
- Acceptance checks AC-15 through AC-20 in `08-TEST-PLAN.md` join the launch gates; SEO and LHCI smoke checks start at F01, not pre-release.
