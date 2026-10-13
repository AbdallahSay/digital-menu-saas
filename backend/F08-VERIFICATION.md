# F08 — Secure media (Issue #12)

F07 PR #39 was explicitly authorized and merged after exact reviewed head
`00738ee3106f570e013765da4a9b340222631977`, green CI, mergeability and no blocking
threads were verified. Main merge: `2f944501529c7b87c599513be82cc87fe549870d`.
Ancestor verified; **post-merge** [SQL (68/68)](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38305321683)
and [foundation](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/38305321673)
passed before creating `feat/F08-secure-media`. No unrelated merge or bypass.

## Changes and decisions

- `src/DigitalMenu.Api/Media/MediaEndpoints.cs`: owner upload/delete, strict
  multipart allowlist, safe response DTO, scope and relationship checks, rate
  limits, storage coordination and cleanup. No privileged DbContext in handlers.
- `Media/ImageNormalizer.cs`: JPEG/PNG/WebP signatures/container completeness,
  CRC for PNG, full codec success, static frames only, pre-raster dimension/pixel
  limits, EXIF orientation and fresh metadata-free WebP at 1600/480 max side.
- `Media/ImageStorage.cs`: injectable storage boundary, unavailable default,
  private opt-in local adapter, canonical random tenant keys, immutable bundles,
  link/path rejection and durable deletion markers/retry.
- `Media/UploadReadStream.cs`: total bytes enforced including chunked bodies.
- `Media/MediaProblemHandler.cs`: generic 400/413/415/429/503 ProblemDetails,
  restrictive cache/security headers, no filenames/paths or underlying errors.
- `src/DigitalMenu.Api/Program.cs`: registration, media-specific body cap and
  mandatory CSRF header before multipart parsing; JSON limits retained.
- API csproj/API + test lock files: SkiaSharp and Linux native assets pinned.
- `src/DigitalMenu.Infrastructure/Tenancy/TenantDataSession.cs`: includes image
  metadata mutations in atomic menu-version update, once per transaction.
- `tests/.../MediaTests.cs`: 14 new tests (11 real SQL + 3 normalizer/storage tests).
- `tests/.../TenantSecurityTests.cs`: existing fixture accepts DI configuration
  for storage failure injection; existing assertions/tests remain unchanged.
- `../docs/04-API-CONTRACT.md`: exact F08 API and cleanup/hosting contract.
- This report. No migration, frontend, public serving route, cloud provisioning,
  production credentials, deployment or F08 merge.

