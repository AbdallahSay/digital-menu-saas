# 06 — Architecture, data and trust diagrams

**Notation:** Mermaid source lives in this file and renders in GitHub. Diagrams describe accepted design and current model at a high level, **not** proof every shown implementation is complete. Pending infrastructure or schema decisions are explicitly labelled. Source: [Architecture](../02-ARCHITECTURE.md), [Data](../03-DATA-MODEL.md), [Security](../06-SECURITY.md) and [ADRs](../11-ADR-AND-RISKS.md).

## D-ARCH-01 — System context (C4 level 1 equivalent)

~~~mermaid
flowchart LR
  Guest["Anonymous customer"] -->|"Scan QR, browse, search, AR/EN"| Platform["MenuSaaS"]
  Owner["Restaurant owner"] -->|"Manage own menu, brand and QR"| Platform
  Admin["Platform administrator"] -->|"Provision tenants, suspend and audit"| Platform
  Demo["Demo visitor"] -->|"Illustrative unpublished preview"| Platform
  Platform -->|"Public HTML / API"| Guest
  Platform -->|"Protected dashboard"| Owner
  Platform -->|"Privileged portal"| Admin
~~~

**Review:** FR-001–014, FR-020–036, FR-050–072. Demo does not provision real accounts.

## D-ARCH-02 — Container diagram (C4 level 2 equivalent)

~~~mermaid
flowchart TB
  B["Browser: Guest / Owner / Platform admin"]
  QR["Printed QR /m/{PublicCode}"]
  subgraph Origin["One HTTPS public origin (production topology pending D-04)"]
    Proxy["Trusted reverse proxy / path router"]
    SSR["Angular 22 Node SSR + hydration\n/r/:slug; prerender marketing"]
    CSR["Angular owner & platform CSR"]
    API["ASP.NET Core 10 REST API\nIdentity + Domain modules"]
    QRResolver["Stable QR 302 resolver"]
  end
  SQL[("SQL Server\nShared database, tenant constraints")]
  Images[("Durable object media store\nprovider pending approval")]
  QR --> Proxy
  B --> Proxy
  Proxy --> SSR
  Proxy --> CSR
  Proxy --> API
  Proxy --> QRResolver
  QRResolver -->|"Read safe slug + status"| API
  SSR -->|"Anonymous public DTO only"| API
  CSR -->|"Same-origin secure cookie + CSRF"| API
  API --> SQL
  API --> Images
~~~

**Important:** API and SSR may be separate processes but share one external origin. Deployment host, trust headers and media storage are not approved for production.

## D-ARCH-03 — Backend logical component boundaries (C4 level 3 equivalent)

~~~mermaid
flowchart LR
  Http["HTTPS endpoints / route groups"]
  Auth["Identity, CSRF, role policies"]
  Tenant["TenantContext and resource guards"]
  Platform["Platform: provision / lifecycle"]
  Catalog["Catalog: categories / items"]
  Media["Media: inspect / normalize / store"]
  Read["Public projection + locale fallback"]
  Audit["Audit, health, logs"]
  EF["EF Core 10 / SQL persistence"]
  Store["Durable media provider"]
  Http --> Auth
  Http --> Tenant
  Http --> Platform
  Http --> Catalog
  Http --> Media
  Http --> Read
  Platform --> Audit
  Catalog --> Tenant
  Media --> Tenant
  Platform --> EF
  Catalog --> EF
  Media --> EF
  Read --> EF
  Media --> Store
  Auth --> EF
~~~

No mandatory event bus, microservices or Redis; optimize the modular monolith first.

## D-ARCH-04 — Core ERD (existing entity families)

