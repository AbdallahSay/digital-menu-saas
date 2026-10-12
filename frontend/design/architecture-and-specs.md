# UX Architecture & System Specifications

**Document Version:** 1.0.0  
**Target Milestone:** U01 — Mobile-first UI/UX Design System  
**Status:** Proposal ready for review (Dependent on P0 approval; BLOCKED for merge until P0 human acceptance)

---

## 1. Executive Summary & Design Vision

The Digital Menu SaaS is a commercial, multi-tenant digital menu platform crafted for restaurants, bistros, and cafés in the MENA region and globally. The platform is designed from the ground up around four architectural pillars:

1. **Instant, Zero-Friction Dining Browsing:** Diners scan a table QR code and land on a fast, beautiful mobile menu within milliseconds—no app installation, no forced registration, no intrusive overlays.
2. **Display-Only Simplicity (MVP Scope):** Strictly display-only. The customer explores categories, dishes, ingredients, dietary indicators, high-resolution imagery, and prices in EGP. No shopping cart, checkout, payments, delivery, or POS integrations in MVP.
3. **Arabic-First & Bilingual Inclusivity:** Arabic (RTL) is the primary native experience, accompanied by clean, typographic-grade English (LTR) with seamless single-tap language switching.
4. **Performance & SEO by Default:** Public menu routes (`/r/:slug`) leverage Angular Hybrid SSR to deliver complete, semantic, crawler-visible HTML on first paint. Zero Cumulative Layout Shift (CLS), prioritized above-the-fold assets, and aggressive asset budgets guarantee optimal Core Web Vitals on real mobile networks.

---

## 2. Information Architecture (Three Domain Portals)

The application is structured into three discrete UX domains with strict separation of concerns, routing models, and rendering modes:

```
                                  ┌─────────────────────────────┐
                                  │      Digital Menu SaaS      │
                                  └──────────────┬──────────────┘
                                                 │
         ┌───────────────────────────────────────┼───────────────────────────────────────┐
         │                                       │                                       │
         ▼                                       ▼                                       ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌─────────────────────────────┐
│    Public Customer Menu     │   │  Restaurant Owner Dashboard │   │   Platform Admin Portal     │
│       (/r/:slug, /m/:code)  │   │          (/admin/*)         │   │         (/platform/*)       │
├─────────────────────────────┤   ├─────────────────────────────┤   ├─────────────────────────────┤
│ • SSR + Hydration           │   │ • CSR (Client-Side)         │   │ • CSR (Client-Side)         │
│ • Anonymous Public Access   │   │ • Secure Cookie Auth        │   │ • Root Administrator Auth   │
│ • Zero CLS, Fast LCP        │   │ • Tenant Scoped on Server   │   │ • Multi-Tenant Governance   │
│ • Arabic RTL / English LTR  │   │ • Noindex, No-Store         │   │ • Provisioning & Audit      │
└─────────────────────────────┘   └─────────────────────────────┘   └─────────────────────────────┘
```

### Domain A: Public Customer Menu (`/r/:slug`, `/m/:publicCode`)
- **Target Persona:** Dine-in or takeaway patrons using modern smartphones (iOS Safari, Android Chrome).
- **Core Needs:** Read menu effortlessly under varied lighting, filter by food category, search specific items, inspect ingredients and prices, switch language between Arabic and English.
- **Rendering Architecture:** Server-Side Rendered (SSR) with hydration. Raw HTTP response contains restaurant title (`<h1>`), categories (`<h2>`), and menu items (`<h3>`) with prices, rendering cleanly even if JavaScript is unavailable or delayed.

### Domain B: Restaurant Owner Dashboard (`/admin/*`)
- **Target Persona:** Busy restaurant owners, chefs, or branch managers using smartphones, iPads, or laptop POS counters.
- **Core Needs:** Update prices in seconds, toggle dish availability ("In Stock" vs "Sold Out"), upload food photos, organize categories, customize brand accent colors, download permanent printable QR codes.
- **Rendering Architecture:** Client-Side Rendering (CSR). Secure cookie session; headers enforce `noindex, no-store`.

