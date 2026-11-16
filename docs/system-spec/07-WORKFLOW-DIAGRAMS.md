# 07 — User journey, sequence and state diagrams

Mermaid diagrams describe required behavior and verification scenarios; they are editable source and rendered by GitHub. Cross-reference [stories](04-USER-STORIES.md), [business rules](05-BUSINESS-RULES.md), and [existing API contract](../04-API-CONTRACT.md).

## D-FLOW-01 — Customer QR to visible menu (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Guest as Anonymous customer
  participant Edge as HTTPS /m resolver
  participant DB as SQL restaurant registry
  participant SSR as Angular SSR /r/:slug
  participant API as Public projection API
  Guest->>Edge: GET /m/{PublicCode}
  Edge->>DB: Resolve code, status and current slug
  alt Active and published
    DB-->>Edge: Canonical slug
    Edge-->>Guest: 302 Location /r/{slug}
    Guest->>SSR: GET /r/{slug}
    SSR->>API: Fetch safe public projection (locale)
    API->>DB: Filter publication, availability, deletion
    DB-->>API: Public-only data
    API-->>SSR: Restaurant + categories + visible items
    SSR-->>Guest: 200 meaningful HTML, title, canonical, one H1
  else Missing or hidden
    Edge-->>Guest: 404 / approved unavailable policy; no private data
  end
~~~

QA: AC-04/05/07/15/16/20. The code is an immutable public locator, not an auth token.

## D-FLOW-02 — Sign-in and CSRF (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Owner
  participant Web as Angular owner app
  participant API as Identity + antiforgery API
  participant SQL as Identity / membership SQL
  Owner->>Web: Open login
  Web->>API: GET /api/v1/auth/csrf
  API-->>Web: XSRF-TOKEN + CSRF cookie
  Owner->>Web: Enter login form
  Web->>API: POST /api/v1/auth/login + X-XSRF-TOKEN
  API->>SQL: Validate user, lockout, allowed membership
  alt Authenticated and eligible
    API-->>Web: 204 + Secure HttpOnly session cookie
    Web->>API: GET fresh CSRF and /auth/me
    API-->>Web: Safe active role/display details
  else Invalid, locked, disabled or missing CSRF
    API-->>Web: Generic failure / 400 / 401 / 429
  end
~~~

No localStorage session secret, and membership is checked on every protected resource request.

## D-FLOW-03 — Platform provisioning transaction (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Admin as PlatformAdmin
  participant UI as Platform CSR
  participant API as Provisioning service
  participant SQL as SQL Server
  participant Mail as Approved invitation delivery
  Admin->>UI: New restaurant + owner email
  UI->>API: POST /api/v1/platform/restaurants (CSRF)
  API->>SQL: Begin serializable transaction
  API->>SQL: Check normalized slug and existing owner email
  alt Unique and valid
    API->>SQL: Insert restaurant, owner, membership, settings, audit
    SQL-->>API: Transaction committed
    API->>Mail: Send secure setup only if delivery configured
    API-->>UI: 201 restaurant DTO (no credential)
  else Duplicate or SQL conflict
    API->>SQL: Roll back
    API-->>UI: 409 safe conflict
  end
~~~

Invitation delivery strategy is constrained by existing F04 contract: do not report a sent email if no delivery mechanism is configured.

## D-FLOW-04 — Owner edit with tenant guard and concurrency (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Owner
  participant UI as Angular owner UI
  participant API as Tenant-scoped catalog API
  participant SQL as EF Core + SQL Server
  Owner->>UI: Update dish price
  UI->>API: PUT item with CSRF + RowVersion
  API->>SQL: Resolve active membership and own item/category
  alt Foreign item/category
    API-->>UI: Non-disclosing 404; unchanged
  else Wrong RowVersion
    API-->>UI: 412 conflict; unchanged
  else Valid update
    API->>SQL: Commit item + public version change
    SQL-->>API: New RowVersion
    API-->>UI: Updated own item
    UI-->>Owner: Confirm saved only after response
  end
