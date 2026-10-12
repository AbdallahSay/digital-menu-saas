# Admin Experience Architecture & Form States Specification (U02-PREP)

**Document Version:** 1.0.0  
**Target Milestone:** U02 — Admin Auth, Category Forms and States  
**Status:** Design & Architectural Specification Ready for Implementation  
**Audience:** Frontend Engineers (U02 Implementation), Codex (Backend & Auth Integration), QA Engineers

---

## 1. Executive Summary & Design Goals

The Restaurant Owner and Platform Admin experiences are the operational heart of the Digital Menu SaaS. Designed around the needs of non-technical restaurant managers, chefs, and branch operators, the admin interface focuses on:

1. **Frictionless Mobile-First Management:** Routine operational tasks—such as updating category ordering, toggling visibility, or updating availability—take fewer than three taps on any smartphone.
2. **Strict Server-Derived Tenant Isolation:** The admin interface never sends or trusts client-supplied `tenantId` or `restaurantId` parameters. All administrative views resolve tenant scope exclusively from the authenticated HttpOnly/Secure session cookie.
3. **Robust Form Ergonomics & Clear State Feedback:** Immediate client-side validation, helpful error messages aligned with RFC 7807 `ProblemDetails`, distinct loading spinners, and actionable empty and conflict states.
4. **Accessible by Default (WCAG 2.2 AA):** High-contrast typography, 44px+ minimum touch targets, complete keyboard focus traps for modal dialogs, and native support for Arabic (RTL) and English (LTR).

---

## 2. Authentication & Session Architecture (`/login`)

```
[Owner Navigates to /login]
         │
         ▼
[CSR Login Form Rendered]
         │
         ├── User inputs: Email & Password
         │   └── Real-time client-side validation (RFC 5322 Email regex, min 8 chars password)
         │
         ▼
[Submit Button Pressed]
         │
         ▼
[POST /api/v1/auth/login]  <-- Includes CSRF protection token & credentials
         │
    ┌────┴──────────────────────────┬────────────────────────────┐
    ▼                               ▼                            ▼
[200 OK: Session Cookie Set]    [401 Unauthorized]           [429 Too Many Requests]
• SameSite=Lax/Strict           • Generic error message:     • Lockout countdown timer
• HttpOnly & Secure               "البريد الإلكتروني أو       • Generic feedback:
• Redirects to /admin             كلمة المرور غير صحيحة"       "تم تجاوز الحد المسموح،
                                • Prevents user enumeration    يرجى الانتظار 60 ثانية"
```

### Authentication Contract Specifications:
- **Session Mechanism:** ASP.NET Core Identity with HttpOnly, Secure, SameSite cookies. Zero session tokens or credentials in `localStorage` or `sessionStorage`.
- **CSRF Defense:** Unsafe mutating HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) require an anti-forgery token passed via header (`X-XSRF-TOKEN`) obtained from the anti-forgery handshake.
- **Account Lockout:** Strict rate limiting after repeated failures (5 consecutive failures lock the account for 5 minutes). Error responses return generic status to prevent username enumeration.
- **Suspended Tenant Guard:** If the restaurant is suspended by Platform Admin, login responds with HTTP 403 Forbidden with user-friendly message: *"حساب المطعم معلق حالياً، يرجى التواصل مع إدارة المنصة"* without disclosing internal administrative details.

---

## 3. Screen Inventory & Flow Specifications

### Screen A: Admin Shell & Overview (`/admin`)
- **Header:** Displays restaurant name (`nameAr`), restaurant logo thumbnail, authenticated owner email, and active publication badge (🟢 منشورة / ⚪ مسودة).
- **Public Menu Preview:** Quick-launch link to preview the public menu in an authenticated preview mode or canonical URL.
- **Responsive Navigation:**
  - *Mobile (< 768px):* Bottom navigation bar with 5 primary thumb-accessible icons:
    1. 📊 الرئيسية (Dashboard)
    2. 📁 الأقسام (Categories)
    3. 🍽️ الأطباق (Items)
    4. 🎨 الهوية (Branding)
    5. 📱 رمز QR (QR Studio)
  - *Desktop (≥ 768px):* Persistent sidebar navigation with active route indicator and logout button.
- **KPI Summary Cards:**
  - Active Categories count
  - Active Published Items count
  - Sold-Out Items count
  - Publication Status switch (Publish / Unpublish entire restaurant)

---

### Screen B: Category Management (`/admin/categories`)
- **Inventory Presentation:**
  - *Desktop (≥ 768px):* High-density HTML data table with columns: `ترتيب (Order)`, `اسم القسم بالعربية (Name AR)`, `اسم القسم بالإنجليزية (Name EN)`, `عدد الأطباق (Items Count)`, `الحالة (Status)`, and `الإجراءات (Actions)`.
  - *Mobile (< 768px):* Collapses into stacked category cards to eliminate awkward horizontal scrolling.
