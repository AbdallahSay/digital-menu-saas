# L1d verification — platform audit, suspension reason, onboarding resend, D4 plan labels

Date: 2026-11-19. Branch `claude/magical-mccarthy-emjn3t`. Local/test scope only;
no production system, data or deployment was touched.

## Scope
- `GET /api/v1/platform/audit` (action / restaurant / UTC date-range filters, paging).
- `GET /api/v1/platform/audit/export` CSV (≤ 5000 rows, formula-injection safe, audited).
- Suspension reason (required) stored in `AuditEntries.MetadataJson`.
- `POST /api/v1/platform/restaurants/{id}/onboarding/resend` (local/test delivery only).
- D4 / [ADR-010](../docs/11-ADR-AND-RISKS.md): `PlanName`, `PaidUntilUtc`, PlatformAdmin-only.
- Contract: [API contract — L1d section](../docs/04-API-CONTRACT.md).

## Schema
Migration `20261119060311_PlatformAuditAndPlanLabels` is additive only: three
nullable columns, two CHECK constraints (`CK_AuditEntry_Metadata` ISJSON,
`CK_Restaurant_PlanName` non-empty), two indexes (`IX_AuditEntries_TimestampUtc`,
`IX_AuditEntries_Action_TimestampUtc`). No data rewrite. `Down` drops the columns,
so rolling back **loses stored reasons and plan labels**; take a backup before any
non-disposable rollback. Existing immutable-tenant trigger on `AuditEntries` still applies.

## Commands executed (all run in this session)
Environment: Linux container, .NET SDK 10.0.400, disposable Docker
`mcr.microsoft.com/mssql/server:2022-latest` on loopback `localhost,1433`.

```bash
dotnet restore backend/DigitalMenu.slnx --locked-mode        # succeeded, lockfiles unchanged
dotnet build backend/DigitalMenu.slnx -c Release --no-restore # 0 warnings, 0 errors
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore   # exit 0
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
#   "No changes have been made to the model since the last migration."
dotnet ef migrations script --idempotent --project backend/src/DigitalMenu.Infrastructure --output migration.sql  # succeeded
dotnet test backend/DigitalMenu.slnx -c Release --no-build    # Passed 107, Failed 0, Skipped 0
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive  # no vulnerable packages (all 5 projects)
```

Test environment variables were `F02_SQL_CONNECTION` (loopback SA, disposable
container) and `CHROME_PATH`. The SSR suite needs `npm ci && npm run build` in
`frontend/` (done). This container's preinstalled Playwright browser is build
1243 while the project pins 1248 and the download host is blocked. I symlinked the
local headless shell to the expected path (container-local, outside the repo) to run
the browser subtest. In CI, `npx playwright install` provides the exact build.

New tests (`PlatformAuditTests`, 6 SQL facts + 10 unit cases):
- suspension reason required/bounded (null, blank, <3, >500, NUL, newline → 400), Arabic
  reason stored unescaped and returned through the audit API; reactivation without reason;
- audit filters (action, restaurant, from/to inclusive/exclusive), newest-first order,
  paging, 12 invalid-input cases returning `application/problem+json`;
- CSV: BOM, header, quoting, `'=HYPERLINK` neutralisation, attachment name, `no-store`,
  `AuditExported` self-audit, unknown restaurant filter, 5000-row cap;
- resend: CSRF required, failed delivery rolls back stamp rotation (old token still valid,
  no audit), success issues a new token and **revokes the old one**, no token/email in
  responses, 409 for onboarded / suspended / no active owner, 404 unknown, 429 + `Retry-After: 60`;
- plan labels: trim, UTC normalisation, offset input, no-op, 412, 7 invalid bodies incl.
  unknown member, 404, clearing, audit metadata, no `publishedMenuVersion` change; labels
  absent from `/auth/me`, `/admin/categories` and the anonymous public menu; owner 403 on
  audit/export/plan;
- `ProvisioningTests` deny matrix extended to the four new routes (guest 401, owner 403);
- `PersistenceTests` asserts both migrations, raw-SQL rejection of non-JSON metadata,
  empty plan name and audit tenant reassignment, and full down/up idempotent script.

## Security review (self)
- AuthZ: every route sits in a `PlatformAdmin` group; fallback policy denies anonymous.
  No client-supplied tenant scope is used for owner access; `restaurantId` here is a
  platform-wide filter only.
- Input: all query/body fields bounded server-side. Action filter is an allowlist regex
  (exact match, no LIKE). Dates parsed invariantly with explicit UTC assumption.
- Output: platform-only DTO. Owner and public projections are separate explicit DTOs,
  and regression tests guard them. No email, token or credential in audit rows or responses.
- CSV injection (CWE-1236) neutralised, RFC 4180 quoting, bounded memory.
- Resend: same Development-only delivery boundary as F04. Security-stamp rotation
  revokes older links. A per-restaurant DB-backed cooldown limits mail-bombing an owner.
  Serializable transaction, conflicts map to 409.
- Exports audited. `SameSite=Strict` cookies prevent cross-site triggering of the audited GET.

## Performance
Audit reads use `(TimestampUtc)`, `(Action, TimestampUtc)` or the existing
`(RestaurantId, TimestampUtc)` index; offset paging is capped at 200 per page;
export is a single `TOP (5001)` read. No new caches or infrastructure. The plan
change does not invalidate public menu caches. No load benchmark was run for the audit
endpoints (NOT RUN). Large-offset paging over millions of rows would need keyset
paging later.

## Risks / follow-ups
- Production onboarding delivery/outbox is still absent, so resend returns 503
  outside Development, by design.
- Audit retention/archival policy and keyset pagination for very large logs are undecided.
- Admin UI for these endpoints is not part of this increment.
- Breaking change: `/status` with `Suspended` now requires `reason`. No current
  frontend caller exists.

## شرح مختصر
**ماذا تغيّر؟** أضفنا لمدير المنصة سجل تدقيق قابل للفلترة (حسب الإجراء والمطعم
والفترة الزمنية) مع تصدير CSV آمن. صار سبب الإيقاف إلزاميًا ويُحفظ في
`MetadataJson`. أضفنا كذلك إعادة إرسال رابط التفعيل للمالك الذي لم يُكمل التسجيل،
وحقلي `PlanName` و`PaidUntilUtc` اللذين يراهما مدير المنصة فقط (القرار D4).

**لماذا؟** لتتبّع قرارات الإدارة ومراجعتها، ولمعالجة الروابط المنتهية دون حذف
المطعم وإعادة إنشائه، ولتسجيل معلومات الاشتراك يدويًا دون أي منطق فوترة. لذلك
لا يحدث إيقاف تلقائي ولا دفع.

**كيف تتحقق محليًا؟** شغّل SQL Server مؤقتًا على `localhost,1433`، واضبط
`F02_SQL_CONNECTION`، ثم نفّذ:
`dotnet test backend/DigitalMenu.slnx -c Release --filter FullyQualifiedName~PlatformAuditTests`.