~~~

## D-FLOW-05 — Safe image upload (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Owner
  participant UI as Item editor
  participant API as Upload endpoint
  participant Guard as Tenant / media validator
  participant SQL as SQL Server
  participant Store as Tenant media storage
  Owner->>UI: Select image file
  UI->>API: Multipart upload with cookie + CSRF
  API->>Guard: Verify owner/item + byte signature + limits
  alt Invalid file, size or tenant
    Guard-->>UI: Safe 4xx; no usable foreign object
  else Approved image
    Guard->>Guard: Decode, normalize, strip EXIF, resize
    Guard->>Store: Write opaque tenant-scoped object
    Guard->>SQL: Persist tenant/item image association
    SQL-->>API: Persisted image metadata
    API-->>UI: Success + safe media URL
  end
~~~

Storage consistency and cleanup after partial failure require explicit transactional compensations; SQL and object storage are not one atomic database transaction.

## D-FLOW-06 — Public content publish and invalidation (sequence)

~~~mermaid
sequenceDiagram
  autonumber
  actor Admin as Authorized publisher
  participant API as Publication API
  participant DB as Restaurant + audit SQL
  participant Cache as Tenant + locale + version cache
  participant SSR as Public SSR
  actor Visitor
  Admin->>API: Publish/unpublish with valid RowVersion
  API->>DB: Check role, update publication, version and audit
  DB-->>API: Committed version
  API-->>Admin: Success; new RowVersion
  API->>Cache: Invalidate or move to new versioned key
  Visitor->>SSR: GET canonical public URL
  SSR->>Cache: Lookup scoped public version
  Cache-->>SSR: Only fresh public projection or miss
  SSR-->>Visitor: Correct public status and source HTML
~~~

Existing platform admin owns restaurant-level publication; owner-side restaurant publication authority is a pending decision. Never invalidate data across tenants.

## D-FLOW-07 — Restaurant lifecycle state machine

~~~mermaid
stateDiagram-v2
  [*] --> ActiveUnpublished: provision
  ActiveUnpublished --> ActivePublished: platform publish
  ActivePublished --> ActiveUnpublished: platform unpublish
  ActivePublished --> SuspendedPublished: suspend
  ActiveUnpublished --> SuspendedUnpublished: suspend
  SuspendedPublished --> ActivePublished: reactivate
  SuspendedUnpublished --> ActiveUnpublished: reactivate
  SuspendedPublished --> SuspendedUnpublished: privileged unpublish
  SuspendedUnpublished --> SuspendedPublished: privileged publish flag
~~~

Public availability is YES only in ActivePublished; suspended status preserves publication flag. Publication of a suspended tenant does **not** expose the menu.

## D-FLOW-08 — Item/category visibility logic

~~~mermaid
flowchart TD
  Start["Anonymous request for a menu item"] --> R{"Restaurant active AND published?"}
  R -- No --> Hidden["Exclude from public response"]
  R -- Yes --> C{"Category published and not deleted?"}
  C -- No --> Hidden
  C -- Yes --> I{"Item published, available and not deleted?"}
  I -- No --> Hidden
  I -- Yes --> Public["Include safe localized item DTO"]
  Public --> Locale{"English translation exists?"}
  Locale -- Yes --> EN["Use approved English copy for EN request"]
  Locale -- No --> AR["Use Arabic fallback"]
~~~

No hidden content should be sent to the client merely for browser-side filtering.

## D-FLOW-09 — Category deletion conflict

~~~mermaid
flowchart TD
  Start["Owner chooses Delete category"] --> Confirm["Confirmation dialog"]
  Confirm --> Guard{"Correct tenant and RowVersion?"}
  Guard -- No --> Deny["404 / 412; no delete"]
  Guard -- Yes --> Linked{"Any active items still linked?"}
  Linked -- Yes --> Conflict["409: move or remove dishes first"]
  Linked -- No --> Soft["Soft-delete category"]
  Soft --> Version["Invalidate approved public version"]
  Version --> Done["Show success after API response"]
