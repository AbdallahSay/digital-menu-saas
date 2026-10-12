# F02 persistence foundation

هذه الإضافة تنفّذ نموذج SQL فقط. المفاتيح المركّبة تمنع ربط صنف بتصنيف مطعم آخر أو صورة بصنف أجنبي، حتى عند استعمال SQL مباشر. جداول Identity جاهزة للمرحلة F03، دون تنفيذ تسجيل دخول أو صلاحيات أو إنشاء حسابات. لا يتصل التطبيق بقاعدة تلقائيًا ولا يشغّل migrations عند بدء التشغيل.

## Local verification (disposable SQL Server only)

```powershell
SqlLocalDB create DigitalMenuF02
SqlLocalDB start DigitalMenuF02
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet ef migrations script --idempotent --project backend/src/DigitalMenu.Infrastructure --output backend/F02-migration.sql
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger trx
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
```

The suite ignores the configured database name, creates `DigitalMenu_F02_Test_<random GUID>` and removes only that database in finally. Accepted server targets are the dedicated `(localdb)\DigitalMenuF02` instance and `localhost,1433` for the isolated CI container. Never point these at shared/production servers. LocalDB integrated authentication needs no passwords. `Encrypt=false` is restricted to local disposable transport; production TLS configuration is outside F02. No certificate validation bypass is configured.

## Model decisions

- Domain has no EF or Identity dependency. Infrastructure owns `ApplicationUser : IdentityUser<Guid>` and `IdentityDbContext` schema, enabling future Identity integration without inventing credential storage.
- UUID entity primary keys plus `(RestaurantId, Id)` alternate keys; all dependent catalog links use composite foreign keys. The fixture uses distinct IDs because globally unique primary keys cannot share the same ID; both restaurants use equivalent Arabic category names.
- SQL Server `decimal(18,2)`, nonnegative price/order checks, fixed MVP EGP currency, bounded strings, rowversions for restaurant/category/item/settings. Required strings still require application-level nonblank validation in later endpoint tasks.
- All foreign keys use NO ACTION. Hard-delete cleanup is explicit; soft-delete flags are stored without premature F05 query filters.
- SQL triggers reject updates naming RestaurantId on tenant-owned rows, PublicCode on restaurants, or ObjectKey on images, including no-op assignments. EF SQL OUTPUT is disabled on affected tables to support triggers. Future DTOs must exclude immutable fields.
- Item image keys have tenant UUID prefixes and reject traversal/backslashes. Logo/cover fields reserve bounded storage references; F08 must validate tenant ownership and normalized content for branding uploads too. No upload implementation is included.
- Audit stores bounded action/resource/correlation identifiers with nullable actor/tenant foreign keys; arbitrary metadata/secret payloads are deliberately absent. Retention policy is deferred to operations.
- PublishedMenuVersion is persisted; future public mutation services must increment it transactionally. Slug renaming/redirect policy and shared slug namespace remain for S01; no rename endpoint is exposed here.
- No DbContext registration, endpoints, startup migration, production connection configuration, authentication, provisioning, or authorization changes. F01 health/readiness remains dependency-free.

## SQL evidence and scope

The SQL integration scenario verifies fresh migration, repeat migration, pending-model detection, two tenants, zero price, valid image/membership/settings/audit writes, and direct SQL failures: foreign-category INSERT/UPDATE, foreign item-image link, negative price, referenced category/restaurant deletion, duplicate slug/public code, unsupported locale, zero image width, nonexistent user, tenant/key reassignment. It checks SQL error numbers 547 (FK/CHECK), 2601 (unique index), and 51000 (immutability trigger), plus EF stale-rowversion rejection. It rolls back the migration in its own disposable database, then executes the generated idempotent SQL script twice and verifies clean data and one migration.

CI adds an independent job with a digest-pinned SQL Server 2025 container, per-run random masked password, loopback-only port, no volume, locked restore and TRX/script artifacts. Missing SQL environment skips the SQL scenario in the existing foundation job; the dedicated F02 job supplies the environment and must execute it. F01 workflow and frontend/design files are unchanged.

Performance impact: tenant-leading indexes support documented read paths; alternate-key indexes and immutability triggers add write/storage overhead. No query-plan/load/CWV performance claim is made before public data queries exist. Microsoft-maintained EF/Identity packages are pinned to 10.0.11 with lock files; EF/Identity code uses MIT licensing, while SQL Server test image requires its vendor EULA (CI explicitly accepts it).

NOT RUN locally: Docker/Linux CI execution (daemon unavailable), frontend/browser/Lighthouse reruns (no public/UI changes), production/staging load/query-plan benchmarks, external peer review. These remain review/release gates; P0 production architecture approval remains pending.

## Executed evidence — 2026-10-12

Windows .NET SDK 10.0.400, runtime 10.0.11; dedicated LocalDB SQL Server 17.0.4025.3. Final SQL test run: 7 passed, 0 failed, 0 skipped (six unchanged F01 tests plus the F02 SQL scenario), exit 0. The scenario executed all the assertions listed above, including rollback and idempotent script replay twice. No shared databases were accessed.

Locked restore, Release build (zero warnings/errors), format verification, EF pending-model verification, idempotent migration script generation, dependency advisory scan and git whitespace check all exited 0. NuGet reported no vulnerable packages for all five projects. Migration script is checked in as `backend/F02-migration.sql` for review; never apply it to production without approval.

Two intermediate verification failures were diagnosed and fixed: an obsolete migration-count assertion during snapshot consolidation, and CREATE TRIGGER inside idempotent IF blocks. The final single migration wraps fixed trigger DDL in EXEC, and the real SQL replay test now passes. No failing checks were disabled.

Security self-review: SQL rejects cross-tenant relationships and immutable-field reassignment; all destructive operations in tests are confined to newly created randomly named databases. No runtime data endpoints or session behavior were added. Authorization/query isolation is intentionally not claimed by F02 and must be implemented/tested in F05 before exposing CRUD. No high/critical dependency advisory found; manual peer review, full release licensing review and CI completion remain outstanding.

Modified files: this report, `docs/03-DATA-MODEL.md`, `dotnet-tools.json`, `.github/workflows/persistence.yml`, `backend/F02-migration.sql`, Domain `Entities.cs`, Infrastructure project/lock file, `Persistence/MenuDbContext.cs`, `Persistence/Configurations.cs`, initial migration/designer/snapshot, integration `PersistenceTests.cs`, and API/integration lock files for transitive dependencies. Frontend/Antigravity files and F01 CI are untouched.