### Domain C: Platform Admin Portal (`/platform/*`)
- **Target Persona:** SaaS system administrators.
- **Core Needs:** Provision new restaurant tenants atomically with an owner invite, inspect tenant counts and health, suspend/reactivate tenants with full audit logging.
- **Rendering Architecture:** Client-Side Rendering (CSR). Strict role-based authorization; completely isolated from tenant public views.

---

## 3. End-to-End User Journeys & Flowcharts

### Journey 1: Customer QR Scan to Dish Discovery

```
[Customer Scans QR Code]
         │
         ▼
[HTTP GET /m/:publicCode]  ──────── (Server 302 Redirect)
         │
         ▼
[HTTP GET /r/:slug]
         │
         ▼
[Raw Server HTML Rendered]  <-- Restaurant Name (H1), Hero Logo, First Category & Products visible in < 800ms
         │
         ▼
[Angular Hydration Activates]  <-- Seamless enhancement without layout jumps
         │
    ┌────┴──────────────────────────┬────────────────────────────┐
    ▼                               ▼                            ▼
[Category Scroll Spy]        [Instant Search]          [Language Toggle]
User taps/swipes chip;       User types "بيتزا"         User switches to English;
View smooth-scrolls to       Instant debounced filter;  Direction flips LTR;
category section.            No-matches reset button.   Arabic fallback preserved.
    │                               │                            │
    └────────────────┬──────────────┴────────────────────────────┘
                     │
                     ▼
             [Item Card Click]
                     │
                     ▼
      [Product Detail Bottom Sheet]
      High-res image, full description,
      allergens, formatted EGP price.
```

### Journey 2: Restaurant Owner Routine Management

```
[Owner navigates to /login]
         │
         ▼
[Authenticates via HttpOnly Cookie]
         │
         ▼
[Dashboard Overview]  <-- Quick counters: Active Items, Categories, Published State, QR quick-action
         │
    ┌────┴──────────────────────────┬────────────────────────────┐
    ▼                               ▼                            ▼
[Category Management]        [Item Management]            [Brand & QR Export]
• Add/Rename Category        • Add New Dish               • Upload Logo & Banner
• Drag/Reorder Sequence      • Upload Image (1:1 / 4:3)   • Pick Primary Brand Color
• Toggle Category Visibility • Set Price in EGP           • Contrast validation
• Delete (with item guards)  • Toggle "Sold Out" status   • Download High-Res SVG/PNG
```

### Journey 3: Platform Admin Provisioning

```
[Platform Admin logs in at /login]
         │
         ▼
[/platform/restaurants]
         │
         ▼
[Click "Provision New Restaurant"]
         │
         ▼
[Modal Form: Name (AR/EN), Slug, Owner Email]
         │
         ▼
[Atomic Backend Execution]  <-- Creates Restaurant, Owner Identity, Generates Permanent PublicCode
         │
         ▼
[Copy Secure Setup URL or Send Invite]
         │
         ▼
[Audit Log Record Created]
```

---

## 4. Sitemap & Screen Inventory

