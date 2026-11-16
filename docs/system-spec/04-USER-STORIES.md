# 04 — User stories, priorities and Given/When/Then acceptance criteria

Each story has an ID and links to functional requirements (FR) and existing milestone IDs in docs/10-BACKLOG.md. Stories are implementation slices, **not evidence of existing feature completion**.

## Epic EP-PLAT — Platform administrator

### US-PLAT-01 — Provision a new tenant (P0; F04)
As a PlatformAdmin, I want to create a restaurant and owner safely so that the restaurant can start configuring its own menu. **FR-002, FR-003, FR-008.**
- Given a valid unique restaurant slug and unused normalized owner email, when I provision, then restaurant, membership, settings and audit are committed together; public code is immutable and restaurant starts unpublished.
- Given an already registered email or duplicate slug, when I provision, then I receive 409, no partial entities and no extra privilege.
- Given delivery unavailable, when onboarding would require mail, then the system refuses to claim that a mail invitation was sent.

### US-PLAT-02 — View and find restaurants (P0; F04)
As a PlatformAdmin, I need a paginated directory and details so that I can manage tenants. **FR-004, FR-005.**
- Given permitted role, when filtering by name/slug, then results are stable, bounded and safe DTOs.
- Given a non-admin, when calling the same API, then access is denied.

### US-PLAT-03 — Suspend/reactivate (P0; F04)
As a PlatformAdmin, I want to suspend or reactivate a restaurant with concurrency protection. **FR-006, FR-008.**
- Given current RowVersion, when I suspend, then the public menu becomes unavailable and an audit record exists.
- Given stale RowVersion, when I change status, then 412 and no mutation.
- Given Reactivate, the previous publication choice persists, but memberships/accounts are not implicitly re-enabled.

### US-PLAT-04 — Restaurant publication governance (P0; F04)
As a PlatformAdmin, I want to manage restaurant-level publication. **FR-007, FR-008.**
- Given active tenant and valid RowVersion, when published, then only explicitly public categories/items become available and version increments.
- Given suspended tenant, publication flag alone never bypasses suspension.

### US-PLAT-05 — Audit and owner views (P1; U02/Q01)
As a PlatformAdmin, I want owner details and change history without personal secrets. **FR-008, FR-009, FR-010.**
- Given creation/suspension, when reviewing audit, then actor, action, resource and UTC time appear, not password/invite token.
- Given no results or conflict, the UI shows a concise accessible state with an actionable recovery.

## Epic EP-AUTH — Identity and authorization

### US-AUTH-01 — Secure sign-in and sign-out (P0; F03)
As an authorized owner/admin, I want a session that is secure and revocable. **FR-011, FR-012, FR-013.**
- Given valid credentials and CSRF handshake, when logging in, then a Secure HttpOnly cookie is issued.
- Given wrong, locked or unknown account, then generic failure; repeated failure enforces lockout.
- Given logout, when requesting protected data again, then access is denied.

### US-AUTH-02 — First access by invite (P1; F04)
As a newly provisioned owner, I need a safe invite/setup path, not public signup. **FR-014.**
- Given privileged platform provisioning, setup tokens are short-lived, not leaked, and onboarding is auditable.
- Given no delivery provider, the product does not pretend email was sent.

## Epic EP-OWNER — Restaurant owner

### US-OWNER-01 — Manage categories (P0; F06/U02)
As an Owner, I want to create, rename, reorder and publish my categories. **FR-020–023.**
- Given a valid Arabic category name, changes persist and sort order is reflected publicly only if published.
- Given a category with active items, delete is refused with 409 and a usable explanation.
- Given a foreign tenant category ID, no read/write is possible.

### US-OWNER-02 — Edit dishes and price (P0; F07/U03)
As an Owner, I want to create/edit dishes in my own categories. **FR-024–027.**
- Given a category belonging to my restaurant, required Arabic name and price >=0, when saved, then item is persisted.
- Given a foreign category, invalid price or stale RowVersion, then the mutation fails safely with useful validation/conflict.
- Given soft deleted, unpublished or unavailable item, it is excluded from public projection.

### US-OWNER-03 — Manage dish photos (P0; F08/U03)
As an Owner, I want safe optimized photos for dishes. **FR-028, FR-029.**
- Given supported genuine image bytes, when uploaded, the service re-encodes them, strips metadata and stores under an opaque own-tenant key.
- Given malformed, oversized or foreign item, upload is rejected with no usable foreign object reference.

### US-OWNER-04 — Set restaurant brand (P0; U03)
As an Owner, I want to update logo, cover and opt-in contact fields. **FR-030, FR-057.**
- Given a valid update, then only selected public contact fields appear on the public menu.
- Given owner-private values, never expose those in an anonymous response.

