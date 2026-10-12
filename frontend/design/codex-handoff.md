# Frontend Architecture Handoff Guide for Codex

**Document Version:** 1.0.0  
**Target Milestone:** U01 — Mobile-first UI/UX Design System  
**Audience:** Codex (Backend & SSR Architect) & Future Frontend Implementers (U02, U03, U04)

---

## 1. Architectural Boundaries & Division of Labor

- **U01 (Antigravity):** Design tokens, wireframes, component specs, UX architecture, and standalone design previews. No production code changes to Angular config or backend.
- **F01 – F09 (Codex):** .NET 10 API, SQL persistence, Identity auth, tenant isolation guards, media upload pipeline, and SSR public projection API.
- **U02 (Admin Categories & Auth):** Implements Owner login, category CRUD, and state transitions.
- **U03 (Admin Items & QR):** Implements dish editor, image uploader, branding settings, and QR download.
- **U04 / S01 (Public Menu):** Implements public menu page, category scroll-spy, search, RTL/LTR toggle, and SSR hydration.

---

## 2. Proposed Angular Application Directory Structure

To maintain a clean modular monolith frontend, the following structure is specified for implementation in U02–U04:

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
│   ├── pipes/                     # EGP currency formatter, safe HTML
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

## 3. Integrating Design Tokens

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

## 4. Angular Signals & Reactive State Pattern

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

## 5. SSR Hydration & Zero CLS Guidelines

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

## 6. API Alignment Checklist

- **Currency Handling:** Backend returns decimal price (e.g. `185.00`); frontend formats strictly as EGP using `Intl.NumberFormat`. Never perform floating-point operations in UI templates.
- **ProblemDetails:** Ensure all HTTP error responses match RFC 7807 `ProblemDetails` so standard toast notifications extract clean user-facing error strings without leaking internal server stack traces.
- **Tenant Scope:** Admin endpoints must never accept `tenantId` or `restaurantId` from query or body; backend extracts tenant identity exclusively from the authenticated session cookie.
