# M02 static delivery review fix

Review: [5503097477](https://github.com/AbdallahSay/digital-menu-saas/pull/40#pullrequestreview-5503097477).
The previous Foundation run 38393155024 genuinely disclosed an outside-root canary
through express.static after the gzip containment check fell through. Its earlier
15/15 local security claim must not be used as evidence of a fix.

## Change and security boundary

- Replaced gzip/files/fonts static middleware with one secureAssets snapshot.
  Only canonical browser-root regular files with approved MIME types enter it;
  file/directory symlinks are excluded, a symlink root is rejected, and hard-linked
  files fail initialization. There is no express.static or request-time file open.
- On Linux (required CI/hosting gate), O_NOFOLLOW plus directory descriptors and
  /proc/self/fd anchor initialization against ancestor replacement. File identity,
  canonical location and modification checks fail closed before serving bytes.
  Windows initialization requires a trusted, immutable build directory; Node does
  not provide the same Linux directory descriptor semantics there. Runtime swaps
  cannot change snapshot contents on either platform. OS administrators and build
  pipeline writers are trusted; this is not sandboxing a hostile OS/build process.
- Assets are immutable for the process lifetime. A file swapped after startup
  still serves its original safe snapshot; newly introduced assets/links are 404.
  Rebuild/restart to refresh assets. 8 MiB/file and 32 MiB total raw snapshot caps
  bound memory; gzip variants add memory. Current browser build is about 0.56 MB.
- GET/HEAD share MIME, encoding negotiation, Content-Length, Vary and immutable
  hashed-JS/CSS/font headers. Unsafe/malformed/traversal/unknown asset paths end
  with 404, never fall through. SSR extensionless routes preserve their pipeline.
- Angular route extraction has no physical browser directory. The exported handler
  defers snapshot initialization until its first asset request; directly launched
  shipped server initializes before listening. Neither uses an unsafe fallback.
- No backend/auth/storage/schema changes beyond merging current main 863ebb7
  (including merged F09) into the existing branch, without rebase/force push.

## Tests and actual local results

Node 24.19.0 / npm 11.17.0 / Windows, production Angular build:

- npm run lint: PASS, exit 0.
- npm run test / npm test -- --watch=false: six requested runs PASS, 5/5 each;
  repeated once after the final encoding/root guard change, also PASS.
- npm run build: PASS, one prerendered route. Initial attempt diagnosed build-time
  virtual root unavailability and fixed it; no security gate disabled.
- npm run test:design: PASS 8/8.
- npm run test:html: final PASS 6/6, aggregate browser JS 109607 gzip bytes. A rerun caught a missing noindex header on the new static 404 path; fixed without changing assertions.
- npm run test:lighthouse: PASS, performance 92/96/96, median 96 >= unchanged 90;
  accessibility/SEO/best-practices 100 each. Local lab, not production CWV.
- npm run test:security: local BLOCKED/exit 1 because Windows denies creating
  file symlinks (EPERM). Creation is required, never silently skipped. Required
  Foundation CI executes the full Linux security suite on the final pushed SHA.
- Playwright initial attempt: BLOCKED (missing pinned headless browser); installed
  the pinned browser outside the repo. Final rerun PASS 6/6, exit 0.
- Backend locked restore, Release build and format verification: PASS; zero warnings/errors.
- Full real SQL Server LocalDB regression: PASS 90/90, 0 failed, 0 skipped (93s).
  TRX: backend/tests/DigitalMenu.IntegrationTests/TestResults/m02-full.trx (ignored).

Security suite: raw node:http GET/HEAD x gzip/identity checks for raw/encoded/
double-encoded traversal, encoded slash/backslash, NUL and an outside-root symlink;
403/404 required and decoded canary absent. rawGet uses gunzipSync, and decoded
hashed JS/CSS bytes must equal actual build bytes. Source SSR/404 cases remain.
A separate initialization test covers pre-existing file/directory symlinks and
runtime file/directory rename swaps. Both run through npm run test:security in the
existing required Foundation workflow. Symlink creation failure FAILS the gate.

## Reproduce

```powershell
cd frontend
npm ci
npm run lint
npm test -- --watch=false
npm run build
$env:F01_LOCAL_ONLY='1'
# Separate terminal, then run the following against this exact shipped bundle:
node dist/digital-menu/server/server.mjs
npm run test:security
npm run test:html
npm run test:e2e
npm run test:lighthouse
```

Run security tests on Linux with Node 24.19.0 when Windows symlink privilege is
unavailable. Keep the existing .NET loopback API on 5080 for HTML/proxy tests.
Local SQL commands (run from repository root):

```powershell
$env:TEMP='E:/Codex-F08-Artifacts/Temp'; $env:TMP=$env:TEMP
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:/Codex-M02-Artifacts/Sql'
dotnet restore backend/DigitalMenu.slnx --locked-mode --artifacts-path E:/Codex-M02-Artifacts/build
dotnet build backend/DigitalMenu.slnx -c Release --no-restore --artifacts-path E:/Codex-M02-Artifacts/build -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --artifacts-path E:/Codex-M02-Artifacts/build --logger 'trx;LogFileName=m02-full.trx'
```

CI links and final SHA belong in existing Draft PR #40. No merge/deploy/production
operation is authorized. Figma matching limitations and all original design,
contrast and Lighthouse thresholds remain unchanged.

إصلاح M02 يمنع تقديم أي ملف خارج مجلد browser ويزيل مسار static الاحتياطي.
اختبارات الأمان تفك gzip وتفرض رفض مسارات التجاوز؛ يلزم نجاح CI على Linux
لإثبات اختبار symlink، مع بقاء PR Draft للمراجعة البشرية.
