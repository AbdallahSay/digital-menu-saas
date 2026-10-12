# F04 — تشغيل onboarding محليًا خارج integration tests

هذا تعديل usability لـPR #32، محلي فقط. لا إرسال بريد حقيقي ولا نشر.
الوضع الافتراضي يبقى `UnconfiguredOwnerOnboardingDelivery` و503 دون كتابة.
تسجيل `DevelopmentPipeDelivery` يحتاج `ASPNETCORE_ENVIRONMENT=Development`
و`DevelopmentOnboarding__Enabled=true` معًا. Production وStaging يتجاهلان
التفعيل ويظلان بلا pipe؛ constructor نفسه يرفض العمل خارج Development.

## الآلية والحدود

الدعوة تدخل قائمة داخل الذاكرة، ولا تُفرج إلا بعد commit لجميع الكتابات.
Abort يلغيها. لا endpoint لاسترجاع token، ولا ملفات دعوة أو credentials.
الـpipe تسمح بحساب OS الحالي فقط؛ Windows ACL تستخدم User SID مباشرة،
وتمنع Network SID، فلا تسليم عبر SMB. على Unix يستخدم CurrentUserOnly.
أداة الاستقبال تستخدم اتصالًا محليًا بهذا الحساب، وتطلب كلمة المرور عبر
SecureString، ثم تحولها داخل الذاكرة لإرسال JSON عبر HTTPS الموثوق.
لا تطبع الرمز/كلمة المرور، ولا تسجل response bodies أو provider exceptions.
لا certificate bypass. لا تستخدم tracing/transcripts/debugger dumps أثناء
إدخال أسرار التطوير، وشغّل الأدوات بحساب تطوير عادي دون elevation.

الثقة هنا في حساب OS نفسه ومديري الجهاز؛ ليست هذه خدمة لمضيف مشترك.
قائمة FIFO محدودة بـ16؛ امتلاؤها يعيد 503 ويتراجع عن التهيئة الجديدة.
المستهلك ينتظر بحد أقصى خمس دقائق. expiry الأصلي ساعة وsingle-use محفوظان.
الدعوات غير durable: restart أو disconnect أثناء التسليم قد يفقد الدعوة.
في هذه الحالة استخدم قاعدة/fixture محلية جديدة أو بريدًا اصطناعيًا جديدًا؛
لا يوجد resend/reset عام أو محاولة لتحويل هذه الآلية إلى production mail.

## خطوات تحقق كاملة قابلة للتكرار — Windows / PowerShell 7

من `E:\Codex-F04-Verification`، مع SDK 10 وLocalDB DigitalMenuF02 مثبتين:

```powershell
$env:TEMP='E:\Codex-F04-Temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$env:DOTNET_PROCESSOR_COUNT='2'
$env:DOTNET_GCHeapHardLimit='10000000'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1
dotnet dev-certs https --trust
sqllocaldb start DigitalMenuF02
./backend/tools/Verify-LocalProvisioning.ps1 -DataDirectory E:\Codex-F04-Sql -Port 5443
```

`Verify-LocalProvisioning.ps1` اختيار صريح للتجربة: ينشئ قاعدة جديدة باسم
`DigitalMenu_Dev_F04_Local_<random>` على LocalDB فقط، ويطبق F02، ويولّد
passwords عشوائية في الذاكرة، ويشغّل bootstrap ثم خادم HTTPS/pipe محليًا.
يسجل دخول admin، ويطلب CSRF جديدًا، وينشئ المطعم، ويرفض CSRF المفقود
وإسناد البريد نفسه لمطعم ثانٍ، ثم يستدعي المستهلك الذي يُكمل onboarding
وlogin و`/me` ويثبت رفض replay. لا يتجاوز TLS. يطبع PASS فقط واسم قاعدة
التطوير، ويوقف خادمه في finally. يحتفظ بالقاعدة الاصطناعية للفحص ولا يحذف
أي قاعدة موجودة؛ يمكن حذف هذه القاعدة المحددة يدويًا بعد المراجعة.
البروتوكول والبيانات تمر على Kestrel/HTTPS فعلي، وليس TestServer.

## استخدامه مع جلسة تطوير موجودة

