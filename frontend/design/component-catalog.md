# Design System Component Inventory & API Specifications

**Document Version:** 1.0.0  
**Target Milestone:** U01 — Mobile-first UI/UX Design System  
**Framework Baseline:** Angular 22+ (Standalone Components, Signals, Native Control Flow)

---

## 1. Component Architecture & Conventions

Every component in this design system conforms to the following standards:
1. **Standalone & Tree-Shakeable:** Zero bloated third-party UI library dependencies.
2. **Accessible by Default (WCAG 2.2 AA):** Built-in semantic HTML tags, keyboard focus rings, and proper ARIA states.
3. **Direction-Agnostic:** Uses CSS logical properties (`margin-inline`, `padding-inline`) to function identically in RTL (Arabic) and LTR (English).
4. **SSR-Compatible:** Renders clean, valid HTML on the server without referencing `window` or `document` prior to hydration.

---

## 2. Public Experience Component Catalog

### 1. `BrandHeader`
- **Purpose:** Renders the restaurant logo, display name, optional tagline/cuisine summary, and language toggle.
- **Inputs:**
  - `name: string` (Required)
  - `tagline?: string`
  - `logoUrl?: string`
  - `primaryColor?: string`
  - `currentLang: 'ar' | 'en'`
- **Outputs:**
  - `langChange: EventEmitter<'ar' | 'en'>`
- **SEO & Performance Specification:**
  - Emits the semantic `<h1>` element.
  - Logo rendered using explicit dimensions (`width="56" height="56"` or `48x48`). If above the fold, priority loading is applied.
  - Zero layout shift: Fixed container min-height.

---

### 2. `CategoryChipsNav`
- **Purpose:** Sticky horizontal swipeable navigation allowing diners to jump between food categories.
- **Inputs:**
  - `categories: Array<{ id: string; name: string; count?: number }>`
  - `activeCategoryId: string`
- **Outputs:**
  - `categorySelect: EventEmitter<string>`
- **Keyboard & Touch Ergonomics:**
  - Implements `role="tablist"` and `role="tab"`.
  - Arrow keys (`ArrowLeft`, `ArrowRight`) move focus between tabs.
  - Active chip has `aria-selected="true"` and an active pill indicator using `--tenant-primary`.
  - Native CSS `scroll-snap-type: x mandatory` ensures smooth finger swiping on mobile.

---

### 3. `ProductCard`
- **Purpose:** Primary display unit for a menu dish or drink.
- **Layout Variations:**
  - *Mobile Default:* Compact horizontal row (`display: flex; gap: 12px; align-items: center; min-height: 96px`).
  - *Tablet / Desktop:* Vertical card (`display: flex; flex-direction: column`).
- **Inputs:**
  - `item: { id: string; name: string; description?: string; price: number; currency: string; imageUrl?: string; isAvailable: boolean }`
- **Outputs:**
  - `cardClick: EventEmitter<string>`
- **States & Accessibility:**
  - Wrapped in semantic `<article itemscope itemtype="https://schema.org/MenuItem">`.
  - If `isAvailable === false`, applies desaturated styling (`opacity: 0.7`) and displays the `AvailabilityBadge` with text "نفد" / "Sold Out".
  - Price is formatted through `Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })` in Arabic, or Western Arabic numbers in English.
  - Image container has a fixed `aspect-ratio: 1 / 1` and `overflow: hidden; border-radius: 8px`.

---

### 4. `ProductDetailSheet` (Modal / Bottom Sheet)
- **Purpose:** Displays an expanded, high-resolution view of a dish with complete descriptions and dietary info when a customer taps a card.
- **Inputs:**
  - `isOpen: boolean`
  - `item: ProductItem | null`
- **Outputs:**
  - `close: EventEmitter<void>`
- **Ergonomics & Focus Trap:**
  - Implements `role="dialog"` and `aria-modal="true"`.
  - Focus is trapped within the sheet while open; pressing `Escape` emits `close`.
  - Touch: Swipe-down gesture or tap on backdrop dismisses the sheet.
  - Body scroll is locked while active (`overflow: hidden` on body).

---

### 5. `SearchBar`
- **Purpose:** Instant debounced search filtering dishes by name or description.
- **Inputs:**
  - `placeholder?: string` (Default: "ابحث عن طبق أو مشروب...")
  - `debounceMs?: number` (Default: 150)