~~~

## D-FLOW-10 — Mobile menu and demo information architecture

~~~mermaid
flowchart LR
  Landing["Marketing landing"] --> DemoName["Demo 1: Restaurant details"]
  DemoName --> DemoDishes["Demo 2: Add sample dishes"]
  DemoDishes --> Themes["Demo 3: Choose identity"]
  Themes --> Rest["Restaurant theme"]
  Themes --> Cafe["Café theme"]
  Rest --> RestPreview["Demo 4: Restaurant preview"]
  Cafe --> CafePreview["Demo 4: Café preview"]
  RestPreview --> Done["Demo complete: unpublished"]
  CafePreview --> Done
  Landing --> Public["Sample public menu"]
  Public --> Search["Search and categories"]
  Search --> Item["Dish details"]
~~~

The demo is illustrative, not an onboarding/signup endpoint. Public customer menu contains no order/cart/pay route.

## D-FLOW-11 — Owner editing journey

~~~mermaid
flowchart TD
  Login["Owner sign-in"] --> Dashboard["Own dashboard"]
  Dashboard --> Categories["Categories CRUD"]
  Dashboard --> Items["Menu items list"]
  Items --> Editor["Create / edit dish"]
  Editor --> Photos["Media manager"]
  Photos --> Editor
  Editor --> Save{"Backend result"}
  Save -- "200/201" --> Saved["Accurate saved state"]
  Save -- "400/409/412" --> Fix["Validation or conflict recovery"]
  Fix --> Editor
  Dashboard --> Brand["Restaurant identity and public settings"]
  Dashboard --> QR["Stable QR asset"]
  Dashboard --> Preview["Private draft preview"]
  Preview --> Publish{"Restaurant publication authority?"}
  Publish -- "PlatformAdmin (current contract)" --> Platform["Privileged publication workflow"]
  Publish -- "Owner (not approved)" --> Decision["D-02 decision required"]
~~~

## D-FLOW-12 — SEO/public error decision

~~~mermaid
flowchart TD
  Req["Request canonical /r/{slug}"] --> Syntax{"Slug syntax and reserved-route policy?"}
  Syntax -- Invalid --> Bad["400/404 per contract; noindex"]
  Syntax -- Valid --> Registry{"Current live published restaurant?"}
  Registry -- Yes --> SSR["200 indexable HTML, canonical, safe schema"]
  Registry -- No --> Old{"Approved historical alias?"}
  Old -- Yes --> Redirect["301 directly to current canonical"]
  Old -- No --> Unavailable["404/410/noindex per approved policy"]
  SSR --> Sitemap["Eligible for published-only sitemap"]
~~~

Slug-alias and reserved demo implementation remain subject to D-06 and existing S02 risk review.

## D-FLOW-13 — Multi-tenant leakage threat case

~~~mermaid
sequenceDiagram
  autonumber
  actor A as Owner of Tenant A
  participant API as Owner API
  participant Auth as TenantAuthorization
  participant SQL as SQL with composite tenant FKs
  A->>API: Request B item/image/category ID
  API->>Auth: Resolve A from cookie membership
  Auth->>SQL: Query resource constrained to A
  SQL-->>Auth: No matching A resource
  Auth-->>API: Deny, no B resource metadata
  API-->>A: 404 or non-disclosing policy result
~~~

## D-FLOW-14 — Failure/retry and honest UX

~~~mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Submitting: user submits valid form
  Submitting --> Saved: API commit success
  Submitting --> ValidationError: 400
  Submitting --> Conflict: 409 / 412
  Submitting --> NetworkFailure: offline / 5xx
  ValidationError --> Idle: correct inputs
  Conflict --> Idle: reload + reconcile
  NetworkFailure --> Idle: retry safe operation
  Saved --> [*]
~~~

Never display the Saved state on click alone; only after an actual committed API result. A retry must not assume request idempotency for creation endpoints.

