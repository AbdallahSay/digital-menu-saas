# 05 — Business rules, state contracts and validation edge cases

## Invariants (cross-layer, always enforce server-side)

| ID | Rule | Technical enforcement |
|---|---|---|
| BR-01 | Owner resource scope comes from authenticated active restaurant membership, not request-supplied RestaurantId | Policy, scoped queries, foreign ID HTTP tests |
| BR-02 | Every category, item and image belongs to exactly one tenant; foreign category association forbidden | Composite tenant FKs and application authorization |
| BR-03 | Public restaurant must be Active AND IsPublished | Public projection/SSR gate |
| BR-04 | Public category must be published and not soft-deleted | Projection predicate |
| BR-05 | Public item must be published, available, not soft-deleted and in publicly visible category | Projection predicate |
| BR-06 | PublicCode never changes on slug/name/branding edits and is not a credential | Unique SQL constraint and QR tests |
| BR-07 | Arabic name is mandatory; English text optional with Arabic fallback | Validation & localization |
| BR-08 | Price uses decimal(18,2), nonnegative; EGP for MVP; zero is not misrepresented | DB check + client format |
| BR-09 | Category with active items cannot be deleted until items moved/deleted | 409 and no cascade |
| BR-10 | RowVersion protects concurrent edits; do not silently overwrite | 412/ETag contract |
| BR-11 | Existing normalized owner email cannot be assigned to another restaurant | Provisioning 409, even inactive |
| BR-12 | Suspended tenant's existing publication choice is retained, never exposed until Active | State changes + SSR tests |
| BR-13 | Only owner-approved public business fields appear in anonymous payload | Explicit projection, security regression |
| BR-14 | All unsafe cookie-auth requests require CSRF; all admin responses no-store | ASP.NET policy/middleware tests |
| BR-15 | Restaurant-level publish decision belongs to PlatformAdmin in current approved F04 API | D-02 pending for different owner role |
| BR-16 | Figma theme Restaurant/Café is visual direction; persistence is not assumed | D-01 contract approval |
| BR-17 | Illustrative demo cannot alter SQL, create accounts or claim a deployed menu | Demo integration negative tests |
| BR-18 | An old slug resolves as a single-hop safe alias only after approved D-06 contract | SEO/alias tests and reserved slug registry |
| BR-19 | Never mark a save/publish/delete successful solely because a Figma prototype moves to success frame | UI waits for real backend response |
| BR-20 | Admin account changes and restaurant status/publication changes generate safe audit | Atomic action + audit tests |

## Error semantics and UX outcomes

| Condition | Expected API/backend result | Screen/interaction |
|---|---|---|
| Missing/invalid cookie | 401/403 according to policy | Login or access denied |
| Cross-tenant ID | Non-disclosing 404/403 per existing contract | Generic unavailable, never foreign metadata |
| Validation failure | 400 ProblemDetails with safe field details | Preserve input, inline validation |
| Duplicate normalized owner/slug | 409 | Conflict without partial provision |
| Category not empty | 409 | Explain move/delete active items |
| Stale RowVersion | 412 | Reload/resolve conflict; never claim saved |
| Upload signature/size failure | 4xx validated error | Replace image, preserve item |
| Suspended/unpublished restaurant | Correct private/public status per contract | Unavailable and noindex |
| No visible menu items | Valid published public menu with clear empty state | No draft data |
| Remote public API failure | Safe 5xx/503 and retry UX | Never leak exception/tenant info |

## Publication decision table

| Restaurant Active | Restaurant Published | Category Published | Item Published | Item Available | Not deleted | Visible |
|---|---|---|---|---|---|---|
| yes | yes | yes | yes | yes | yes | YES |
| no | any | any | any | any | any | NO |
| yes | no | any | any | any | any | NO |
| yes | yes | no | any | any | any | NO |
| yes | yes | yes | no | any | any | NO |
| yes | yes | yes | yes | no | any | NO |
| yes | yes | yes | yes | yes | no | NO |

## Theme contract

- Restaurant identity: green primary accent #0F766E.
- Café identity: brown primary accent #6B402B.
- The current SQL default brand color is #0F766E; a durable ThemeId has not been approved. Do not treat changing brand color as a complete theme implementation.
- A single ThemeId (pending approval) should drive public background, hero/card variant, category chips, primary/secondary buttons and price accent. Status badges (Available/Unavailable/Error) retain semantic meaning. Avoid per-button independent theme decisions.

## Edge-case test inventory

- Two restaurants with same item/category GUID patterns in tests, foreign-category POST and foreign-media lookup.
- Concurrent slug provisioning, conflicts with reserved demo slug, historical alias races.
- Slug change after printed QR, one-hop redirect, no open redirect.
- Arabic-only item in English menu; zero price; long names, emoji, bidirectional punctuation and mobile 320px.
- Restaurant suspended while SSR cache warm; item visibility update during multiple public requests.
- Owner account locked or membership revoked while browser cookie persists.
- Invalid image with .jpg extension but bad signature, decompression bombs, malicious metadata, excess dimensions.
- Two simultaneous editors update same RowVersion; one receives 412.
- User retries after network timeout: avoid duplicate create without assuming idempotency-key support.
- Public route malformed QR versus syntactically valid absent code; correct 400/404 distinction from existing contract.

