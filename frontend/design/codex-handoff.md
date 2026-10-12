# Frontend Architecture Handoff Guide for Codex

**Document Version:** 1.1.0  
**Target Milestone:** U01 — Mobile-first UI/UX Design System  
**Audience:** Codex (Backend & SSR Architect) & Future Frontend Implementers (U02, U03, U04)

---

## 1. Architectural Boundaries & Division of Labor

- **U01 (Antigravity):** Design tokens, wireframes, component specs, UX architecture, and standalone design previews. No production code changes to Angular config or backend.
- **F01 – F09 (Codex):** .NET 10 API, SQL persistence, Identity auth, tenant isolation guards, media upload pipeline, and SSR public projection API.
- **U02 (Admin Categories & Auth):** Implements Owner login, category CRUD, and form states.
- **U03 (Admin Items & QR):** Implements dish editor, image uploader, branding settings, and QR download.
- **U04 / S01 (Public Menu):** Implements public menu page, category scroll-spy, search, RTL/LTR toggle, and SSR hydration.

---

## 2. Distinction: Prototype Preview vs. Production Angular Implementation

To avoid any architectural ambiguity:
- **`frontend/design/preview.html` is an isolated design prototype:** It is built with vanilla HTML, CSS Custom Properties (`tokens.css`), and lightweight client JavaScript solely to review typography, color contrast, responsive frames, touch targets, and keyboard accessibility in a browser before frontend implementation begins.
- **Production Implementation (Phases U02–U04):** The real SaaS application MUST be implemented using the Angular 22+ Standalone Component architecture, Signals for state management, Angular Hybrid SSR for crawler indexability, `NgOptimizedImage` for image performance, and strict TypeScript types.
- **Display-Only Invariant:** In the MVP, all customer-facing status indicators must strictly use **"Available" / "متوفر"** or **"Sold out" / "نفد"**. Never introduce "Available to order" or "متوفر للطلب" as the MVP has zero ordering, cart, or payment functionality.

---

## 3. Safe DOM Rendering & XSS Prevention Guidelines

Tenant-controlled text includes restaurant names, taglines, category titles, dish names, and descriptions. These must be rendered with strict XSS protections:

1. **Angular Template Interpolation by Default:**
   In Angular templates, ALWAYS use standard text interpolation or property binding:
   ```html
   <!-- SAFE: Angular automatically escapes tenant strings -->
   <h3 class="dish-name">{{ item.name }}</h3>
   <p class="dish-desc">{{ item.description }}</p>
   <span class="price-val">{{ item.price | egpCurrency }}</span>
   ```
2. **Strict Prohibition on `[innerHTML]`:**
   NEVER use `[innerHTML]` to bind restaurant names, dish titles, or descriptions. If rich text or markdown is ever introduced in post-MVP phases, it must pass through a strict server-side sanitizer before persistence and `DomSanitizer` in Angular.
3. **Vanilla JS / Dynamic DOM Safety (Reference from `preview.html`):**
   In any standalone scripts or dynamic DOM manipulation, always use `element.textContent = value` or `document.createTextNode(value)`. Never concatenate tenant strings into `innerHTML` or template literal strings.

---

## 4. Modal Dialog & Keyboard Accessibility Invariants

The `ProductDetailSheet` component and any future modal dialogs must enforce the following accessibility contract:

1. **Role and ARIA Semantics:**
   - Container has `role="dialog"`, `aria-modal="true"`, `aria-labelledby="dialog-title"`, and `aria-describedby="dialog-desc"`.
2. **Focus Management & Trapping:**
   - **On Open:** Store the triggering element (`lastFocusedElement = document.activeElement`). Shift focus immediately into the dialog's primary action (e.g., the close button).
   - **While Open:** Intercept `Tab` and `Shift+Tab` keys. If the user tabs past the last focusable element, wrap focus back to the first focusable element inside the dialog.
   - **Escape Key:** Intercept the `Escape` key to immediately dismiss the dialog.
   - **On Close:** Return keyboard focus back to `lastFocusedElement` so keyboard users never lose their place in the menu.
3. **Category Navigation Tabs (`CategoryChipsNav`):**
   - Container has `role="tablist"`, chips have `role="tab"`.
   - Implement **roving tabindex**: Active tab has `tabindex="0"`, inactive tabs have `tabindex="-1"`.
   - Arrow keys (`ArrowLeft`, `ArrowRight` direction-aware for RTL/LTR), `Home`, and `End` move focus between tabs and activate them.