تحتاج قاعدة Development مخصصة ومهاجرة وPlatformAdmin من bootstrap F03.
لا تضع credentials في command arguments أو ملفات repo أو HTTP collection
محفوظة. مثال تفعيل runtime (connection string من user-secrets/env خاص):

```powershell
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:DevelopmentOnboarding__Enabled='true'
$env:DevelopmentOnboarding__PipeName='DigitalMenu.Onboarding'
dotnet run --project backend/src/DigitalMenu.Api -c Release --no-build --no-launch-profile -- --urls https://localhost:5443
```

من عميلك المحلي، نفّذ تسلسل F03: GET `/api/v1/auth/csrf`، ثم login مع
`X-XSRF-TOKEN`، ثم csrf جديد بعد login، ثم POST
`/api/v1/platform/restaurants` بـname/slug/ownerEmail فقط. احتفظ بالـcookies
واستخدم HTTPS. لا تُرسل password أو role أو PublicCode في طلب التهيئة.
بعد 201، من terminal آخر بالحساب نفسه:

```powershell
./backend/tools/Complete-LocalOnboarding.ps1 -ApiOrigin https://localhost:5443 -PipeName DigitalMenu.Onboarding -VerifyReplay
```

الأداة تستقبل الدعوة داخليًا وتطلب password كـSecureString، ثم تستخدم
cookie jar مستقلة مجهولة، CSRF، onboarding، login و`/me`. لا تحتاج نسخ token.
نفّذ إنشاء واحدًا ثم استقبالًا واحدًا بالترتيب FIFO؛ استخدم pipe names مختلفة
لكل API محلية مستقلة. `PipeName` يجب أن يكون 1..80 حرفًا من ASCII letters،
digits، dot، hyphen. لإيقاف الوضع أزل Enabled أو اضبطه false وأعد تشغيل API.

## قاعدة البريد الحالية — لم تتغير

البريد الموجود بعد normalization لا يمكن إسناده لمطعم ثانٍ: 409، دون
مطعم/عضوية إضافية. يشمل المالك غير النشط أو الذي لم يُكمل onboarding بعد،
ومحاولات اختلاف الأحرف مثل OWNER@example.test. لا تُربط حسابات Identity
الموجودة عبر F04، رغم أن schema قابلة للتوسع. أي تغيير يحتاج موافقة بشرية.

## أدلة التحقق

التحقق النهائي المحلي: 34 اختبار backend ناجحًا، صفر failures أو skips،
مع locked restore وbuild وformat وSQL integrity وF03/F04. أُعيد التحقق
عبر Kestrel/HTTPS بعد إضافة ACL: كل الحالات التالية نجحت، exit 0:
admin login عبر HTTPS؛ provision=201؛ missing CSRF=400؛ same email second
restaurant=409؛ onboarding=204؛ owner login=204؛ me=200 Owner ومطعم واحد؛
replay=400. قاعدة التحقق النهائي المحفوظة:
`DigitalMenu_Dev_F04_Local_c17d89c358ad4f8a944df125b310d2d7`.
الأدلة: `backend/tests/DigitalMenu.IntegrationTests/TestResults/f04-local-full.trx`؛
نتائج CI وروابطها تُرفق بوصف PR #32 على commit المتابعة.
نجحت إعادة frontend lint وunit tests (2) وSSR build وsource HTML (6)
وbrowser tests (2). لا تغيير في frontend أو schema/lock files؛ فحص EF
أثبت عدم وجود pending model changes، ولا advisories معلنة في مشاريع backend.
نجحت Lighthouse بثلاث تشغيلات: Performance=97 وSEO/Accessibility=100.
أُضيفت اختبارات تفعيل/تعطيل ورفض Production/Staging حتى مع
flag=true، وACL Windows وcommit/abort وbounded queue وغياب الرموز/passwords
عن application logs الملتقطة، دون تغيير حزم/schema.

NOT RUN: اتصال من مستخدم OS آخر/جهاز SMB آخر (ACL محددة واختُبرت برمجيًا)،
production email، staging/deployment، real-tenant public SSR lifecycle قبل F09.
هذه حدود معروفة، ولا تُحذف حماية الحساب/CSRF أو تُغير قاعدة البريد لتجاوزها.

مرجع حماية IPC:
[Microsoft PipeOptions](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.pipeoptions).
