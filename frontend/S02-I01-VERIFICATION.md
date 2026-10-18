# S02-I01 — Real Restaurant SEO Metadata & Structured Data

## Preflight and Authorization

- Starting main commit: `8eb7c0ac0b49f48cb7896082c6fc9bd2bdf17ec0`
- Branch: `feat/S02-I01-restaurant-seo`
- Task: S02-I01 — Real Restaurant SEO Metadata & Structured Data
- Scope limited strictly to S02-I01; the 4 architecture ADRs remain PROPOSED.

## Implementation Details

### 1. Dynamic SEO Metadata (`frontend/src/app/public-menu-seo.ts`)
- **Title**: Server-rendered title format:
  - Arabic: `{RestaurantName} | المنيو`
  - English: `{RestaurantName} | Menu`
  - Non-200 responses fallback to error title (`الصفحة غير موجودة` / `الخدمة غير متوفرة مؤقتاً`).
- **Description**: Truthful meta description built entirely from existing public restaurant data:
  - If categories exist: Lists up to three public category names (e.g. `منيو {RestaurantName}. تصفح أشهى الأطباق والمشروبات: {Cat1}، {Cat2}، {Cat3}.`)
  - If menu is empty: Truthful empty description (e.g. `منيو {RestaurantName}. تصفح قائمة الطعام والأسعار المحدثة مباشرة عبر رمز QR. المنيو فارغ حالياً.`)
  - English translations when `lang=en`.
  - Non-200 responses fallback to error title without revealing tenant details.
- **Canonical URL**:
  - Format: `{trustedPublicOrigin}/r/{slug}`
  - Origin derived strictly from configured trusted origin (`PUBLIC_ORIGIN`), never from incoming `Host` or `X-Forwarded-*` headers.
  - Strips query parameters (`lang=ar|en`) preserving the approved Arabic canonical policy.
  - Only present on HTTP 200 responses; non-200 responses omit canonical.

### 2. Schema.org Restaurant Structured Data (JSON-LD)
- Valid Schema.org `Restaurant` object:
  - `@context`: `https://schema.org`
  - `@type`: `Restaurant`
  - `name`: Grounded in public restaurant name.
  - `url`: Canonical restaurant URL.
  - `menu`: Canonical restaurant menu URL.
- Truthful data only:
  - No fabricated addresses, telephone numbers, ratings, reviews, opening hours, or images.
  - No internal tenant IDs (`RestaurantId`, `UserId`, `CategoryId`) or object storage keys exposed.
- Safe Serialization (`serializeJsonLd`):
  - Serializes JSON safely preventing `</script>` breakouts and HTML/JS injection.
  - Escapes `<`, `>`, `&`, as well as Unicode line separators `\u2028` and paragraph separators `\u2029`.
  - Replaces unsafe characters with standard JSON Unicode escape sequences (`\u003c`, `\u003e`, `\u0026`, `\u2028`, `\u2029`).
- Error handling:
  - Completely absent on non-200 responses (400/404/503).
  - Paired with `noindex,nofollow` robots tag on non-200 responses.

## Verification Evidence

### 1. Unit Tests (`frontend/src/app/public-menu-seo.spec.ts`)
10 tests covering:
- Canonical URL generation from trusted origin.
- Canonical URL query parameter stripping.
- Arabic and English restaurant titles.
- Fallback titles on missing menu.
- Meta description with category list.
- Meta description for empty menus.
- Meta description for English menus.
- Minimal truthful Schema.org `Restaurant` JSON-LD generation.
- Safe serialization escaping `<script>`, `</script>`, and HTML tags.
- Serialization escaping Unicode separators `\u2028` and `\u2029`.

Result: `18/18` frontend unit tests passed.

### 2. Integration Tests (`DigitalMenu.IntegrationTests`)
- Two real SQL-backed restaurants (`s01-a` and `s01-b`) verified with different metadata and JSON-LD.
- Raw server-rendered HTML inspection confirms title, meta description, single canonical, and single JSON-LD script exist in initial HTML without JavaScript.
- JSON-LD parsed and verified for schema conformity (`@context`, `@type`, `name`, `url`, `menu`) and absence of fabricated properties (`telephone`, `address`, `aggregateRating`, `openingHoursSpecification`, `image`).
- Malicious script breakout attempts (`<script>globalThis.s01Canary=true</script>`) neutralized and verified safe.
- Header spoofing (`Host: evil.example`, `X-Forwarded-Host: evil.example`) ignored; canonical and JSON-LD URLs remain pinned to configured `PUBLIC_ORIGIN`.
- Non-200 responses (400/404/503) verified to have 0 JSON-LD scripts, 0 canonical tags, and `noindex` robots directives.
- Parallel A/B SSR renders verified to maintain tenant isolation without mixing metadata.
- Hydration verified with Playwright Chromium in headless mode: DOM canonical, title, and JSON-LD match SSR without duplicate API calls.

Result: `91/91` real SQL integration tests passed (0 failed, 0 skipped).

### 3. Performance & Mobile Lighthouse Gate
Executed 3 runs on genuine SQL-backed restaurant `/r/s01-b`:
- **Performance**: 97, 98, 98 (Median: **98** >= 90 gate)
- **Accessibility**: 100
- **Best Practices**: 100
- **SEO**: 100
- **LCP**: ~2.1s
- **CLS**: 0.00048
- Initial JS transfer size: **80.87 kB** (Budget: 180 KiB)

### 4. Quality Gates Executed
- `npm run lint`: Prettier check passed (100% compliant).
- `npm test`: 18/18 unit tests passed.
- `npm run build`: Production build succeeded.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore`: passed with 0 changes.
- `dotnet ef migrations has-pending-model-changes`: passed (0 pending model changes).
- `dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive`: 0 vulnerable packages.
- `git diff --check`: 0 whitespace errors.