- **Ordering & Sequence Management:**
  - Each category displays its integer `displayOrder`.
  - Reorder buttons (Move Up `▲` / Move Down `▼`) provide instant visual reordering with optimistic UI updates, followed by backend synchronization.
- **Publication Toggle:**
  - Single-tap switch (🟢 منشور / ⚪ مخفي).
  - Toggling a category to hidden instantly hides all associated items from the public menu without deleting them.

---

## 4. Modal Dialogs & Form Validation Matrix

### Category Create / Edit Form Contract

| Field Name | Type | Constraints | Validation Rule | Error Message (AR) | Error Message (EN) |
|---|---|---|---|---|---|
| `nameAr` | `string` | Required, 2–100 chars | Non-empty, Arabic or alphanumeric characters | *"اسم القسم بالعربية مطلوب (من 2 إلى 100 حرف)"* | *"Arabic category name is required (2-100 characters)"* |
| `nameEn` | `string` | Optional, 0–100 chars | Latin characters, spaces, punctuation | *"اسم القسم بالإنجليزية يجب ألا يتجاوز 100 حرف"* | *"English name must not exceed 100 characters"* |
| `displayOrder` | `integer` | Required, ≥ 1 | Positive integer | *"الترتيب يجب أن يكون رقماً موجباً"* | *"Order must be a positive integer"* |
| `isPublished` | `boolean` | Required | `true` or `false` | N/A | N/A |

### Deletion Guard & Relational Integrity (Conflict Handling)
When an owner clicks "Delete Category":
1. **Scenario 1: Category contains active items (`itemCount > 0`):**
   - The system intercepts the action and displays an informative warning dialog:
     *"⚠️ لا يمكن حذف هذا القسم لأنه يحتوي على {count} طبقاً نشطاً. للحفاظ على سلامة القائمة، يرجى نقل الأطباق إلى قسم آخر أو حذفها أولاً."*
   - HTTP Status: `409 Conflict` (Backend relational guard enforced via foreign key constraint).
   - Deletion is safely prevented.
2. **Scenario 2: Category is empty (`itemCount === 0`):**
   - Displays a confirmation dialog:
     *"هل أنت متأكد من حذف قسم '{name}'؟ لا يمكن التراجع عن هذا الإجراء."*
   - Actions: `[ إلغاء ]` (Secondary button) and `[ تأكيد الحذف ]` (Destructive Red button).
   - Upon confirmation, deletes resource and emits HTTP `204 No Content`.

---

## 5. Security & Safe DOM Rendering Invariants

1. **Zero `innerHTML` for Tenant-Controlled Data:**
   - All dynamic tenant text (category names, restaurant name, item counts) MUST be inserted via `element.textContent` or native Angular interpolation `{{ category.nameAr }}`.
   - Prohibit `[innerHTML]` to prevent Stored Cross-Site Scripting (XSS).
2. **Client-Side Sanitization & Character Limits:**
   - Text inputs enforce `maxlength="100"` at the HTML level and trim leading/trailing whitespace.
3. **ProblemDetails Error Extraction:**
   - Backend error responses strictly conform to RFC 7807 (`ProblemDetails`).
   - The UI extracts the user-friendly `detail` or `errors` array, displaying actionable toast alerts without ever leaking internal server stack traces or database table names.

---

## 6. Keyboard & Modal Accessibility Checklist (WCAG 2.2 AA)

- [x] **Focus Management on Dialog Open:** When Create/Edit/Delete modals open, focus shifts immediately to the first interactive input or close button.
- [x] **Focus Trap:** Tabbing wraps within the dialog container while active; background elements receive `aria-hidden="true"`.
- [x] **Escape Key Dismissal:** Pressing `Escape` closes any active modal dialog immediately.
- [x] **Focus Return:** When a modal closes, keyboard focus returns precisely to the button that triggered the modal.
- [x] **Accessible Form Labels:** Every `<input>` has an explicit `<label for="...">` and `aria-describedby` pointing to validation error messages.

---

## 7. Angular 22+ Handoff & Implementation Tasks for U02

When implementing U02 in Angular:
1. **Components to Scaffold under `frontend/src/app/features/owner-admin/`:**
   - `pages/login/login.component.ts` (Reactive Forms with strict validators)
   - `pages/dashboard/dashboard.component.ts` (Summary KPI cards)
   - `pages/categories/category-list.component.ts` (Data table with responsive card fallback)
   - `components/category-form-modal/category-form-modal.component.ts` (Standalone modal dialog)
   - `components/category-delete-dialog/category-delete-dialog.component.ts` (Relational guard modal)
2. **State Management:**
   - Implement `CategoryStateService` using Angular Signals (`categories = signal<CategoryDto[]>([])`).
   - Compute sorted categories: `sortedCategories = computed(() => this.categories().slice().sort((a,b) => a.displayOrder - b.displayOrder))`.
3. **HTTP Client:**
   - Strongly typed against backend DTOs (`CategoryDto`, `CreateCategoryRequest`, `UpdateCategoryRequest`).
