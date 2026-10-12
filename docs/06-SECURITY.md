# Security & Privacy Requirements / Threat Model

## Assets / adversaries
Assets: admin credentials and sessions, owner menu drafts, unpublished prices/images, tenant membership, uploaded files, platform operations, availability. Threats: malicious owner probing another restaurant ID; unauthenticated endpoint abuse; XSS in text/logo files; CSRF; login brute-force; insecure file upload; stolen session cookie; SSRF through remote image URLs; abusive automated public requests; accidental secret disclosure.

## Severity-zero invariants
- A's owner cannot read/update/delete B's item/category/media by swapping any ID, regardless of browser UI.
- No anonymous client may access drafts or admin paths/data.
- Public code/slug is a routing identifier, not a secret or authorization credential.
- Platform authority must not be attainable by self-set role/claim or insecure seeds.
- No unsafe admin mutation succeeds without a valid authenticated principal, authorization and CSRF protection.

## Controls and implementation review checklist
1. **Authorization:** `RequireAuthorization` by default with anonymous explicitly allowed for `/api/public`; platform endpoints require platform role; admin operations enforce active restaurant membership derived server-side. Authorization tests for every endpoint/method including direct object references.
2. **Database isolation:** scoped queries and writes by RestaurantId; EF Core filters as layered defense; composite FKs constrain cross-tenant relationships; negative tests for queries, commands, upload path, caching. Avoid unrestricted `IgnoreQueryFilters` except reviewed platform services.
3. **Session:** ASP.NET Core Identity, Secure+HttpOnly cookie, appropriate SameSite, anti-CSRF token for unsafe requests, session expiry, account lockout/rate limiting, secure password reset/invite lifecycle, no production default password. Consider MFA for platform admins before broad rollout.
4. **Input / output:** typed DTOs and server validation, encoded Angular bindings instead of bypassing sanitization, strict URL handling/allowed protocols for public contact links. Rich HTML and user-supplied scripts prohibited in MVP. Error details should not leak identifiers, tokens, SQL or stack traces.
5. **Uploads:** Allow JPEG/PNG/WebP after verifying magic bytes and full decoding, strict 5 MiB upload max (tunable), max dimensions/pixels, transform to safe image formats using maintained server library, remove EXIF, random server-generated object keys, tenant namespaces, prohibit SVG uploads, directory traversal, decompression bombs and remote arbitrary fetch. Antivirus scanning policy if later accepting non-image files. Production media stored outside executable app paths; restrict upload credentials.
6. **API abuse:** login and upload rate limit policies and sane anonymous read protection, IP/user-based where reliable; behind trusted reverse proxy configure forwarded headers securely. Use WAF/CDN only if available and appropriately configured; it does not replace app-layer authorization.
7. **CSP/headers:** HTTPS redirects, HSTS in prod, `X-Content-Type-Options: nosniff`, modern CSP tested against Angular assets, clickjacking defense/frame ancestors, referrer and permissions policies; no wildcard CORS with credentials.
8. **Secrets/config:** use dotnet user-secrets / environment variables locally; CI secret store and secret scanning; no secret in code, commits or logging; SQL least privilege.
9. **Logging:** security events, denied access, auth failures, permission changes, moderation status changes, uploads; redact passwords, auth cookies, tokens and private user content; retention, audit and access limits.
10. **Dependency/security review:** pin compatible versions, vulnerability scans and license review, SAST and source scanning in CI, manually review high-risk dependencies.
11. **Production readiness:** backup restoration tested, least privilege storage/DB, HTTPS, incident playbook and rollback steps, change approvals.

## Mandatory negative tests

### F05 implemented owner boundary

Authenticated identity is obtained by authenticating the named Identity cookie,
not by accepting a caller-created HttpContext.User, role claim, bearer/header
value or RestaurantId. Account security stamp, lockout, password/MFA eligibility,
all active Owner memberships (take 2) and restaurant status are checked from SQL.
Exactly one active membership is required. No arbitrary first tenant is selected.
F03 authentication and PlatformAdmin provisioning remain unchanged.

