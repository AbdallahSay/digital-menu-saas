# F05 — Tenant Context and Adversarial Cross-Tenant Guards

تنفيذ Issue #9 محليًا فقط، على `feat/F05-tenant-security` من أحدث main
`2eb9f97` (دمج F04 عبر PR #32). لم يُنفذ F06/F07/F08 ولم تُضف أي endpoints
للاختبار، ولا نشر أو دمج تلقائي. نسخة العمل: `E:\Codex-F04-Verification`.

## التغيير والسبب

- `CookieAuthenticatedActor`: يستخدم named Identity authentication result،
  لا HttpContext.User مزورة أو headers أو body. يتحقق من HTTPS وexpiry
  وclaim واحدة لهوية المستخدم وsecurity stamp.
- `TenantContext`: يقرأ الحساب والـstamp والعضويات من SQL. يقبل عضوية Owner
  نشطة واحدة فقط في مطعم Active؛ يرفض الحساب الموقوف/بدون password/MFA
  والسياق المبهم. لا امتياز tenant ضمني لـPlatformAdmin، ولا tenant selector.
- `TenantOwner` و`TenantRestaurantRequirement`: بنية authorization للخدمات
  التالية. لا تغير سياسة F03 Owner العامة أو PlatformAdmin الحالية.
- `ITenantDataSession`: reads محدودة/projections وowned lookup وstaging/commit،
  دون IQueryable أو DbContext أو bulk SQL. سياق خاص مرفوض افتراضيًا ثم مربوط
  بscope ثابت. global filters إضافية لكل الجداول الخمسة؛ explicit tenant
  predicates وcanonical ownership checks هي الحماية الأساسية.
- Commit يعيد فحص الصلاحية داخل transaction Serializable، ويمنع key/tenant
  substitution حتى مع detached payload. يتحقق من CategoryId/ItemId وmedia
  namespace وSettings، ويقارن حقول المطعم المميزة وObjectKey مع SQL، لا
  snapshots أرسلها العميل. رفض العملية يمسح التعديلات المعلقة.
- HTTP mapper جاهز: 401/403 للسياق، 404 عام للموارد الأجنبية/المفقودة، 412
  للـrowversion، 409 للـdeadlock، و400 للتحقق. لا IDs أو SQL/exception detail
  في ProblemDetails، مع no-store/security headers حتى بعد exception handling.
- auditing مختصر: TenantAccessDenied (لا foreign IDs/بيانات)، وTenantWriteCommitted
  ذري مع الكتابة. Actor/scope ToString لا يُظهر IDs أو stamp. فشل audit لا يفتح
  الصلاحية. لا إدخال لتوكن/password/header/body/أسماء موارد في audit أو logging.

`MenuDbContext` الأصلي يبقى مميزًا للـIdentity/Platform/authorization؛ null scope
يحافظ على هذه المسارات. لا يجوز حقنه في owner/catalog/media handlers الجديدة.
الفحص العالمي الوحيد داخل session هو scalar Any لcollision مفتاح جديد، دون
تحميل بيانات foreign؛ لا IgnoreQueryFilters أو raw SQL في owner interface.
Source review مطلوب لمنع أي feature مستقبلية من تجاوز هذه الحدود.

## أثر schema والحزم

لا migrations جديدة ولا packages أو lock changes. Query filters لا تضيف schema.
فحص EF أثبت عدم وجود pending model changes. قيود F02 وFKs المركبة وtriggers
والـrowversion محفوظة، مع إعادة تشغيل SQL integrity وF03/F04 regression.

## اختبارات فعلية

البيئة: Windows، .NET SDK 10.0.400/runtime 10.0.11، LocalDB DigitalMenuF02،
قواعد بأسماء عشوائية/مسارات E، ونفس جهاز العميل والخادم.

- اختبارات F05: 13 (12 على SQL Server + اختبار mapper)، ضمن المجموعة كاملة.
- التشغيل النهائي مع precondition/canonical-image assertions: **47 passed،
  0 failed، 0 skipped**، exit 0؛ منها 13 اختبارًا لـF05 و34 regression.
- locked restore وRelease build (صفر warnings/errors) وformat verification:
  exit 0. SQL integrity ضمن التشغيل الكامل؛ EF no-pending-model-changes: exit 0.
  Dependency advisories ونتائج CI وروابطها النهائية تُرفق بوصف Draft PR.
- TRX: `backend/tests/DigitalMenu.IntegrationTests/TestResults/f05-full.trx`.

المصفوفة المنفذة:

| التهديد | الإثبات |
|---|---|
| anonymous أو claims مصنوعة دون cookie / cookie مزورة | رفض authentication؛ لا scope |
| X-Tenant-Id/X-Restaurant-Id/query/role/tenant claims مزورة | النطاق يبقى A من cookie وعضوية SQL |
| PlatformAdmin دون عضوية Owner | لا tenant bypass |
| A يقرأ/يعدل/يحذف Restaurant/Category/Item/Image/Settings لـB | empty list أو نفس 404 كالمفقود؛ B بلا تغيير |
| detached B ID مع RestaurantId=A / collision ID / new RestaurantId=B | رفض قبل الكتابة |
| A item مع B CategoryId، A image مع B ItemId/ObjectKey | 404؛ لا إنشاء علاقة |
| Settings لـA مع B media / encoded traversal | رفض دون تغيير |
| Image ObjectKey جديدة عبر detached own ID | رفض مقارنة بـcanonical SQL |
| محاولات كتابة RestaurantUser/ApplicationUser | whitelist يرفضها |
| تعديل ID/RestaurantId/parent/media في tracked batch | رفض وتراجع لكل تغييرات batch |
| تعديل Status/Slug/PublicCode عبر owner detached snapshot | لا تجاوز لحدود Platform |
| عضويتان نشطتان، inactive/suspended/revoked/locked/expired أثناء edit معلقة | Commit مرفوض؛ البيانات الأصلية ثابتة |
| تبديل العضوية من A إلى B أثناء session | لا تغيير scope أو حفظ تعديلات سابقة |
| 12 قراءة متزامنة A/B، وcommit متزامن A/B | لا خلط entities/context/audit |
| stale SQL snapshot / client expected rowversion | 412 للذات؛ foreign ID يبقى 404 |
| writes/parent/media references صحيحة لـA | نجاح ذري، B دون تغيير |
| audit ومحاولة بحث foreign بعد تعديل معلق | لا foreign data بالـaudit، ولا commit لتعديل قديم بعد الرفض |

## كيفية التحقق

```powershell
cd E:\Codex-F04-Verification
$env:TEMP='E:\Codex-F04-Temp'
$env:TMP=$env:TEMP
$env:DOTNET_PROCESSOR_COUNT='2'
$env:DOTNET_GCHeapHardLimit='10000000'
$env:F02_SQL_CONNECTION='Server=(localdb)\DigitalMenuF02;Integrated Security=true;Encrypt=false'
$env:F02_SQL_DATA_DIRECTORY='E:\Codex-F04-Sql'
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore -m:1
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet test backend/DigitalMenu.slnx -c Release --no-build --logger trx
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
```

Encrypt=false مخصص لـLocalDB/loopback الاختباري. كل fixture ينشئ قاعدة خاصة
ولا يستخدم InitialCatalog المرسل، ويزيل قاعدته فقط عند نهاية الاختبار.
Production connection/data ليست ضمن العمل.

## استعمال البنية في F06/F07/F08

Feature group: RequireAuthorization("TenantOwner")، constructor يأخذ
ITenantDataSession. DTOs مستقلة مع رفض unknown fields؛ لا RestaurantId/role/
claims/server timestamps أو IDs مولدة من العميل على create. لا إرجاع EF
entities أو Actor/TenantScope من endpoints. resource lookups تكون scoped
بالمفتاح؛ RestaurantId authorization لا يغني عنها.

مثال داخل handler/service (ليس endpoint موجودًا الآن):

```csharp
var category = await session.EditAsync<Category>(id, expectedRowVersion, ct);
category.NameAr = validatedName;
await session.CommitAsync(ct);
```

F06/F07 يجب أن يطبق soft-delete بدل استعمال primitive Delete للفئات/الأصناف،
وvalidation/ranges/locale/price/pagination/sort وcategory-linked-items conflict
وpublic menu version updates. Parent references في staging يجب أن تشير إلى
parents موجودة وغير soft-deleted؛ bulk parent+child creation ليست خدمة جاهزة.
F08 يجب أن يتحقق من stored metadata/content/file ownership والمفتاح المولد
على الخادم، وأن يطابق MenuItemId وImageId في nested paths قبل حذف/رفع ملف.
namespace لا يثبت وجود blob أو سلامة محتواه. لا storage أو file operation هنا.

## HTTP matrix المطلوبة عند تنفيذ APIs — NOT RUN الآن

1. F06: Owner A GET/list/PUT/DELETE/rename/publish Category B، missing/foreign
   IDs متطابقة في 404؛ POST بtenant/role/ID مزور يُرفض DTO ولا يبدّل scope.
2. F07: A GET/list/PUT/DELETE Item B؛ POST/PUT مع CategoryId=B أو deleted parent؛
   price/publish/availability/soft-delete تتغير فقط للذات؛ expected rowversion.
3. F08: upload/delete/read Image B أو Item B؛ route item A مع image B والعكس،
   وsame-tenant wrong parent؛ logo/cover foreign keys؛ لا file/object side effects.
4. Profile/settings: own/foreign references، preview/QR tenant scope، دون secrets.
5. لكل unsafe request: absent/invalid/identity-stale CSRF؛ anonymous/Owner/Platform
   role matrix؛ suspension/inactivation/ambiguity بين requests وداخل writes؛
   scope claims/header/query/body spoofing، cookies مزورة، parallel A/B operations.
6. Contract/raw response assertions: generic ProblemDetails/status/no-store، ولا
   IDs أو names/drafts/media/private contact لـB في أي response/log/audit.

## المخاطر والحدود والأداء

- لا claim بإتمام HTTP tenant matrix قبل وجود features؛ هذه الحدود اختُبرت
  مباشرةً مع genuine signed F03 cookies وSQL Server، دون fake production route.
- DI/code review يجب أن يمنع حقن MenuDbContext المميز أو raw SQL في owners.
  trusted server code يستطيع تجاوز أي wrapper إن تجاهل التعليمات؛ لا تسليم
  IQueryable أو mutable context في interface لتقليل هذا الخطر.
- كل قراءة لها authorization ثم query؛ in-flight read قد يكتمل أثناء revocation.
  العمليات الجديدة تعيد الفحص، والكتابات لها transaction/lock revalidation.
- Serializable وcanonical/association checks تضيف SQL/locks؛ row lists projected
  ومحدودة، لكن write batches تتحقق لكل entity. Profiling/load benchmark لواجهات
  F06–F08 مع بيانات واقعية: NOT RUN (غير موجودة). لا index/Redis/cache أضيف بلا قياس.
- Denial audit best effort؛ عند تعطل SQL يظل الرفض ويظهر warning عام فقط. يلزم
  retention/rate limits/monitoring قبل الإطلاق؛ هذا ليس مسار audit public.
- Full dependency license release gate وproduction/staging/CWV/real storage:
  NOT RUN؛ لا dependency جديدة أو نشر. SSR/public real-tenant lifecycle مؤجل F09.
- يلزم peer review بشري قبل الدمج؛ PR سيكون Draft وغير مدمج.

الملفات: `TenantAccess.cs`، `TenantAuthorization.cs`، `TenantContext.cs`،
`TenantDataSession.cs`، `MenuDbContext.cs`، `Program.cs`، `TenantSecurityTests.cs`،
هذا التقرير، وdocs/04 و06 و08 و10. identifiers/API terminology بقيت بالإنجليزية.