### US-OWNER-05 — Select a menu identity (P1; U01/U03; D-01)
As an Owner, I want the approved Restaurant/Café identity to apply consistently to the customer menu. **FR-031, FR-062.**
- Given Restaurant theme, buttons, chips, prices and primary accents match the green design.
- Given Café theme, the same elements match the brown design; availability/status colors remain semantic.
- Persisting a selected identity is **blocked until D-01 API/schema approval**; no fake success or inferred SQL field.

### US-OWNER-06 — Privileged preview and QR (P0; U03/F09)
As an Owner, I want to preview changes privately and download a permanent QR. **FR-032, FR-033.**
- Given draft dishes, private preview can include them under auth; anonymous public menu cannot.
- Given name/slug change, printed QR still points to /m/{PublicCode} and resolves to current canonical.

### US-OWNER-07 — Explicit save/error recovery (P1; U03)
As an Owner, I need honest success, validation, conflict and retry states. **FR-027, FR-034, FR-035.**
- Given rejected save, UI retains edits and never says saved.
- Given successful API completion, UI shows accurate result and reachable next action.

### US-OWNER-08 — Publication workflow authority (P1; D-02)
As an Owner, I can see current publication and a confirmation UI only if authorized. **FR-034, FR-036.**
- Given no approved owner publication endpoint, an owner must not mutate restaurant-level publication via guessed platform API.
- If role scope changes, approve D-02 and amend contracts/security tests first.

## Epic EP-PUB — Anonymous customer

### US-PUB-01 — Scan QR and open menu (P0; F09/S01)
As a customer, I want a printed QR to open the current menu without an app. **FR-050, FR-051, FR-053.**
- Given an active published tenant and valid code, /m/{PublicCode} returns one 302 to /r/{slug}.
- Given inactive or missing tenant, sensitive data is not exposed and the response uses the approved unavailable/404 policy.

### US-PUB-02 — Browse only visible items (P0; F09/U04)
As a customer, I want categories and available dishes in order. **FR-052, FR-053.**
- Given published category/item and available item, it is present.
- Given suspended tenant, hidden category, unavailable/deleted item, it is absent even from raw SSR HTML.

### US-PUB-03 — Search and filter (P0; U04)
As a customer, I want readable search and categories. **FR-054, FR-056.**
- Given a query, only already-visible menu items are filtered.
- Given no matches or network error, display an accessible zero-results or retry state.

### US-PUB-04 — Switch language (P0; U04)
As a customer, I want Arabic RTL or English LTR. **FR-055.**
- Given missing English dish text, fall back to Arabic without fabricated translation.
- Given language switch, direction, labels, numbers, prices and accessible names are coherent.

### US-PUB-05 — See selected visual identity (P0 UI, D-01 for persistence)
As a customer, I want branded Restaurant or Café presentation. **FR-062.**
- Given each Figma theme, controls/chips/cards/prices match its approved values.
- No purchase/order CTA is shown; contact fields are owner opt-in only.

### US-PUB-06 — Find menu from search (P0; S01/S02)
As a customer/crawler, I need indexable, fast, truthful server HTML. **FR-059–061.**
- Given active published menu, initial HTTP HTML includes restaurant and item plus correct metadata/canonical.
- Given suspended/hidden content, crawler and sitemap cannot index it.

## Epic EP-DEMO — Marketing and illustrative preview

### US-DEMO-01 — See what the product does (P1; U01/U04)
As a visitor, I want an accessible marketing page and demo. **FR-070–072.**
- Given a demo step, selected theme and illustrative items are shown as **unpublished**.
- Given a completed walkthrough, show a demo completion state but **do not** create an account or claim live QR.
- Given validation error, keep entered demo details and offer recovery.

## Epic EP-SYS — Platform-wide safety

### US-SYS-01 — Tenant noninterference (P0; F05/Q01)
As a tenant, I require my data to remain private from other tenants. **FR-080, FR-081.**
- Given Owner A and any B category/item/image/restaurant identifier, GET/POST/PATCH/DELETE denies without revealing B data.
- Given category from B in A item mutation, application guard and SQL relational constraint reject it.

### US-SYS-02 — Freshness, errors and operability (P0; S03/Q02/R01)
As an operator, I need public edits to appear safely without stale or cross-tenant responses. **FR-082–085.**
- Given published edit, public HTML/cache version invalidates under approved freshness policy.
- Given overload/upstream failure, safe ProblemDetails/status, health signal and redacted correlation logs exist.