SkiaSharp **4.153.1**, latest stable published on the checked NuGet feed, is on
the [maintained stable line](https://mono.github.io/SkiaSharp/docs/releases/index.html).
It provides cross-platform JPEG/PNG/WebP codecs, unlike Windows-only GDI; no
paid service is needed. All four new SkiaSharp/native packages declare **MIT**
in their installed nuspecs (checked), with [upstream license](https://github.com/mono/SkiaSharp/blob/main/LICENSE.md).
Linux NoDependencies supports the SQL/foundation Linux runners. Native engine
and bundled third-party notices require ongoing release review; no perpetual
security/maintenance guarantee or complete third-party license audit claimed.

## Security and consistency review

TenantOwner and named Identity cookie, live membership and HTTPS remain required.
Mutations preserve identity-bound CSRF; media requires header before any form
read. Ownership lookup happens before parsing/storage. Both item/image must be
owned, live item and correct relationship; foreign/missing/wrong-parent errors
remain identical 404. Server keys use tenant GUID + random GUID (not filename).
No remote URL fetch, user path, static directory mapping, original file retention,
public image URL or storage key in responses. Model tenant FKs/immutable keys and
F05 Serializable reauthorization/redacted audit remain intact.

Upload limits: file 5 MiB; total multipart 5 MiB +64 KiB; dimension <=6000 per
axis, <=12M pixels, no animated frames. Only matching exact declared MIME,
signature/codec/container and successful complete raster decode accepted. Two
concurrent upload requests/process before form buffering, two decoders, no queue;
10 upload attempts/min/account. Other routes are unaffected by global limiter.
Kestrel limit plus counted stream enforce bodies; item JSON remains 32 KiB.

Blobs written before SQL metadata. Item timestamp/rowversion serializes gallery
changes and item edits/deletion. Successful metadata, item version, restaurant
menu version/timestamp and audit commit atomically. Failed commit only deletes
blobs after an authorized SQL read proves metadata absent. Unknown commit outcome
or lost authorization preserves the private object for reconciliation. Delete
commits SQL first, then physical cleanup; cleanup failure does not undo accepted
deletion or disclose details (204 plus constant warning). Local deletion intent
survives ordinary removal failures and is retried on later uploads, up to 100
marked bundles/pass. Never sweep unmarked files that might have committed metadata.
This is not a cross-resource transaction or crash-proof recovery service.

## Executed evidence

Windows, SDK 10.0.400/runtime 10.0.11, real SQL Server LocalDB DigitalMenuF02;
every fixture owns a unique disposable database. Full final run:

- Targeted: **14 passed, 0 failed/skipped**, exit 0, 17 seconds.
- Backend regression: **82 passed (68 prior +14 F08), 0 failed/skipped**,
  exit 0, 26 seconds. Includes F01–F07 and SQL integrity regressions.
- Locked restore/Release build: exit 0; final build zero warnings/errors.
- Format verification, migration consistency and diff check: exit 0;
  EF reports no pending model change. No schema or production migration.
- NuGet vulnerability scan: exit 0, no vulnerable packages reported in five
  projects using current sources. New package nuspec license expressions checked.
- TRX: `tests/DigitalMenu.IntegrationTests/TestResults/f08-targeted.trx` and
  `f08-full.trx` (ignored). F08 CI links/results are attached to the Draft PR.

Coverage: valid three formats and variants; EXIF orientation/metadata removal;
MIME spoof/SVG/invalid signature/CRC/truncated container/incomplete JPEG;
oversize/pixel bombs, file/total limits and valid >32 KiB multipart; local real
files plus SQL deletion; tenant A/B, foreign/missing/deleted item, foreign/missing
image, same-tenant wrong parent; unknown fields/remote URL rejection; CSRF, rate,
anonymous/platform/suspended/expired denial; concurrent same-item and A/B uploads;
item change before commit, metadata/audit/version rollback; store/removal failures,
durable cleanup retry, traversal and immutable-key protection.

Initial runs diagnosed an empty-cookie test helper and legitimate Serializable
cross-tenant deadlock: tests now assert the documented 409 and retry once before
checking independent storage/version/audit. No security control/test disabled.
The first ordinary C-drive build ran out of space copying native symbols.
Generated artifacts were preserved on E, and final build/tests used E artifacts,
temp and dedicated SQL data directories. No unrelated files were deleted.

Native normalization smoke: Release console harness outside repo, deterministic
1280x720 RGB noise, one warmup plus three measured runs per format, excludes SQL,
HTTP and input encoding. Median/max milliseconds: JPEG 180.7/182.9, PNG 210.0/210.9,
WebP 220.7/221.7. Main bytes: 588390/632066/586744; thumbnail bytes:
67766/75148/67660 respectively. Same host; not production latency/capacity evidence.
An initial 1800x900 noisy PNG exceeded 5 MiB and was correctly rejected; harness
inputs were reduced, rather than changing application limits. Full native memory
and intended-host load profiling remain NOT RUN.

## Local setup and reproducible checks

Local adapter is **Development-only**, unavailable by default and always in
Production/Staging. Configure an absolute private directory outside app/code
directories using `Media__LocalRoot`, for example `E:\DigitalMenuPrivateMedia`.
Only trusted service-account/OS users may access it; never serve it as static
content. No filesystem/cloud permission changes were performed by this task.

```powershell
$env:TEMP='E:\Codex-F08-Artifacts\Temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:\Codex-F08-Artifacts\Sql'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode --artifacts-path E:/Codex-F08-Artifacts/build
dotnet build backend/DigitalMenu.slnx -c Release --no-restore --artifacts-path E:/Codex-F08-Artifacts/build -m:1
dotnet test backend/DigitalMenu.slnx -c Release --no-build --artifacts-path E:/Codex-F08-Artifacts/build --logger 'trx;LogFileName=f08-full.trx'
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
git diff --check
```

E paths are optional scratch locations; standard commands work with sufficient
space. Encrypt=false is restricted to the disposable loopback test SQL instance.

## Remaining gates

Production storage adapter/public media serving, private-to-public URL projection,
durable metadata reconciliation on crash/ambiguous commit, cleanup retry without
new uploads, quotas/retention, trusted-OS ACL review, full native license/SBOM
review and intended-host CPU/memory/load profiling are **not delivered/NOT RUN**.
The local root trusts its OS owner; link checks do not protect against a malicious
OS administrator racing filesystem changes. Unmarked orphan files stay private
pending operator review. No distributed atomicity, upload latency/CWV guarantee
or production readiness claimed. Real public cache consumption remains F09/S03.
Private backend increment has no public SEO/RTL UI changes. Human review required.

## تسليم عربي

دُمج F07 بإذن صريح وبعد CI ناجح، ثم أُضيف رفع وحذف الصور في F08. الصور
تُفحص كاملة وتُحوّل إلى WebP دون metadata، بمفاتيح عشوائية تخص المطعم وحدود
حجم/pixels/طلبات. SQL metadata ونسخة المنيو وaudit ذرية؛ الملفات المشكوك
في نتيجة معاملتها تبقى خاصة بدل حذف صورة قد تكون محفوظة. نجح 82 اختبارًا؛
أوامر التحقق أعلاه. التخزين محلي للتطوير، والإنتاج/reconciliation يحتاجان
مراجعة مستقلة. F08 يبقى Draft دون دمج أو نشر.