Owner handlers must depend on `ITenantDataSession` and require `TenantOwner`.
`MenuDbContext` remains the explicit privileged Identity/platform/authorization
path and must not be injected into catalog/media/owner handlers. Its null scope
preserves those reviewed callers. A data session owns a private context initially
bound to an empty/denied tenant, then freezes the authenticated scope. Conditional
global query filters are defense-in-depth: every read also has an explicit
RestaurantId predicate, and every write verifies canonical persisted ownership,
original/current keys, and associations. No IQueryable/DbContext/raw SQL escapes
the session. The only unscoped catalog lookup is an internal scalar new-key
collision check: it never materializes foreign data and rejects generically.

The Serializable commit rechecks identity/stamp/memberships/status under the same
transaction and locks as resource changes. A revoked/suspended/inactive or
ambiguous actor cannot commit a previously loaded edit. Denial clears pending
changes. Existing F02 composite FKs, immutable tenant/object-key triggers and
rowversion remain the database backstop. A read already authorized/in flight can
complete before revocation; new operations resolve fresh state, and writes are
revalidated transactionally. Do not cache scopes across requests or use a session
concurrently from multiple threads; concurrent requests use independent scopes.

Audits persist only server-defined actions (`TenantAccessDenied` or
`TenantWriteCommitted`), own bound actor/restaurant IDs and UTC time. No supplied
foreign ID, resource name, description, media key, request header/body, cookie,
password or security stamp is persisted. Auth-only policy failures use generic
authorization diagnostics; a data-session denial records a coarse event.
Denial audit failure never grants access and emits only a constant warning.
Successful audit and writes share the transaction. Actor/scope ToString omits
credentials/IDs to avoid accidental plain logging.

F08 must extend the namespace guard with real storage metadata/content checks;
F06/F07 must validate fields, soft-delete rules and expected client rowversion.
No production upload/catalog route exists in F05. See the
[SQL adversarial matrix and deferred HTTP checks](../backend/F05-VERIFICATION.md).

- Owner A GET/PATCH/DELETE item B -> no B info, no B mutation.
- Owner A posts B CategoryId when creating A item -> 400/404, no insert.
- Owner A uploads to B product -> no file stored in B namespace.
- Anonymous GET protected endpoints -> 401/403 as applicable; public response excludes draft.
- Disabled owner / suspended restaurant -> admin blocked according to explicit policy; public unpublished.
- Forged cross-site POST without CSRF -> rejected.
- Malicious HTML/script in names and descriptions displayed as inert text.
- SVG or fake image disguised as JPEG, oversize or decompression bomb -> rejected.
- User X edits with stale rowversion -> consistent conflict, no silent data loss.
- Concurrent requests cannot escalate roles or produce duplicate unsafe provision artifacts.

## Required reviewer output

F04 local onboarding: the optional Development-only IPC sink is disabled by
default and never registered in Production/Staging. No HTTP token retrieval,
file-based drop, plaintext password storage or email sender is provided.
Committed invitations are available only through an OS-user-scoped pipe;
Windows denies network logons explicitly. Consumers use trusted loopback HTTPS,
the existing CSRF handshake and one-use Identity tokens. Pending memory is
bounded and aborted transactions never release invitations. See
[setup and verification](../backend/F04-LOCAL-ONBOARDING.md). Local same-user
processes (and OS administrators) are trusted; this is not multi-user hosting.

Threats considered, entry points, rejected exploit cases with tests executed, exact evidence, unresolved high risks, compensating controls. Never write '100% secure'.

## Reference
OWASP Multi-Tenant Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Additional SSR and SEO security constraints
- SSR reads **public projections only**; never pass authorized request cookies/auth headers into a globally cached or serialized public menu response.
- Prevent cross-request mutable state in the SSR Node process. Concurrent A/B request test must show no cross-tenant brand, products, tokens, configuration or meta tags.
- Escape untrusted restaurant/user-provided text for HTML attributes, text nodes and JSON-LD script context; safely serialize JSON-LD (including `</script>` cases), without unsafe innerHTML.
- All canonical/redirect URLs must be validated same-origin; slug redirect map must not enable open redirects or URL injection.
- Shared HTML/page caching must be restricted to published anonymous variants and keyed by tenant identity, locale, publish version. Avoid admin preview material in public CDN caches.
- Live sitemap and structured data may contain **only** published/safe approved details; no admin contact, personal emails, suspended identities, draft names or secret URLs.
