# F03 — Identity sessions, CSRF and rate limits

تم استبدال مخطط الكوكي المؤقت بـASP.NET Core Identity باستخدام جداول F02. الهدف هو تسجيل دخول آمن دون تسجيل عام أو provisioning أو CRUD للمطاعم. لا يوجد ترحيل جديد: المخطط الحالي يحتوي جداول Identity المطلوبة. لا تُشغّل migrations عند بدء التطبيق.

## Decisions and boundaries

- Explicit login/logout/me/csrf routes only; no `MapIdentityApi`, bearer tokens, client session storage or self-selected roles. Login accepts only email/password. Password policy: 12 characters, Identity defaults for case/digit/symbol; unique email validation.
- Secure/HttpOnly `__Host-DigitalMenu.Session`, SameSite Strict, root path, no Domain, nonpersistent browser cookie and fixed 30-minute ticket expiry. SecurityStamp validation runs on every authenticated request and does not renew the lifetime. Logout changes the stamp, revoking every existing session for that user. Password/stamp changes are checked on the next request.
- Lockout: five failed passwords, 15 minutes. Administrative account disablement can use `LockoutEnd=DateTimeOffset.MaxValue` with `LockoutEnabled=true` and SecurityStamp rotation; F04 will own that operation. The login response does not distinguish wrong/absent/locked/inactive/suspended accounts. Unknown accounts perform a password hash to consume the work factor; exact constant-time behavior is not claimed.
- Session eligibility requires PlatformAdmin or an active Owner membership in an Active restaurant. This is a login/session eligibility check, not the F05 tenant CRUD authorization layer. `/me` joins only memberships for the authenticated user and projects restaurant names without user IDs/private email. Deleted/ineligible users are rejected on the next request.
- MFA-enabled accounts fail closed until a separate MFA flow exists; F03 never bypasses a second factor.
- Every unsafe `/api` request validates `IAntiforgery` after authentication/authorization, including anonymous login. SameSite is defense in depth. CSRF is identity-bound: refresh it after login. `/csrf` provides a readable Secure XSRF-TOKEN for Angular's default X-XSRF-TOKEN header, while its antiforgery companion cookie remains HttpOnly. No CORS is enabled.
- HTTPS required on authentication paths and unsafe API methods. Auth body size is 8 KiB where the server exposes the request-size feature; email/password lengths are also validated. API responses retain no-store, nosniff and add restrictive CSP/frame/referrer headers. Forwarded headers are not trusted automatically. Production proxy trust and HTTPS termination configuration require deployment review.
- All auth routes share 10 requests/minute per direct remote IP with no queue; process-local rate limiting and persistent account lockout provide two independent controls. Clients behind one proxy currently share a limit; multi-replica global limits, trusted proxy configuration and distributed abuse controls remain production review items. No Redis was introduced.
- Database connection is explicit `ConnectionStrings:MenuDatabase`; absent login configuration returns 503. No default database credentials or automatic seed exist. Health endpoints remain dependency-free to preserve F01. Database readiness checks remain an operations follow-up.

## Development bootstrap

Bootstrap runs only with explicit `--bootstrap-admin=true`, Development environment,
a dedicated `(localdb)\DigitalMenuF02` or isolated CI `localhost,1433` server, and
a `DigitalMenu_Dev_...` database. It requires an already migrated empty Identity
user store. Serializable transaction creates one PlatformAdmin role/user; invalid
credentials roll back everything, and a repeated invocation fails. Bootstrap
does not start the web listener or run migrations. Production bootstrap is blocked
pending architecture/security approval; no deployment account is created here.

Use environment variables `ConnectionStrings__MenuDatabase`, `Bootstrap__Email`,
`Bootstrap__Password` through a local secret manager/session. Do not place actual
credentials in command-line arguments, files or logs. With those values present:

```powershell
$env:ASPNETCORE_ENVIRONMENT='Development'
dotnet run --project backend/src/DigitalMenu.Api --no-launch-profile -- --bootstrap-admin=true
# Remove the bootstrap credentials from the environment after use.
dotnet run --project backend/src/DigitalMenu.Api --launch-profile https
```

Trust the local development HTTPS certificate through `dotnet dev-certs https --trust`
if needed; never disable certificate validation. The existing HTTP SSR demo remains
the F01 fixture and is not an admin login integration. Angular login integration
is a later UI task; no Antigravity files changed.