| Screen ID | Route / URL | Experience | Rendering | Auth Requirement | Indexability | Primary Actions |
|---|---|---|---|---|---|---|
| **SCR-PUB-01** | `/r/:slug` | Public Menu | SSR + Hydrated | Anonymous | **Index, Follow** | Browse menu, scroll categories, search, switch language, open detail sheet |
| **SCR-PUB-02** | `/m/:publicCode` | Permanent QR Alias | HTTP 302 Redirect | Anonymous | **Noindex** | Permanent one-hop redirect to canonical `/r/:slug` |
| **SCR-PUB-03** | `/r/:slug?item=:id` | Product Deep Link | SSR + Hydrated | Anonymous | **Canonical to `/r/:slug`** | Opens menu with product detail sheet pre-expanded |
| **SCR-PUB-04** | `/r/:slug/unavailable` | Suspended / Draft | SSR | Anonymous | **404 / 410, Noindex** | Friendly non-disclosing message ("القائمة غير متاحة حالياً") |
| **SCR-ADM-01** | `/login` | Admin Sign-in | CSR | Anonymous | **Noindex, No-Store** | Email/password login, rate-limited feedback |
| **SCR-ADM-02** | `/admin` | Owner Overview | CSR | Owner Role | **Noindex, No-Store** | View menu stats, publish status banner, quick links |
| **SCR-ADM-03** | `/admin/categories`| Category Manager | CSR | Owner Role | **Noindex, No-Store** | Create, edit, reorder, and toggle category visibility |
| **SCR-ADM-04** | `/admin/items` | Menu Item Catalog | CSR | Owner Role | **Noindex, No-Store** | Search, filter by category, toggle availability, edit dish |
| **SCR-ADM-05** | `/admin/items/new` | Dish Creator | CSR | Owner Role | **Noindex, No-Store** | Bilingual names/descriptions, price input, image upload |
| **SCR-ADM-06** | `/admin/branding` | Brand & Theme | CSR | Owner Role | **Noindex, No-Store** | Upload logo, cover banner, pick theme accent color |
| **SCR-ADM-07** | `/admin/qr` | QR Code Studio | CSR | Owner Role | **Noindex, No-Store** | Preview table card, export PNG/SVG, copy short URL |
| **SCR-PLT-01** | `/platform` | Platform Overview | CSR | Platform Admin | **Noindex, No-Store** | View restaurant count, system metrics |
| **SCR-PLT-02** | `/platform/restaurants`| Tenants Manager | CSR | Platform Admin | **Noindex, No-Store** | Provision tenant, suspend/reactivate, view audit logs |

---

## 5. Screen States & Ergonomic Matrix

To ensure robustness, every view must define and gracefully render the following states:

| State Type | Trigger Condition | Visual Presentation | Recovery / Action Affordance |
|---|---|---|---|
| **Initial SSR** | First HTTP GET from user or web crawler | Pure semantic HTML rendered server-side with inline critical CSS. | Full readability before JS executes. |
| **Hydrated Ready** | Angular client bundle attaches | Smooth transitions activated, search filter live, category scroll spy enabled. | Interactive touch and keyboard navigation. |
| **Empty Menu** | Restaurant has no published categories or items | Elegant illustration of a chef's cloche; text: *"القائمة قيد الإعداد - زورونا قريباً"* | Informative, welcoming brand tone; no broken errors. |
| **Search Empty** | Search term yields 0 matching dishes | Centered search icon; text: *"لم نجد أطباقاً تطابق بحثك"* | Clear *"مسح البحث"* (Reset Search) button returning to full list. |
| **Item Unavailable** | Item `isAvailable == false` ("نفد") | Card visual desaturated (opacity 0.7); distinct pill badge *"نفد"* / *"Sold Out"*. | Customer sees item and price but knows it cannot be served today. |
| **Category Hidden** | Category `isPublished == false` | Category and its contained items hidden completely from public API & DOM. | Server-enforced privacy; zero client leakage. |
| **Offline / Network Loss** | Client loses mobile data connection during interaction | Discreet floating snackbar alert: *"لا يوجد اتصال بالإنترنت"* | Cached view remains scrollable; retry button available. |
| **Restaurant Suspended** | Platform admin suspended restaurant or owner unpublished | Friendly, neutral status card: *"هذه القائمة غير متاحة حالياً"* (HTTP 404/410). | Never leaks internal tenant IDs, suspension reasons, or private notes. |
| **Loading Skeleton** | Dynamic route navigation (e.g. category switch) | Shimmer placeholder matching exact pixel dimensions of item card & image. | Zero Cumulative Layout Shift (CLS = 0). |

---

## 6. Responsive Breakpoint Strategy

We employ a strict **Mobile-First Responsive Strategy**:

```
[320px: Ultra-Narrow Phone]  --> 1 column compact list cards, 44px touch targets, tight padding (12px)
[375px: Standard Smartphone]  --> 1 column standard card list, sticky category chips, full hero banner
[768px: Tablet / Foldable]   --> 2 column product card grid, persistent category sidebar or top bar
[1024px+: Desktop / Laptop]   --> Max-width centered container (640px for mobile preview mode OR full desktop catalog)
```

