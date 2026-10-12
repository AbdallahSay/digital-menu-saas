# F04 — تقرير التهيئة والتحقق المحلي

بتاريخ 2026-10-12، تم تنفيذ Issue #8 على `feat/F04-platform-provisioning`
انطلاقًا من `main` عند `06df775`، الذي يتضمن F03 من PR #31.
لم يُستخدم فرع F03 السابق المرتبط بـ PR #29. التنفيذ محلي/اختباري فقط.
نسخة العمل النهائية والتحقق: `E:\Codex-F04-Verification`، وفق طلب المستخدم
استخدام E بعد امتلاء C.

## ما تغيّر ولماذا

- نقاط Platform الخمس تستخدم سياسة PlatformAdmin الحالية. لا يُقبل دور أو
  PublicCode أو password ضمن طلب التهيئة. القائمة محدودة ومقسمة وتدعم البحث.
- إنشاء Identity user بدون password، ومطعم Active غير منشور، وعضوية Owner
  نشطة، وRestaurantSettings، وAuditEntry في transaction من نوع Serializable.
  تعارض slug/email/PublicCode أو deadlock يعيد 409، وفشل تسليم رمز الاختبار
  يعيد 503 ويتراجع عن جميع الكتابات. ليست هذه واجهة idempotency-key.
- PublicCode عشوائي تشفيريًا بطول 20 حرفًا؛ ثباته وتفرّده محميان بقيود F02.
- إعداد كلمة مرور المالك عبر رمز Identity صالح ساعة واحدة. المسار يتطلب
  HTTPS وCSRF ومحدد معدل F03. يُرفض الرمز المزور والمنتهي وإعادة الاستخدام
  المتزامنة. لا يسجل المستخدم تلقائيًا ولا يغيّر صلاحياته. كلمة المرور تُجزّأ
  باستخدام Identity ولا تُحفظ أو تُسجّل كنص صريح.
- تعديل الحالة والنشر يتطلب RowVersion. التعارض يعيد 412؛ التعديل والتدقيق
  وزيادة PublishedMenuVersion ذرية. نفس الحالة no-op بعد التحقق من الإصدار.
  Suspension يحتفظ بخيار النشر؛ F09 يجب أن يشترط Active وIsPublished معًا.
- جلسات F03 تعيد فحص العضوية وحالة المطعم والحساب. التعليق يمنع وصول المالك؛
  إعادة التنشيط تتطلب تسجيل دخول جديد ولا تعيد تنشيط عضوية أو تفك lockout.
- DTOs وProblemDetails محددة، دون owner email/ID أو رموز دعوة في الردود.
  الطلبات ذات JSON غير المقبول تعيد 400 أيضًا في Development.

## أثر قاعدة البيانات والاعتماديات

لا migrations جديدة ولا تغيير في schema أو lock files أو حزم إضافية.
أثبت `has-pending-model-changes` عدم وجود تغيير عن F02. لم تُطبق migrations
إلا على قواعد اختبار disposable جديدة، ولم تُلمس قواعد الإنتاج.

خيار `F02_SQL_DATA_DIRECTORY` خاص باختبارات LocalDB فقط، ويجعل كل fixture
ينشئ ملفات قاعدة مستقلة على قرص يحدده المستخدم. CI/Docker يبقى بلا هذا الخيار.

## نتائج فعلية

البيئة: Windows، SDK 10.0.400 / runtime 10.0.11، LocalDB DigitalMenuF02،
Node 24.19.0، npm 11.17.0، Chrome محلي، الاختبارات على نفس الجهاز.

| الفحص | النتيجة |
|---|---|
| `dotnet restore backend/DigitalMenu.slnx --locked-mode` | نجح، exit 0 |
| `dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore` | نجح، exit 0 |
| `dotnet test backend/DigitalMenu.slnx -c Release --no-restore --logger "trx;LogFileName=f04-final.trx" -m:1 -p:UseSharedCompilation=false` | 28 passed، 0 failed، 0 skipped، exit 0؛ يتضمن build وF02 integrity وF03 و11 اختبارًا لـF04 |
| `dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure` | لا تغييرات، exit 0 |
| `dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive` | لا advisories معلنة في المشاريع الخمسة، exit 0 |
| `npm ci --cache E:\Codex-F04-NpmCache` | نجح، 0 vulnerabilities، exit 0 |
| `npm run lint` / `npm test -- --watch=false` / `npm run build` | نجحت جميعًا، 2 unit tests، Angular production SSR build، exit 0 |
| `npm run test:html` | 6 passed، exit 0 |
| `npm run test:e2e` | 2 passed، JS disabled/enabled، Arabic RTL mobile، exit 0 |
| `npm run test:lighthouse` | 3 تشغيلات؛ Performance 95/97/96، SEO 100، Accessibility 100، exit 0 |
| Planning manifest assertions via Node | نجح، exit 0؛ Python غير متاح محليًا، CI يستخدم Python الأصلي |
| `git diff --check` | نجح، exit 0 |

أدلة محلية: `backend/tests/DigitalMenu.IntegrationTests/TestResults/f04-final.trx`،
و`frontend/.lighthouseci/summary.json` وتقارير HTML/JSON الثلاثة.
CI links تُضاف إلى Draft PR بعد تشغيل GitHub Actions على نفس commit.

اختبارات F04 تغطي: كل endpoint مع Owner/anonymous، رفض حقول التصعيد، CSRF
المفقود/المزور، استقلال مطعمين، duplicate slug وnormalized email، rollback حتى
لو احتفظ test sink برمز قبل فشله، طلبات provisioning متزامنة لنفس slug ونفس
email مع اختلاف الأحرف، single-use وexpiry للرمز، concurrent onboarding،
التعليق/التفعيل/النشر/التدقيق، no-op، stale/concurrent RowVersion، pagination
والتحقق و404. اختبارات F02 الحالية تختبر collision وimmutability لـPublicCode
وقيود العلاقات مباشرة على SQL Server، واختبارات F03 تختبر lockout/تعطيل الحساب
والعضوية والجلسات.