~~~mermaid
erDiagram
  RESTAURANT ||--o{ RESTAURANT_USER : has
  APPLICATION_USER ||--o{ RESTAURANT_USER : memberships
  RESTAURANT ||--|| RESTAURANT_SETTINGS : has
  RESTAURANT ||--o{ CATEGORY : owns
  RESTAURANT ||--o{ MENU_ITEM : owns
  CATEGORY ||--o{ MENU_ITEM : contains
  RESTAURANT ||--o{ MENU_ITEM_IMAGE : owns
  MENU_ITEM ||--o{ MENU_ITEM_IMAGE : images
  RESTAURANT o|--o{ AUDIT_ENTRY : relates_to
  APPLICATION_USER o|--o{ AUDIT_ENTRY : causes
  RESTAURANT {
    uuid Id PK
    string Name
    string Slug UK
    string PublicCode UK
    string Status
    boolean IsPublished
    bigint PublishedMenuVersion
    binary RowVersion
  }
  APPLICATION_USER {
    uuid Id PK
    string Email
    string NormalizedEmail
  }
  RESTAURANT_USER {
    uuid RestaurantId PK,FK
    uuid UserId PK,FK
    string Role
    boolean IsActive
  }
  RESTAURANT_SETTINGS {
    uuid RestaurantId PK,FK
    string PrimaryColor
    string LogoObjectKey
    string CoverObjectKey
    string DefaultLocale
  }
  CATEGORY {
    uuid Id PK
    uuid RestaurantId FK
    string NameAr
    string NameEn
    int SortOrder
    boolean IsPublished
    boolean IsDeleted
    binary RowVersion
  }
  MENU_ITEM {
    uuid Id PK
    uuid RestaurantId FK
    uuid CategoryId FK
    string NameAr
    string NameEn
    decimal Price
    string CurrencyCode
    boolean IsAvailable
    boolean IsPublished
    boolean IsDeleted
    binary RowVersion
  }
  MENU_ITEM_IMAGE {
    uuid Id PK
    uuid RestaurantId FK
    uuid MenuItemId FK
    string ObjectKey
    string AltAr
    string AltEn
    int SortOrder
  }
  AUDIT_ENTRY {
    uuid Id PK
    uuid ActorUserId FK
    uuid RestaurantId FK
    string Action
    datetime TimestampUtc
    string CorrelationId
  }
~~~

**Relational invariant:** composite RestaurantId+CategoryId and RestaurantId+MenuItemId FKs are required. This diagram shows current entity families, not all Identity tables. A durable ThemeId or RestaurantSlugRedirects entity is a **proposed future change** pending D-01/D-06, not part of the existing ERD.

## D-ARCH-05 — Data flow and PII boundaries (DFD)

~~~mermaid
flowchart LR
  Guest["Anonymous browser"] -->|"GET /r, QR or public API"| Public["Public SSR and safe projection"]
  Owner["Owner browser\nsecure cookie"] -->|"CSRF-protected mutations"| Admin["Owner REST handlers"]
  PlatformUI["Platform browser\nprivileged cookie"] -->|"Scoped platform actions"| Gov["Platform REST handlers"]
  Admin --> Tenant["Server-resolved TenantContext"]
  Tenant --> SQL[("Tenant-filtered SQL")]
  Gov --> SQL
  Gov --> Audit[("Redacted audit records")]
  Admin --> Store[("Tenant-scoped media keys")]
  SQL -->|"Only active, published safe columns"| Public
  Store -->|"Approved optimized media"| Public
  Public -->|"Only public fields"| Guest
~~~

Never pass cookies or private owner DTOs into shared SSR transfer cache. Audit trails do not contain owner passwords or invitation secrets.

## D-ARCH-06 — Trust-boundary / enforcement flow

~~~mermaid
flowchart TD
  R["Protected owner mutation"] --> Auth{"Authenticated session?"}
  Auth -- No --> Deny["401 / no mutation"]
  Auth -- Yes --> Csrf{"Valid CSRF?"}
  Csrf -- No --> Reject["400/403; no mutation"]
  Csrf -- Yes --> Member{"Active owner membership?"}
  Member -- No --> Forbidden["403/404; no disclosure"]
  Member -- Yes --> Scope["Derive restaurant on SERVER"]
  Scope --> Relation{"All resource IDs / associations in same tenant?"}
  Relation -- No --> NotFound["Non-disclosing 404; no mutation"]
  Relation -- Yes --> Version{"Valid data and RowVersion?"}
  Version -- No --> Conflict["400 / 409 / 412"]
  Version -- Yes --> Save["Transaction, audit as needed, commit"]
~~~

Auth is necessary but not sufficient: foreign category/item/media IDs must be denied inside service/SQL layers.

## D-ARCH-07 — Deployment topology proposal, not an approved production design

~~~mermaid
flowchart LR
  Device["Mobile / desktop browser"] --> DNS["Domain + HTTPS termination"]
  DNS --> Proxy["Hardened reverse proxy"]
  Proxy -->|"Public SSR"| Node["Angular Node SSR"]
  Proxy -->|"API, auth, stable QR"| DotNet[".NET API"]
  Proxy -->|"Admin CSR assets"| Static["Angular static bundles"]
  Node -->|"Authenticated service boundary, if required"| DotNet
  DotNet --> SQL[("SQL Server\nbackups + test restores")]
  DotNet --> Media[("Durable media\nprovider TBD")]
  Proxy --> Telemetry["Structured monitoring\nwithout sensitive payloads"]
  Node --> Telemetry
  DotNet --> Telemetry
~~~

**Open approvals:** SSR host/region/cost, exact trusted proxy and internal-service authentication, durable storage, backup RPO/RTO and restore. See [decisions](10-DECISIONS-AND-RISKS.md); do not turn this proposed topology into a deployed system without P0/R01 approval.

## D-ARCH-08 — Angular rendering and route separation

~~~mermaid
flowchart TB
  Route["Incoming URL"] --> Match{"Route family?"}
  Match -->|"Marketing /"| SSG["Prerendered HTML + hydrated enhancements"]
  Match -->|"/r/:slug"| SSR["Server HTML with actual visible menu\nthen hydration"]
  Match -->|"/m/:publicCode"| QR["302 to canonical /r/:slug"]
  Match -->|"/admin/*"| Owner["CSR, auth + noindex + no-store"]
  Match -->|"/platform/*"| Admin["CSR, privileged auth + noindex + no-store"]
  Match -->|"Unknown / unavailable"| Error["Correct 404/410/noindex result"]
~~~

**Source truth:** frontend currently wires a subset of these routes; this is the target route map, not a claim all pages are implemented.

