# Digital Menu SaaS — Admin Experience Architecture & Design Specifications (U02-PREP)

**Document Version:** 2.0.0  
**Target Milestone:** U02 — Admin Auth, Category Forms, Catalog Management, Branding, QR & Platform Admin  
**Status:** Design & Architectural Specification Ready for Implementation (PREP Phase)  
**Task Association:** Pre-implementation for Issue #15 (U02)  
**Dependencies:** Depends on P0 Architecture Approval ([Issue #4](https://github.com/AbdallahSay/digital-menu-saas/issues/4)), Codex F03 (Identity Sessions), and Codex F06 (Category API Endpoints)  
**Audience:** Frontend Engineers, UX Quality Engineers, Codex (Backend Architecture), Platform Administrators  

---

## 1. Executive Summary & Design Principles

The Digital Menu SaaS administration suite comprises two distinct operational tiers:
1. **Restaurant Owner Dashboard:** Streamlined, mobile-first management for non-technical restaurant managers, chefs, and staff. Everyday tasks (updating availability, reordering categories, editing dish prices) require **fewer than three taps** on a mobile screen.
2. **Platform Admin Portal:** High-density, multi-tenant directory and provisioning engine for platform operators to manage restaurants, monitor tenant health, suspend/reactivate tenants, and inspect operational metrics.

### Core Architectural Invariants
- **Display-Only MVP Strict Alignment:** No ordering, cart, checkout, payments, POS, or delivery features. All item and category availability indicators strictly use **"Available" / "متوفر"** or **"Sold out" / "نفد"**.
- **Strict Server-Derived Tenant Isolation:** The owner admin interface **never** passes client-supplied `tenantId` or `restaurantId` query parameters or body payloads. Tenant isolation is strictly resolved server-side from the authenticated, secure HttpOnly cookie session.
- **Pure Safe DOM APIs:** Zero dynamic string concatenation or `innerHTML` interpolation for tenant-controlled data. All rendered strings use `textContent` (or Angular template data binding `{{ ... }}`).
- **Arabic-First RTL / English LTR Dual Native:** Arabic is the primary commercial interface language, with complete mirror support for English LTR.
- **WCAG 2.2 AA Accessibility:** Accessible color contrast (≥ 4.5:1), 44px+ minimum touch targets, complete keyboard focus traps for modal dialogs, and instant `Escape` key dismissal with focus restoration.

---

## 2. Authentication & Session Architecture (`/login`)

```
[User Navigates to /login]
                  │
                  ▼
      [CSRF Handshake Pre-flight]
      GET /api/v1/auth/csrf -> Receives XSRF-TOKEN cookie & header name
                  │
                  ▼
         [CSR Login Screen]
                  │
                  ├── Inputs: Email (RFC 5322, max 256) & Password (min 12, max 256)
                  │   └── Client validation aligned with backend Identity constraints
                  │
                  ▼
         [Submit Button Pressed]
                  │
                  ▼
     [POST /api/v1/auth/login]  <-- X-XSRF-TOKEN header + credentials
                  │
     ┌────────────┴───────────────────────┬────────────────────────────┐
     ▼                                    ▼                            ▼
[204 No Content: Session Cookie Set]  [401 Unauthorized]       [429 Too Many Requests]
• __Host-DigitalMenu.Session cookie  • Generic ProblemDetails: • IP rate limit (10 req/min)
• HttpOnly, Secure, SameSite=Strict    "Invalid credentials."  • Cooldown feedback:
• 30-min fixed absolute lifetime     • Unified for: bad pwd,     "تم تجاوز الحد المسموح،
• Refresh CSRF: GET /auth/csrf         unknown user, lockout,    يرجى الانتظار 60 ثانية"
• Profile fetch: GET /auth/me          or suspended tenant
• Route: /platform or /admin           (zero enumeration)
```

### Security & Session Contracts (F03 Implementation Alignment)
- **Session Cookie:** Issued by ASP.NET Core Identity as `__Host-DigitalMenu.Session`. Flags: `HttpOnly = true`, `Secure = true` (Always), `SameSite = SameSiteMode.Strict`, `Path = "/"`. Fixed absolute lifetime of 30 minutes (`ExpireTimeSpan = 30m`, `SlidingExpiration = false`). Security stamp validation executes on each request (`ValidationInterval = TimeSpan.Zero`) without extending absolute session expiry (`context.ShouldRenew = false`). Tokens are never accessible to client scripts or stored in `localStorage`/`sessionStorage`.
- **CSRF Handshake & Defense:** Prior to authentication, frontend initiates `GET /api/v1/auth/csrf` (over HTTPS) to retrieve the anti-forgery token cookie `XSRF-TOKEN` and header name `X-XSRF-TOKEN`. Mutation requests include `X-XSRF-TOKEN` validated against the encrypted `__Host-DigitalMenu.Antiforgery` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`). Post-login, CSRF handshake is refreshed to bind the token to the newly established authenticated principal.
- **Account Lockout & Anti-Enumeration Invariants:** ASP.NET Core Identity is configured with `MaxFailedAccessAttempts = 5` and `DefaultLockoutTimeSpan = 15 minutes`. To prevent user enumeration and timing side-channels, `POST /api/v1/auth/login` returns uniform HTTP 401 ProblemDetails (`title: "Invalid credentials."`) for:
  1. Non-existent email addresses (a dummy password hash is calculated to equalize execution time).
  2. Incorrect passwords.
  3. Locked-out accounts (5 consecutive failures).
  4. Accounts belonging to inactive or suspended restaurants (`restaurant.Status != "Active"`).
- **No Account-Revealing 403 on Login:** Login **never** returns HTTP 403 for suspended or deactivated accounts; doing so would confirm valid credentials and expose tenant administrative status to unauthenticated attackers. Suspended accounts simply receive the generic 401 ProblemDetails.
- **Rate Limiting:** `auth` policy enforces a fixed window partition limiter per client IP: 10 permits per 1-minute window, returning HTTP 429 ProblemDetails (`title: "Too many requests."`).
- **Profile-Based Role Routing:** Routing to `/platform` (Platform Admin) or `/admin` (Restaurant Owner) is determined exclusively by the server via `GET /api/v1/auth/me` inspection of identity claims and active restaurant memberships. The login screen never offers client-selected roles.

---

## 3. Screen Inventory & UX Specifications

### Screen 1: Owner Authentication (`/login`)
- **Visual Design:** Centered card on canvas background (`#0b1329`), featuring the SaaS brand mark, bilingual title, form inputs, and clear password visibility toggle.
- **Interactive State Handlers:**
  - Email format validation (RFC 5322 regex, max 256 characters) with immediate feedback.
  - Password field validation (min 12 characters matching backend Identity policy, max 256).
  - Show/hide password eye icon with accessible `aria-label`.
  - Loading spinner on submit button with `aria-busy="true"`.
  - Error banner rendering RFC 7807 `ProblemDetails` error messages safely.
  - Generic 401 handling: displays generic "Invalid credentials." / "البريد الإلكتروني أو كلمة المرور غير صحيحة" for unknown, bad password, suspended, or locked accounts without revealing account status.
  - Rate limiting 429 handling: displays cooldown message ("Too many requests. Please wait 60 seconds.") on HTTP 429 rejection.
  - Automatic post-login flow: HTTP 204 response -> fresh CSRF handshake -> `GET /api/v1/auth/me` -> automatic routing to `/admin` (Owner) or `/platform` (Platform Admin).

---

### Screen 2: Owner Dashboard Shell & Overview (`/admin`)
- **Header:** Displays restaurant name (`nameAr`), restaurant logo thumbnail, authenticated owner identity, publication state badge (🟢 منشورة / ⚪ مسودة), and link to preview public menu.
- **Responsive Layout:**
  - *Mobile (< 768px):* Fixed bottom navigation bar with 5 primary thumb-accessible icons:
    1. 📊 الرئيسية (Dashboard)
    2. 📁 الأقسام (Categories)
    3. 🍽️ الأطباق (Items)
    4. 🎨 الهوية (Branding)
    5. 📱 رمز QR (QR Studio)
  - *Desktop (≥ 768px):* Persistent collapsible sidebar navigation with route indicators and logout button.
- **KPI Summary Cards:**
  - **الأقسام النشطة (Active Categories):** Count of published categories.
  - **الأطباق المنشورة (Published Items):** Total active dishes.
  - **الأطباق غير المتوفرة (Sold-Out Items):** Quick indicator for dishes marked as sold out.
  - **حالة نشر القائمة (Publication Status):** Master toggle to publish or unpublish the entire digital menu.
- **Quick Action Bar:** 1-tap shortcuts for "+ إضافة قسم", "+ إضافة طبق", "تخصيص الهوية", and "تحميل رمز QR".

---

### Screen 3: Category Management (`/admin/categories`)
- **Responsive Data Presentation:**
  - *Desktop (≥ 768px):* High-density HTML data table with columns: `ترتيب (Order)`, `اسم القسم بالعربية (Name AR)`, `اسم القسم بالإنجليزية (Name EN)`, `عدد الأطباق (Items Count)`, `الحالة (Status)`, and `الإجراءات (Actions)`.
  - *Mobile (< 768px):* Collapses into stacked category cards to eliminate horizontal scroll bars.
- **Ordering & Sequence Management:**
  - Each category displays its integer `displayOrder`.
  - Reorder buttons (Move Up `▲` / Move Down `▼`) provide instant visual reordering with optimistic UI updates.
- **Publication Toggle:**
  - Single-tap switch (🟢 منشور / ⚪ مخفي). Hiding a category instantly hides all child items from the public menu without deletion.
- **Relational Integrity Deletion Guard (HTTP 409 Simulation):**
  - **Category contains items (`itemCount > 0`):** Deletion is blocked with a warning dialog:
    *"⚠️ لا يمكن حذف هذا القسم لأنه يحتوي على {count} طبقاً نشطاً. للحفاظ على سلامة القائمة، يرجى نقل الأطباق إلى قسم آخر أو حذفها أولاً."*
  - **Category is empty (`itemCount === 0`):** Prompts for deletion confirmation with destructive styling:
    *"هل أنت متأكد من حذف قسم '{name}'؟ لا يمكن التراجع عن هذا الإجراء."*

---

### Screen 4: Menu Items Catalog (`/admin/items`)
- **Inventory Toolbar:** Search input by dish name, filter by category dropdown, and quick toggle to show "Only Sold Out" dishes.
- **Item Cards / Table Presentation:**
  - Thumbnail preview with aspect ratio indicator (`1:1` or `4:3`).
  - Bilingual title (`nameAr` / `nameEn`) and EGP price (`185.00 ج.م`).
  - Instant availability toggle (🟢 متوفر / ⚪ نفد).
  - Edit and Delete action buttons.
- **Item Create / Edit Modal:**
  - Bilingual dish names (`nameAr` required, `nameEn` optional).
  - Category selector dropdown.
  - Price in EGP (numeric with decimal validation, ≥ 0.01).
  - Description textarea (`descriptionAr` / `descriptionEn`).
  - Image uploader preview with aspect ratio selection (`1:1` square for dishes, `4:3` standard).
  - Instant availability checkbox (`isAvailable`).

---

### Screen 5: Restaurant Branding & Contrast Studio (`/admin/branding`)
- **Brand Customization Controls:**
  - Restaurant Logo uploader with live thumbnail preview.
  - Primary Brand Color palette with 6 preset restaurant swatches (Amber Gold `#d97706`, Emerald Green `#059669`, Crimson `#dc2626`, Royal Blue `#2563eb`, Deep Indigo `#4f46e5`, Charcoal `#334155`).
  - Custom HEX color input with live color picker.
- **Standard WCAG 2.1/2.2 Contrast Calculator:**
  - Standard relative luminance formula with sRGB linearization:
    For $C \in \{R, G, B\}$ normalized to $[0, 1]$: $C_{lin} = C / 12.92$ if $C \le 0.04045$, else $((C + 0.055) / 1.055)^{2.4}$.
    Relative luminance: $L = 0.2126 \times R_{lin} + 0.7152 \times G_{lin} + 0.0722 \times B_{lin}$.
  - Contrast ratio against white background ($L_w = 1.0$): $(1.05) / (L + 0.05)$.
  - Compliance evaluation against official thresholds:
    - Normal text: Level AA $\ge 4.5:1$, Level AAA $\ge 7.0:1$
    - Large text ($\ge 18\text{pt} / 24\text{px}$ or $\ge 14\text{pt} / 18.66\text{px}$ bold): Level AA $\ge 3.0:1$, Level AAA $\ge 4.5:1$
    - Graphical elements / UI components: Level AA $\ge 3.0:1$
  - Displays accurate compliance badges (e.g., Amber Gold `#d97706` is $3.23:1$, passing AA for large text only, whereas Charcoal `#334155` is $9.61:1$, passing AAA for normal text).
- **Strict Display-Only Menu Card Preview:**
  - Real-time interactive preview card showing how public dish presentation renders with the chosen brand color and logo.
  - Strictly display-only: shows availability badge ("متوفر" / "نفد") and "عرض التفاصيل". Zero ordering, cart, or payment language.

---

### Screen 6: Permanent QR Code Studio (`/admin/qr`)
- **Permanent Slug Architecture:**
  - Explains the architectural principle: The QR code encodes a permanent, immutable short URL alias (e.g., `https://menu.example.com/m/7F82A9C`) that **never changes**, even if the restaurant changes its name, branding, or menu items.
- **Functional Standards-Compliant QR Demonstration:**
  - Generates authentic ISO/IEC 18004 Model 2 QR Code matrices encoding permanent mock short URLs (e.g., `https://menu.example.com/m/7F82A9C`).
  - Verified scannability via mobile devices and QR scanners.
  - Transparent labeling: clearly marked as a functional demonstration of the scannable permanent QR link.
- **Genuine Export & Download Affordances:**
  - `[ نسخ الرابط الدائم ]`: Copies the permanent short URL to clipboard via `navigator.clipboard.writeText` with textarea fallback.
  - `[ تحميل PNG عالي الدقة (1024x1024) ]`: Generates and triggers actual high-resolution PNG image download rendered via HTML5 canvas with standard quiet zone margins.
  - `[ تحميل SVG فيكتور للطباعة ]`: Generates and triggers actual scalable vector SVG file download with infinite resolution for print media.

---

### Screen 7: Platform Admin Portal (`/platform/restaurants`)
- **Platform Header & Context:**
  - Platform administrator profile with badge (🛡️ مدير المنصة).
  - Platform-wide KPI metrics: Total Tenants, Active Tenants, Suspended Tenants, Total Menu Views today.
- **Multi-Tenant Directory:**
  - Search tenants by restaurant name, slug, or owner email.
  - Status filter tabs: `الكل (All)`, `نشط (Active)`, `معلق (Suspended)`.
  - Data table with columns: `المطعم (Restaurant)`, `الرابط (Slug)`, `المالك (Owner Email)`, `الأقسام والأطباق (Catalog)`, `تاريخ الإنشاء (Created Date)`, `الحالة (Status)`, `الإجراءات (Actions)`.
- **Tenant Suspension & Reactivation:**
  - Single-tap status toggle switch.
  - Suspending a restaurant immediately disables its public menu access (returns HTTP 404 / suspended notice) and blocks owner administrative access (login returns generic HTTP 401 ProblemDetails to prevent account enumeration).
- **Atomic Restaurant Provisioning Modal:**
  - Provisions restaurant and initial owner user in a single transactional step.
  - Fields: Restaurant Name (Arabic & English), Unique Slug, Owner Full Name, Owner Email, Initial Temporary Password.

---

## 4. Responsive Layout & Breakpoint Matrix

| Component / Screen | Mobile Viewport (< 768px, e.g. 375px) | Tablet Viewport (768px – 1023px) | Desktop Viewport (≥ 1024px) |
|---|---|---|---|
| **App Shell Navigation** | Fixed bottom navigation bar (5 primary icons) | Sidebar navigation with icons + labels | Persistent collapsible sidebar with full text |
| **Header Toolbar** | Condensed restaurant title + avatar + public preview | Full restaurant name + email + preview link | Full details + preview link + logout button |
| **Category List** | Stacked cards with touch-friendly Up/Down buttons | Compact data table | Full-width data table with hover actions |
| **Item Catalog** | Single-column cards with thumbnail + price + toggle | 2-column grid of item cards | High-density data table or 3-column card grid |
| **Modals & Dialogs** | Full-width bottom sheet or centered card (92vw) | Centered modal (600px max width) | Centered modal (600px max width) |
| **Branding Studio** | Single-column stack: Controls above preview card | 2-column side-by-side layout | 2-column side-by-side layout with live card preview |
| **QR Code Studio** | Centered QR card with stacked download buttons | Centered QR with horizontal button row | Two-column layout with QR preview and print guide |
| **Platform Directory** | Stacked tenant summary cards | Responsive scrollable table | High-density table with full audit timeline |

---

## 5. Form Validation Matrix & Relational Guards

### A. Category Form Validation
| Field | Type | Constraints | Validation Rule | Error Message (AR) | Error Message (EN) |
|---|---|---|---|---|---|
| `nameAr` | `string` | Required, 2–100 chars | Non-empty, Arabic or alphanumeric | *"اسم القسم بالعربية مطلوب (من 2 إلى 100 حرف)"* | *"Arabic category name is required (2-100 characters)"* |
| `nameEn` | `string` | Optional, 0–100 chars | Latin characters, spaces, punctuation | *"اسم القسم بالإنجليزية يجب ألا يتجاوز 100 حرف"* | *"English name must not exceed 100 characters"* |
| `displayOrder` | `integer` | Required, ≥ 1 | Positive integer | *"الترتيب يجب أن يكون رقماً موجباً"* | *"Order must be a positive integer"* |
| `isPublished` | `boolean` | Required | `true` or `false` | N/A | N/A |

### B. Menu Item Form Validation
| Field | Type | Constraints | Validation Rule | Error Message (AR) | Error Message (EN) |
|---|---|---|---|---|---|
| `nameAr` | `string` | Required, 2–120 chars | Non-empty Arabic or alphanumeric | *"اسم الطبق بالعربية مطلوب"* | *"Arabic item name is required"* |
| `nameEn` | `string` | Optional, 0–120 chars | Latin characters | *"اسم الطبق بالإنجليزية يجب ألا يتجاوز 120 حرفاً"* | *"English item name must not exceed 120 characters"* |
| `categoryId` | `guid` | Required | Valid category in tenant | *"يرجى اختيار القسم"* | *"Category selection is required"* |
| `priceEgp` | `decimal` | Required, > 0, max 99,999 | Decimal with up to 2 decimal places | *"السعر بالجنيه المصري مطلوب ويجب أن يكون أكبر من 0"* | *"Price must be greater than 0 EGP"* |
| `descriptionAr`| `string` | Optional, 0–500 chars | Plain text | *"الوصف يجب ألا يتجاوز 500 حرف"* | *"Description must not exceed 500 characters"* |
| `isAvailable` | `boolean` | Required | `true` or `false` | N/A | N/A |

### C. Category Deletion Relational Guard (HTTP 409 Conflict)
```
User clicks "Delete Category"
           │
           ▼
[Check Associated Items Count]
           │
    ┌──────┴────────────────────────────────────────┐
    ▼                                               ▼
[itemCount > 0]                                [itemCount === 0]
• Intercept action                              • Show confirmation dialog
• Display Relational Conflict Modal:            • "هل أنت متأكد من حذف قسم '{name}'؟"
  "⚠️ لا يمكن حذف هذا القسم لأنه يحتوي           • User confirms
  على {count} طبقاً نشطاً."                      • HTTP DELETE /api/v1/categories/{id}
• Explain foreign key integrity                 • Emit 204 No Content
• Action: [ حسناً، فهمت ذلك ] (Dismiss)        • Remove from local store & toast
```

---

## 6. Security, Safe DOM, and Accessibility Invariants

### Safe DOM API Rules
- **No `innerHTML` for Tenant Data:** Prohibit `element.innerHTML = ...` when interpolating user-supplied strings (`category.nameAr`, `item.nameAr`, `restaurant.nameAr`).
- **Enforce `textContent`:** Strictly use `document.createElement()`, `element.textContent`, and `element.setAttribute()` in prototypes and native Angular interpolation `{{ ... }}` in production.
- **Client Sanitization:** Input values are trimmed of leading/trailing whitespace and bounded by HTML `maxlength` attributes.

### WCAG 2.2 AA Accessibility Specifications
- **Modal Dialog Keyboard Trap:**
  - Upon opening, focus shifts immediately to the first interactive field (`inp-cat-name-ar`, `inp-item-name-ar`).
  - Pressing `Tab` cycles exclusively within the active dialog.
  - Background elements receive `aria-hidden="true"`.
- **Escape Key Dismissal:** Pressing `Escape` closes any open modal dialog immediately.
- **Focus Return:** When a dialog closes, keyboard focus returns precisely to the trigger button that opened it.
- **Color Contrast:** All administrative text satisfies WCAG AA (≥ 4.5:1 for normal text, ≥ 3:1 for large text).
- **Minimum Touch Targets:** All interactive buttons and toggles are sized to at least 44x44px.

---

## 7. Angular 22+ Handoff & Implementation Blueprint for U02

When implementing U02 in Angular upon completion of backend dependency F06:

### Component & File Structure (`frontend/src/app/features/owner-admin/`)
```
frontend/src/app/features/owner-admin/
├── pages/
│   ├── login/
│   │   ├── login.component.ts
│   │   ├── login.component.html
│   │   └── login.component.scss
│   ├── dashboard/
│   │   ├── dashboard.component.ts
│   │   └── dashboard.component.html
│   ├── categories/
│   │   ├── category-list.component.ts
│   │   └── category-list.component.html
│   ├── items/
│   │   ├── item-catalog.component.ts
│   │   └── item-catalog.component.html
│   ├── branding/
│   │   ├── branding-customizer.component.ts
│   │   └── branding-customizer.component.html
│   └── qr/
│       ├── qr-studio.component.ts
│       └── qr-studio.component.html
├── components/
│   ├── admin-shell/
│   │   ├── admin-shell.component.ts
│   │   ├── admin-header.component.ts
│   │   ├── admin-sidebar.component.ts
│   │   └── admin-bottom-nav.component.ts
│   ├── category-modal/
│   │   └── category-modal.component.ts
│   ├── category-conflict-dialog/
│   │   └── category-conflict-dialog.component.ts
│   └── item-modal/
│       └── item-modal.component.ts
├── services/
│   ├── category-state.service.ts
│   ├── item-state.service.ts
│   ├── branding-state.service.ts
│   └── admin-auth.service.ts
└── models/
    ├── category.dto.ts
    ├── item.dto.ts
    └── branding.dto.ts
```

### State Management via Angular Signals
```typescript
@Injectable({ providedIn: 'root' })
export class CategoryStateService {
  private readonly http = inject(HttpClient);
  
  // Reactive Signals State
  readonly categories = signal<CategoryDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // Computed Sorted Sequence
  readonly sortedCategories = computed(() => 
    [...this.categories()].sort((a, b) => a.displayOrder - b.displayOrder)
  );

  async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await firstValueFrom(this.http.get<CategoryDto[]>('/api/v1/categories'));
      this.categories.set(data);
    } catch (err) {
      this.error.set('فشل تحميل الأقسام');
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

---

## 8. Milestone Dependencies & Blocking Status

| Task ID | Task Title | Owner | Status | Impact on U02 |
|---|---|---|---|---|
| **P0** | Architecture Baseline & PRD Approval | Human Architect | Pending Approval ([Issue #4](https://github.com/AbdallahSay/digital-menu-saas/issues/4)) | **Blocks merge** of any production feature branches |
| **F01** | Backend & SSR Scaffolding | Codex | Merged | Foundation established |
| **F02** | Multi-Tenant Schema & Isolation Tests | Codex | Merged | Relational integrity and tenant tables available |
| **F03** | Identity Cookie Sessions & CSRF Guards | Codex | Merged ([PR #31](https://github.com/AbdallahSay/digital-menu-saas/pull/31)) | Authenticated `/login`, `__Host-DigitalMenu.Session`, and CSRF protection established |
| **F06** | Category Management API Endpoints | Codex | Not Started | **Hard blocker for real Angular U02 implementation** |
| **U01** | Mobile-First UI/UX Design System | Antigravity | Merged ([PR #25](https://github.com/AbdallahSay/digital-menu-saas/pull/25), [PR #27](https://github.com/AbdallahSay/digital-menu-saas/pull/27)) | Design tokens and preview merged into `main` |
| **U02-PREP** | Interactive Admin Experience Prototype | Antigravity | **Completed** ([PR #28](https://github.com/AbdallahSay/digital-menu-saas/pull/28), updating to `design/U02-admin-prototypes`) | Ready for human architectural review |
