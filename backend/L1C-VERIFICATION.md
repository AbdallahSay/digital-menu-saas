# L1c — Owner utilities: QR, dashboard summary, bulk reorder, reserved slugs

Base: `origin/main` at `8eb7c0a` (PR #44 merge).
Branch: `claude/exciting-thompson-lxdl2i`. Human peer review is required before merge.
"L1c" is the phase name used in the request; it is not yet an entry in
`automation/tasks.json` or `docs/10-BACKLOG.md`. Closest backlog rows are the U03
QR screen inputs and the F04 reserved-route follow-up from doc 18.

## Behavior and files

- `src/DigitalMenu.Api/Owner/QrCode.cs`: an in-repo ISO/IEC 18004 encoder (byte
  mode, level M, versions 1-10) with SVG and PNG renderers. PNG uses the existing
  SkiaSharp dependency.
- `src/DigitalMenu.Api/Owner/OwnerUtilities.cs`: `GET /api/v1/admin/qr`,
  `/qr/svg`, `/qr/png` and `/summary`, plus `PublicSite:Origin` options validation.
- `src/DigitalMenu.Api/Catalog/Reorder.cs`, `Categories.cs`, `Items.cs`: the
  shared `POST .../reorder` handler for categories and items.
- `src/DigitalMenu.Application/TenantAccess.cs` and
  `src/DigitalMenu.Infrastructure/Tenancy/TenantDataSession.cs`: two bounded
  tenant-session primitives, `CountAsync` and `EditManyAsync` (1..100 rows, one
  tenant-scoped query, 404 decided before 412, tracker cleared on rejection,
  denial audit except for version conflicts).
- `src/DigitalMenu.Api/Platform/Provisioning.cs`: the reserved-slug set and a 409
  rejection before any write.
- `src/DigitalMenu.Api/Program.cs`: route registration; the 16 KiB body cap for
  reorder endpoints (items keep their 32 KiB cap).
- `src/DigitalMenu.Api/appsettings.Development.json`: local
  `PublicSite:Origin = http://localhost:4000`. This is a placeholder for a local
  origin, not a secret.
- Tests: `QrCodeTests.cs` (20 non-SQL), `OwnerUtilityTests.cs` (7 SQL), and one
  added test in `ProvisioningTests.cs`.
- Docs: `docs/04-API-CONTRACT.md` (L1c section, F04 and S01 notes) and a
  one-cell update in `docs/18-S01-REVIEW-AND-S02-PLAN.md`.

No migrations, no new NuGet/npm packages, no lockfile changes, no frontend or
workflow changes, no deployment.

### Dependency decision

`QRCoder 1.8.1` (MIT) was evaluated first. For net10 it resolves only its
`net6.0` asset group, which pulls in `System.Drawing.Common 6.0.0`. That package
is Windows-only and out of support. To avoid adding a stale transitive
dependency, it was rejected. The encoder covers only what we need, because our
input is always a platform-generated ASCII URL of at most about 125 characters.

## Executed verification

Linux container, .NET SDK 10.0.400, SQL Server via the CI-pinned image digest
`mcr.microsoft.com/mssql/server@sha256:2b5b5816…` on loopback with a random
throwaway SA password. Each fixture creates and drops its own database. No
production connection.

- `dotnet restore backend/DigitalMenu.slnx --locked-mode`: exit 0, no lockfile changes.
- Release build: 0 warnings, 0 errors.
- `dotnet format --verify-no-changes`: exit 0.
- Full suite (SQL + SSR): **119 passed, 0 failed, 0 skipped** (91 baseline + 28 new).
- `dotnet list package --vulnerable --include-transitive`: no vulnerable packages
  in any of the 5 projects.
- `dotnet ef migrations has-pending-model-changes`: no changes.
- Mutation check: five deliberate encoder faults (GF polynomial, format mask,
  timing-column skip, version BCH, block interleave). Each made 5–16 QR tests fail.
- Timing on local disposable SQL, not a production benchmark: a 100-item reorder
  took about 1.15–1.2 s on the first request and about 760–790 ms warm.

Environment note: in this container, the frontend's pinned Playwright expects
`chromium_headless_shell-1248`, but the image ships `1243`. The SSR browser
subtest passed only after pointing `PLAYWRIGHT_BROWSERS_PATH` at a scratch
directory that symlinks the installed 1243 build. Repository files were not
changed. CI uses its own browser install.

### QR correctness evidence and what was NOT RUN

`QrCodeTests.Decode` is a read-back decoder built from published ISO/IEC 18004
table values, not from encoder internals. Those values are the level-M format
words (Annex C), the version-information words for v7–v10 (Annex D), alignment
positions, total codewords and the level-M block structure (table 9).

For every case it checks:

- the finder, separator and timing patterns and the dark module;
- both format copies and both version copies;
- that the data-module count equals the published codeword total;
- de-interleaving, and a zero result for every Reed–Solomon syndrome;
- the byte-mode header, terminator and pad sequence, and the exact text.

Boundary lengths at each published byte capacity for v1–v10, plus 64 random
`/m/{code}` URLs, round-trip exactly.

**NOT RUN:** decoding with a third-party scanner (jsQR, ZXing, zbar or a phone).
Installing an external decoder was blocked in this session, and none is
pre-installed. Before release, also check by hand: download both files from a
dev instance and scan them with two phone camera apps, in print size and on
screen.

```bash
curl -k -b cookies.txt -o qr.png https://localhost:5001/api/v1/admin/qr/png
```

## Security review

- Scope: every route uses `TenantOwner` and `ITenantDataSession`, which derives
  the tenant from the server. Spoofed `X-Restaurant-Id`/`X-Role` headers,
  `?restaurantId=` and `restaurantId` body fields are ignored or rejected. Tests
  confirm that A never sees B's code, counts or rows. A batch that mixes in a
  foreign ID returns 404, makes no partial writes, leaves B's version unchanged
  and records denial audits.
- Batch reorder: all-or-nothing in the existing Serializable commit. IDs must be
  distinct, 1..100 per batch. Ownership (404) is checked before rowVersion (412),
  so 412 cannot be used to probe foreign IDs. Unknown JSON fields return 400.
  CSRF is required (tested). The body cap is 16 KiB.
- QR/SSRF/host-header: the origin comes only from configuration and is validated
  (HTTPS or loopback HTTP only, no path or userinfo). A `javascript:`, external
  HTTP or path-bearing origin fails closed with 503 (tested). The Host header is
  never used.
- XSS: the SVG holds only numeric path data. It is served as an attachment with
  nosniff and `default-src 'none'`. The filename uses the slug, which is
  constrained to `[a-z0-9-]` by a SQL check constraint. The `{format}` route
  accepts only `svg` or `png`.
- Information exposure: no restaurant or user IDs and no internal metadata appear
  in responses. Summary counts cover the caller's own tenant only.
- Reserved slugs: checked after trim and lowercase, before the transaction. No
  onboarding token is created for a reserved slug (tested).

## Performance impact

- QR: generated on each request, a few ms of CPU. Responses are no-store, so
  there is no cache. The PNG is about 41–65 modules × 16 px, a few KB.
- Summary: 1 restaurant read plus 5 `COUNT` queries. Each call re-validates the
  tenant (3 small indexed queries), so about 24 short round trips. This is fine
  for an owner dashboard. A single aggregate query is a later optimization if
  needed.
- Reorder: one tenant-scoped `IN` load. `CommitAsync` runs its existing
  per-entry validation (existence and category checks) twice per entry inside a
  Serializable transaction, which makes 100 entries take about 0.8 s locally.
  Typical batches of 10–30 entries cost proportionally less.

## Risks and next steps

1. **Reorder cost/lock duration** grows linearly with batch size inside a
   Serializable transaction. Suggested follow-up, which needs review because it
   touches the tenant boundary: set-based checks in `TenantDataSession.CommitAsync`.
2. **Legacy reserved-slug rows** (for example an existing `demo` tenant) are not
   remediated. That needs an owner-approved plan. A DB check constraint could
   follow once data is clean.
3. **Production `PublicSite:Origin`** must be set per environment. Without it, the QR
   endpoints return 503 by design.
4. A manual phone-scan check is still outstanding (see NOT RUN).
5. U03 can now build the QR, dashboard and drag-to-reorder screens on these
   contracts.
