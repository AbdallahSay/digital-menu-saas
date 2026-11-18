# P01 — Restaurant settings, branding and theme API

> ملخص: صاحب المطعم يقدر يعدّل بيانات مطعمه (اسم إنجليزي، وصف، تليفون، عنوان)، يختار الثيم واللون، ويرفع اللوجو والغلاف.

Depends on: P00 · Decisions: D6 · Size: medium

## Context
- `RestaurantSettings` table exists (PrimaryColor, LogoObjectKey, CoverObjectKey, ContactPhoneOptional,
  AddressOptional, PublishedContactDetailsFlags, DefaultLocale, Description) but has no API.
- F08 image pipeline (`backend/src/DigitalMenu.Api/Media/`) validates, normalizes and stores images.

## Scope
1. Additive migration: `RestaurantSettings.NameEn nvarchar(150) null`, `DescriptionEn nvarchar(500) null`,
   `ThemeKey varchar(16) not null default 'grill'` with CHECK (`grill`,`cafe`); constrain PrimaryColor to
   the Figma brand palette or a validated `#RRGGBB` (follow D6).
2. Owner endpoints (TenantOwner policy, CSRF, rowVersion, ProblemDetails):
   - `GET /api/v1/admin/restaurant` -> name, nameEn, slug (read-only), publicCode (read-only), status,
     isPublished, description(Ar/En), contactPhone, address, contact visibility flags, defaultLocale,
     primaryColor, themeKey, logo/cover image metadata, rowVersion.
   - `PATCH /api/v1/admin/restaurant` -> the editable fields above. Owner cannot change slug, status
     or publication here.
   - `PUT /api/v1/admin/restaurant/logo` and `/cover` (multipart, reuse F08 normalization; logo square
     crop limits, cover 16:9 guidance), `DELETE` for each. Old blobs deleted after commit as F08 does.
3. Every public-visible change increments `PublishedMenuVersion`; audit `RestaurantSettingsUpdated`,
   `RestaurantLogoChanged`, `RestaurantCoverChanged` (no PII in audit metadata).
4. Validation: Arabic name 1..150 required, phone E.164-ish Egyptian formats, lengths, no control chars.

## Acceptance criteria
- Owner A reads/updates only A's settings; B's requests can never affect A (A/B tests).
- Stale rowVersion -> 412 (same convention as F04/F06), invalid input -> 400, anonymous -> 401, platform admin -> 403.
- Logo/cover uploads reject non-images, oversize, and decompression bombs exactly like F08.
- Contact phone/address are stored but flagged private unless the owner enables visibility.

## Tests
Integration tests in `backend/tests/DigitalMenu.IntegrationTests/RestaurantSettingsTests.cs` (SQL), plus EF consistency.

## Docs to update
`docs/03-DATA-MODEL.md`, `docs/04-API-CONTRACT.md` (new "Restaurant settings" section).

## Out of scope
Public exposure of these fields (P02), UI (P08).