## Reproduce verification

```powershell
SqlLocalDB start DigitalMenuF02
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger trx
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
```

SQL tests create randomly named `DigitalMenu_Dev_F03_Test_<GUID>` databases and
delete only those databases. No shared/production databases are used. Local SQL
plain transport is confined to LocalDB/loopback disposable tests; HTTPS cookie
behavior is exercised through TestServer's HTTPS request context without bypassing
TLS certificate checks. Existing SQL CI automatically executes these tests using
its disposable SQL Server container. Foundation CI continues running tests which
do not require SQL, while SQL cases report skipped unless F02_SQL_CONNECTION is set.

## Security and performance review

No new dependencies, schema, secrets, public-menu pages, provisioning, or general
tenant CRUD policies. Tests cover missing/forged/stale CSRF, secure cookie flags,
replay after logout, expiration using a controlled clock, generic failures,
lockout and 429, membership/suspension/stamp revocation, disabled account, MFA
refusal, anonymous protected paths, bootstrap rollback/repeat/production denial,
and profile isolation between two restaurants. F02 SQL constraint and migration
tests remain enabled.

SecurityStamp plus eligibility checking incurs database reads on every authenticated
request; this deliberately prioritizes revocation correctness. Anonymous SSR/menu
fixture routes do not acquire this SQL workload. No mobile CWV or throughput claims
are made. Review real authenticated load before increasing stamp validation latency.

Release blockers: P0 architecture/hosting approval; reviewed Data Protection key
persistence/protection and trusted HTTPS proxy setup; production bootstrap; MFA
for platform administrators; F04/F05 provisioning/tenant authorization; external
peer review and full release/security gates. NOT RUN locally: production deployment,
browser Angular login flow, load/real mobile benchmarks, Docker/Linux execution.

## Executed evidence — 2026-10-12

Environment: .NET SDK 10.0.400/runtime 10.0.11; Windows; dedicated SQL Server
LocalDB 17.0.4025.3. Final SQL-backed run passed **16 tests, 0 failures, 0 skips**:
six F01 tests, F02's SQL migration/constraint scenario, seven F03 SQL/API scenarios,
and two database-free guard tests. Bootstrap services were tested through the
actual Identity store, including rollback and repeat rejection; the standalone
CLI invocation was not run separately.

| Executed command | Exit / evidence |
|---|---|
| `dotnet restore backend/DigitalMenu.slnx --locked-mode --disable-parallel -m:1` | 0 |
| `dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1 -p:UseSharedCompilation=false` | 0; 0 warnings/errors |
| `dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore` | 0 |
| `dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure --no-build` | 0; no pending changes |
| `dotnet test backend/DigitalMenu.slnx -c Release --no-restore -m:1 --logger trx` with SQL environment | 0; 16 passed, 0 skipped |
| `dotnet vstest backend/tests/DigitalMenu.IntegrationTests/bin/Release/net10.0/DigitalMenu.IntegrationTests.dll /Logger:trx` without SQL environment | 0; 8 passed, 8 SQL tests skipped as expected |
| `dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive` | 0; no vulnerable packages reported across five projects |

Local resource controls for the final lightweight checks:
`$env:DOTNET_PROCESSOR_COUNT='2'` and `$env:DOTNET_GCHeapHardLimit='10000000'`
(hexadecimal 256 MiB per managed heap). Several initial parallel tool checks and
one testhost aborted due to host memory pressure (exit 1); build servers were
shut down and checks rerun serially. No CI/test thresholds were relaxed. An early
test also compared changing trace IDs in generic credential errors; it now compares
the title/status while preserving correlation IDs. A missing test configuration
namespace was fixed after a compiler failure. Final checks above are green.

Files changed: `backend/src/DigitalMenu.Api/Program.cs`,
`backend/src/DigitalMenu.Api/Auth/Authentication.cs`,
`backend/src/DigitalMenu.Api/Auth/DevelopmentBootstrap.cs`,
`backend/tests/DigitalMenu.IntegrationTests/AuthenticationTests.cs`,
`backend/.env.example`, this report, and `docs/04-API-CONTRACT.md`.
F01/F02 CI, frontend, design assets, existing migrations and package locks are unchanged.

CSRF implementation reference: [Microsoft's antiforgery documentation](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery).
