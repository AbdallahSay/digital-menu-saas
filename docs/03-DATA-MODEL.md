# Data Model v1 (SQL Server / EF Core)

## Core entities
`Restaurant`: Id uniqueidentifier PK; Name nvarchar(150), Slug nvarchar(100) unique, PublicCode nvarchar(20) unique immutable/random, Status enum Active/Suspended, IsPublished bit, CreatedAtUtc/UpdatedAtUtc datetime2, rowversion. Slug isn't used as permanent QR target.

`ApplicationUser`: ASP.NET Core Identity entity; Email/normalization/password managed by Identity; Never store plaintext credentials.

`RestaurantUser`: RestaurantId, UserId composite PK and FK to Restaurant + User; Role (Owner initially), IsActive; join table enables extension without leaking cross-tenant identities.

`Category`: Id uniqueidentifier, RestaurantId FK, NameAr nvarchar(120) required, NameEn nvarchar(120) optional, SortOrder int, IsPublished bit, IsDeleted bit, CreatedAtUtc/UpdatedAtUtc, rowversion. Alternate unique `(RestaurantId, Id)` for composite FK.

`MenuItem`: Id uniqueidentifier, RestaurantId, CategoryId, NameAr nvarchar(150) required, NameEn nvarchar(150) optional, DescriptionAr/En bounded nvarchar, Price decimal(18,2), CurrencyCode char(3) default EGP or restaurant fixed currency, SortOrder int, IsPublished, IsAvailable, IsDeleted, CreatedAtUtc/UpdatedAtUtc, rowversion. Composite FK `(RestaurantId, CategoryId)` -> Category `(RestaurantId, Id)` enforces category tenant equality; `CHECK Price >= 0`.

`MenuItemImage`: Id uniqueidentifier, RestaurantId, MenuItemId, ObjectKey opaque unique, AltAr/AltEn, SortOrder int, Width int, Height int, ContentType approved, CreatedAtUtc; composite `(RestaurantId, MenuItemId)` FK to MenuItem and `(RestaurantId, Id)` alt unique on MenuItem.

`RestaurantSettings`: RestaurantId PK/FK, PrimaryColor constrained hex token, LogoObjectKey, CoverObjectKey, ContactPhoneOptional, AddressOptional, PublishedContactDetailsFlags, default locale, optional description. Never expose internal owner credential info.

`AuditEntry`: Id, ActorUserId nullable, RestaurantId nullable, Action, ResourceType, ResourceId, TimestampUtc, CorrelationId, minimal redacted metadata; no passwords, raw tokens or user-supplied secrets.

## Essential indexes
- Unique `Restaurant(PublicCode)`, `Restaurant(Slug)`.
- Unique membership `(RestaurantId, UserId)` and search `(UserId, IsActive)`.
- Categories: `(RestaurantId, IsDeleted, IsPublished, SortOrder)`.
- Items: `(RestaurantId, CategoryId, IsDeleted, IsPublished, IsAvailable, SortOrder)`.
- Images: `(RestaurantId, MenuItemId, SortOrder)`.
- Audits: `(RestaurantId, TimestampUtc)` and suitable retention strategy.
Confirm real query plans with representative data; don't add blind indexes to every column.

## Invariants
- RowVersion/ETag for conflicting writes, return 409/412 as selected in API contract.
- All tenant-owned tables carry immutable RestaurantId; changes across tenants impossible except explicit admin migration procedure (out of scope).
- Use UTC in storage, explicitly render restaurant local time only if shown.
- Deleting Category with active items: return 409 and guide owner to move/delete items first; no accidental destructive cascade.
- Soft delete items/categories by setting IsDeleted; public endpoints exclude them.
- `PublicCode` generated with cryptographically secure RNG, collision-checked, not used as secret or proof of authentication.
- Add seed data with **two restaurants** and conflicting/equivalent category/item IDs in tests to prove isolation; use test fixtures without fixed credentials in prod.

## Data integrity examples
- Insert MenuItem with foreign CategoryId from another restaurant => rejected by app + composite FK.
- Owner from restaurant A request to update item belonging to B => 404 or other non-disclosing denial, no row changed.
- Public menu of suspended restaurant => unavailable, regardless of item flags.

## SEO/publicity persistence (day-one indexes and fields)
- `Restaurants.Slug`: unique, normalized, immutable public code separate; distinguish route-slug edits from QR code changes.
- `RestaurantSlugRedirects` (if rename enabled in MVP): `OldSlug UNIQUE`, `RestaurantId`, `CreatedAtUtc`; old slug resolves 301 directly to **current** canonical route, no chain.
- `Restaurants.PublishedMenuVersion` (or equivalent monotonic publication timestamp/change token): increment on public menu/category/branding edits; drives SSR cache keys and sitemap `lastmod` only for real public changes.
- Optional explicitly public SEO fields (safe restaurant summary, cuisines/address/phone/hours with owner-controlled publication); never expose unpublished/private contact data.
- Add a unique index for normalized public slug and one for immutable public code; test collision/renaming/redirect race behavior.