---

## 5. Proposed Angular Application Directory Structure

```
frontend/src/app/
├── core/
│   ├── auth/                      # Session cookie auth, CSRF interceptor, auth guards
│   ├── services/                  # ApiClient, TenantService, SeoService
│   └── tokens/                    # InjectionTokens (API_BASE_URL, WINDOW_REF)
├── shared/
│   ├── components/                # Reusable design system UI components
│   │   ├── brand-header/
│   │   ├── category-chips/
│   │   ├── product-card/
│   │   ├── product-detail-sheet/
│   │   ├── search-bar/
│   │   ├── availability-badge/
│   │   ├── state-placeholder/
│   │   └── skeleton-loader/
│   ├── pipes/                     # EGP currency formatter
│   └── directives/                # FocusTrapDirective, AspectRatioDirective
└── features/
    ├── public-menu/               # SSR-first public menu experience (/r/:slug)
    │   ├── pages/
    │   │   └── menu-view/         # Main menu container
    │   └── services/
    │       └── menu-state.service.ts # Signal-based client state
    ├── owner-admin/               # CSR owner dashboard (/admin/*)
    │   ├── pages/
    │   │   ├── overview/
    │   │   ├── categories/
    │   │   ├── items/
    │   │   ├── branding/
    │   │   └── qr-studio/
    │   └── layout/                # Admin header and sidebar shell
    └── platform-admin/            # CSR platform admin (/platform/*)
        ├── pages/
        │   └── tenant-directory/
        └── components/
            └── provision-modal/
```

---

## 6. Integrating Design Tokens

1. **Import `tokens.css` into Angular's `src/styles.css`:**
   ```css
   @import '../design/tokens.css';
   ```
2. **Dynamic Tenant Theming:**
   When the public menu loads from SSR or API, the root container binds the restaurant's primary brand color to the CSS variable:
   ```html
   <div class="menu-container" [style.--tenant-primary]="restaurant.primaryColor">
     <!-- All child components instantly inherit the custom brand color -->
   </div>
   ```

---

## 7. Angular Signals & Reactive State Pattern

Components should leverage Angular Signals for instantaneous UI updates without heavy external state libraries:

```typescript
@Injectable()
export class MenuStateService {
  // Raw data from SSR TransferState or API
  private readonly categories = signal<CategoryDto[]>([]);
  private readonly items = signal<ItemDto[]>([]);

  // User filter state
  readonly activeCategoryId = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly selectedItem = signal<ItemDto | null>(null);

  // Computed filtered list for zero-latency UI rendering
  readonly visibleItems = computed(() => {
    const catId = this.activeCategoryId();
    const query = this.searchQuery().trim().toLowerCase();
    
    return this.items().filter(item => {
      const matchesCategory = catId === 'all' || item.categoryId === catId;
      const matchesQuery = !query || 
        item.name.toLowerCase().includes(query) || 
        (item.description && item.description.toLowerCase().includes(query));
      return matchesCategory && matchesQuery && item.isAvailable;
    });
  });
}
```

---

## 8. SSR Hydration & Zero CLS Guidelines

1. **`NgOptimizedImage` Usage:**
   Always supply explicit `width` and `height` properties matching the design tokens (`width="80" height="80"` for mobile thumbnails).
   ```html
   <img [ngSrc]="item.imageUrl" width="80" height="80" [alt]="item.name" loading="lazy" />
   ```
2. **Avoid Browser Globals During SSR:**
   Never call `window`, `document`, or `localStorage` directly in component initialization. Use Angular's `PLATFORM_ID` and `isPlatformBrowser(this.platformId)`.
3. **Hydration TransferState:**
   Use Angular's `TransferState` (`makeStateKey`) to serialize public menu JSON during SSR into the initial HTML document. This eliminates redundant client-side HTTP calls upon hydration.

---

## 9. API Alignment Checklist

- **Currency Handling:** Backend returns decimal price (e.g. `185.00`); frontend formats strictly as EGP using `Intl.NumberFormat`. Never perform floating-point operations in UI templates.
- **ProblemDetails:** Ensure all HTTP error responses match RFC 7807 `ProblemDetails` so standard toast notifications extract clean user-facing error strings without leaking internal server stack traces.
- **Tenant Scope:** Admin endpoints must never accept `tenantId` or `restaurantId` from query or body; backend extracts tenant identity exclusively from the authenticated session cookie.