## الأداء والمراجعة الأمنية

Load smoke على TestServer + LocalDB: 20 GET متزامنًا، مطعمان مطابقان، pageSize=1:
p50=174.8ms، p95=189.5ms، max=189.7ms، بلا أخطاء. هذه عينة محلية صغيرة
وليست إثبات SLA للإنتاج. القائمة تستخدم count + bounded page من دون N+1؛
البحث substring وoffset قد يتطلبان profiling عند زيادة البيانات، دون إضافة
فهارس/Redis بلا قياس. لا تعديل في JavaScript العام؛ gzip لجميع browser JS
74,619 bytes. Lighthouse median LCP=2182.5ms، CLS=0، TBT=53ms.

المراجعة الذاتية: deny-by-default وPlatformAdmin محفوظان، CSRF قبل mutations،
HTTPS/no-store وbody cap=8KiB، allowlist للطلبات، معاملات ذرية، optimistic
concurrency، رمز مرتبط بالمستخدم وsecurity stamp، وعدم تسريب tokens/passwords
في الردود أو التدقيق أو logs الخاصة بالتطبيق. لا مسار public registration.
يلزم peer review بشري قبل الدمج؛ لم يُجرَ دمج أو نشر أو تغيير صلاحيات سحابية.

فشلت محاولات أولية ثم شُخّصت: xUnit analyzer/namespace، JSON handling في
Development، تكرار طلبات تجاوز rate limit، وdeadlock مغلف داخل EF exception.
أُصلحت دون تعطيل tests أو تخفيف الحماية. امتلاء C سبب فشل npm و17 اختبار SQL
عند CREATE DATABASE؛ نُقل التشغيل إلى E. ضغط الذاكرة وقفل DLL أثناء تشغيل
خادم الاختبار عولجا بإيقاف خوادم التشغيل وتقليل توازي build، ثم اجتاز التشغيل
النهائي كاملًا. رفضت مراجعة الأدوات حذف node_modules الناتج عن تثبيت C الفاشل؛
تُرك كما هو ولم تُحذف ملفات المستخدم لتجاوز المشكلة.

## NOT RUN والمتبقي

- Production/staging benchmarks وRUM وQR بأجهزة حقيقية: NOT RUN؛ لا تصريح نشر.
- اختبار sitemap/SSR lifecycle باستخدام المطاعم الحقيقية بعد التعليق/النشر:
  NOT RUN؛ F09/S01/S02 لم تنفذ بعد. فحوص SSR الحالية تخص fixture F01 فقط،
  ولا تعني أن مطعمًا تم provision له يظهر في القوائم العامة الآن.
- تدفق F05/F06 كاملًا من المتصفح: NOT RUN؛ هذه APIs والصفحات خارج النطاق.
- إرسال بريد حقيقي/production delivery: NOT RUN وممنوع في هذا increment.
  التطبيق العادي يرجع 503 في provisioning؛ tests تضبط test sink في الذاكرة.
  لا endpoint لاسترداد الرموز، ولا token في رد PlatformAdmin. قبل الإنتاج
  يلزم تصميم durable delivery/outbox وresend/revocation/retry وحماية مفاتيح
  Data Protection وorigin موثوق وصفحة onboarding. لا تستبدل sink ببريد داخل
  transaction الحالية. مرجع:
  [Microsoft Identity tokens](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/accconfirm?view=aspnetcore-10.0).
- Dependency licensing release gate الكامل: NOT RUN؛ لا اعتمادية جديدة،
  وتظل مراجعة تراخيص الاعتماديات الموجودة ضمن release gate.
- F05 يحتاج tenant context مستمدًا من membership على الخادم وauthorization
  لكل resource مع اختبارات cross-tenant عبر categories/items/images/settings.
  سياسة Owner العالمية الحالية وحدها لا تحدد tenant ولا تجيز موردًا بالـID.

## إعادة التحقق محليًا

من `E:\Codex-F04-Verification`، مع LocalDB مخصص مثبت مسبقًا:

```powershell
$env:TEMP='E:\Codex-F04-Temp'
$env:TMP=$env:TEMP
$env:DOTNET_PROCESSOR_COUNT='2'
$env:DOTNET_GCHeapHardLimit='10000000'
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:\Codex-F04-Sql'
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger trx
dotnet tool restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
```

الخيار Encrypt=false هنا يخص LocalDB/loopback للاختبار فقط. لا production
credentials. لتشغيل frontend gates، اتبع أوامر وخوادم foundation workflow
الحالي مع `F01_LOCAL_ONLY=1`، ثم `npm run test:html` و`npm run test:e2e`
و`npm run test:lighthouse`. إعداد Chrome المحلي عند الحاجة:
`CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`.

الملفات المعدلة: `backend/src/DigitalMenu.Api/Program.cs`،
`backend/src/DigitalMenu.Api/Platform/Provisioning.cs`،
`backend/tests/DigitalMenu.IntegrationTests/ProvisioningTests.cs`،
`backend/tests/DigitalMenu.IntegrationTests/AuthenticationTests.cs`،
`backend/tests/DigitalMenu.IntegrationTests/PersistenceTests.cs`،
`backend/tests/DigitalMenu.IntegrationTests/SqlTestStorage.cs`،
`backend/.env.example`، هذا التقرير، و`docs/04-API-CONTRACT.md`.