1. **Ultra-Narrow (320px – 359px):** Guaranteed compatibility with legacy or compact devices. Card layout drops secondary icons, clamps title to 2 lines, preserves price visibility.
2. **Standard Mobile (360px – 430px):** Primary focus (80%+ of restaurant traffic). Sticky category bar with horizontal swipe, compact horizontal card rows with 80x80px square food photos.
3. **Tablet (768px – 1023px):** Two-column card grid with 4:3 product imagery. Owner admin shows comfortable tables with full inline action buttons.
4. **Desktop (1024px+):** Admin dashboard features fixed collapsible sidebar navigation; public menu presents a refined, focused container with optimal line lengths (max-width `720px`).

---

## 7. RTL (Arabic) & LTR (English) Specification

Arabic is the primary language (`dir="rtl"`, `lang="ar"`). The system cleanly transitions to English (`dir="ltr"`, `lang="en"`) via CSS Logical Properties:

### A. Logical CSS Architecture
- Use `margin-inline-start`, `margin-inline-end`, `padding-inline-start`, `padding-inline-end`.
- Use `inset-inline-start`, `inset-inline-end` for absolute elements.
- Use `text-align: start` instead of `text-align: right` or `left`.

### B. Directional vs. Non-Directional UI Elements
- **Elements that MUST Flip in RTL:**
  - Back/Forward navigation arrows (`←` flips to `→`).
  - Search icon placement (aligns to start of input).
  - Price alignment (prices align to end of the card).
  - Category horizontal scroll order (starts at right in RTL, left in LTR).
  - Form validation error icons and input labels.
- **Elements that MUST NOT Flip:**
  - Phone numbers (`+20 100 ...` stays LTR).
  - Currency symbol standard notation (numeric digits remain Western Arabic `0-9` or Eastern Arabic consistent with locale).
  - Brand logos (rendered as designed).

### C. Arabic Typography Considerations
- Arabic typography has taller vertical ascenders and descenders. We enforce `line-height: 1.6` on body text (compared to `1.5` in Latin) and increase base font sizes by `1px` optical equivalent to ensure effortless legibility in restaurant lighting.

---

## 8. SEO & Performance First Guidelines

### A. Semantic HTML Requirements (Server Rendered)
```html
<main>
  <header>
    <!-- Descriptive semantic H1 for restaurant -->
    <h1>مطعم السرايا</h1>
    <p>أشهى المأكولات الشرقية والمشويات في قلب القاهرة</p>
  </header>
  
  <nav aria-label="أقسام القائمة">
    <!-- Category jump links -->
    <a href="#cat-appetizers">المقبلات</a>
    <a href="#cat-grills">المشويات</a>
  </nav>

  <section id="cat-grills">
    <h2>المشويات</h2>
    <article itemscope itemtype="https://schema.org/MenuItem">
      <h3 itemprop="name">كباب مشوي على الفحم</h3>
      <p itemprop="description">لحم بلدي متبل بخلطة السرايا الخاصة يقدم مع الأرز والخبز</p>
      <span itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <span itemprop="price">180.00</span>
        <span itemprop="priceCurrency">EGP</span>
      </span>
      <img src="/media/items/kebab-thumb.webp" width="80" height="80" alt="كباب مشوي على الفحم" loading="lazy" />
    </article>
  </section>
</main>
```

### B. Core Web Vitals Targets & Asset Strategy
- **LCP (Largest Contentful Paint) <= 2.5s:**
  - Above-the-fold hero logo uses `NgOptimizedImage` with `priority` attribute and explicit `width="64"` and `height="64"`.
  - Avoid large, uncompressed hero background banners that push menu text below the fold.
  - Server embeds critical CSS inline; system fonts or optimized WOFF2 font subsets loaded with `font-display: swap`.
- **CLS (Cumulative Layout Shift) <= 0.1:**
  - Every image container specifies fixed CSS `aspect-ratio: 1 / 1` or `4 / 3`.
  - Placeholder skeletons strictly mirror the final card dimensions.
  - Sticky navigation bar height is pre-allocated (`min-height: 56px`).
- **INP (Interaction to Next Paint) <= 200ms:**
  - Debounced search filter (`150ms`).
  - Lightweight DOM manipulations using Angular signals and modern change detection.
  - Zero heavy third-party tracking scripts or animation libraries.