- **Outputs:**
  - `queryChange: EventEmitter<string>`
- **Accessibility:**
  - Input with `type="search"`, explicit `aria-label`.
  - Includes a prominent clear button (`[ ✕ ]`) when text is present (`min-width: 44px; min-height: 44px`).
  - Live search status communicates count to screen readers via an `aria-live="polite"` region.

---

### 6. `AvailabilityBadge`
- **Purpose:** Unmistakable visual indicator of dish status.
- **Variants:**
  - `available`: Subtle green tint background (`#DCFCE7`), text `#15803D`.
  - `soldOut`: Slate muted background (`#F1F5F9`), text `#64748B`, strikethrough optional.
- **Design Tokens:** Border radius `9999px` (pill), padding `2px 8px`, font size `0.75rem` (`12px`), font weight `600`.

---

### 7. `StatePlaceholder`
- **Purpose:** Handles Empty, Search Not Found, Network Offline, and 404/Suspended scenarios.
- **Inputs:**
  - `type: 'empty-menu' | 'empty-search' | 'offline' | 'unavailable'`
  - `customTitle?: string`
  - `customMessage?: string`
  - `actionText?: string`
- **Outputs:**
  - `actionClick: EventEmitter<void>`
- **Content Matrix:**
  - *Empty Menu:* "القائمة قيد الإعداد والتجهيز" — "زورونا قريباً للاطلاع على أشهى الأطباق".
  - *Empty Search:* "لم يتم العثور على أطباق" — Action: "مسح البحث".
  - *Offline:* "انقطع الاتصال بالإنترنت" — Action: "إعادة المحاولة".
  - *Unavailable (404/410):* "هذه القائمة غير متاحة حالياً" — Neutral, safe messaging.

---

### 8. `SkeletonLoader`
- **Purpose:** Shimmer placeholder matching exact card and header dimensions during lazy-load transitions.
- **Implementation:**
  - Pure CSS gradient animation (`linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)`).
  - Strict pixel heights: Card row = `96px`, Thumbnail = `80x80px`, Title = `18px`, Price = `16px`.
  - Zero Cumulative Layout Shift (CLS = 0).

---

## 3. Owner & Platform Admin Component Catalog

### 9. `AdminHeader` & `AdminSidebar`
- **Purpose:** Navigation shell for restaurant owners and platform managers.
- **Responsive Behavior:**
  - *Mobile (< 768px):* Top bar with tenant brand title and hamburger menu / bottom navigation bar for high-frequency actions.
  - *Desktop (>= 768px):* Persistent sidebar with logo, navigation links, tenant status indicator, and sign-out button.

---

### 10. `AdminDataTable`
- **Purpose:** Display lists of categories, items, and platform tenants.
- **Responsive Transformation:**
  - On desktop: Full HTML `<table>` with headers, sorting indicators, and actions column.
  - On mobile: Automatically collapses each row into a readable card stack to prevent awkward horizontal table scrolling.

---

### 11. `ImageUploadZone`
- **Purpose:** Intuitive drag-and-drop food and logo image uploader with client validation.
- **Validation Rules (Client-side pre-flight):**
  - Allowed MIME types: `image/webp`, `image/jpeg`, `image/png`.
  - Max file size: 2.0 MB.
  - Aspect ratio guide: `1:1` (square for icons/thumbnails) or `4:3` (dishes).
- **Features:**
  - Real-time client-side image preview before sending multipart request.
  - Crop and remove action buttons (`min-height: 44px`).

---

### 12. `ColorPickerContrastGuard`
- **Purpose:** Allows restaurant owners to customize their brand accent color while enforcing WCAG AA contrast rules.
- **Features:**
  - Curated palette of pre-tested restaurant brand colors (Emerald, Navy, Crimson, Warm Amber, Deep Purple).
  - Hex code input with real-time contrast ratio calculator against white and dark text.
  - Visual badge: "✅ متوافق مع معايير القراءة (Contrast 7.4:1)" or "⚠️ تنبيه: التباين ضعيف، يرجى اختيار درجة أغمق".

---

### 13. `QRAssetCard`
- **Purpose:** Preview and download permanent QR codes.
- **Features:**
  - Vector SVG rendering of the stable `/m/:publicCode` URL.
  - One-click "Copy URL" with toast feedback.
  - "Download High-Res PNG (1024x1024)" for digital display.
  - "Download Vector SVG" for commercial print and acrylic table stands.
