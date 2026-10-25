# ملخص الإنجاز والمتبقي — 2026-10-24

## الحالة العامة

- الفرع الحالي: `arena/ae473de2-chat-ai` — نشط.
- آخر commit مرفوع: `5c074cb` (`feat(worker): harden access and request limits`). أُضيف بعده محليًا حاجز أمان لإعداد GitHub E2E؛ هذا التعديل وما يرتبط به من تحديثات لم يُضمّ بعد إلى commit أو push.
- **الحالة ليست جاهزية إنتاجية:** التنفيذ والتحقق المنجزان محليان؛ لم يُنشر Worker ولم تُجهز بيئة Cloudflare حية.

## ما اكتمل

### التنفيذ المحلي

- إضافة التحقق من Cloudflare Access JWT بتوقيع RS256، مع فحوصات issuer وaudience و`exp` و`nbf` و`sub`، ورفض الطلبات الخاصة عند فشل المصادقة أو غياب إعدادها.
- تقليل طلبات JWKS المتكررة عند `kid` غير معروف، مع فترة تبريد وتجميع للطلبات المتزامنة، بما يشمل حالات تعطل endpoint الشهادات.
- عزل سجل التشغيلات حسب هوية Access `sub`؛ التشغيلات الجديدة تحفظ `owner_id`، واستعلامات القوائم والتفاصيل مقيدة بالمالك. أضيفت migration `0002_run_ownership.sql`.
- فرض حد أقصى **64 KiB** على جسم الطلب المقروء فعليًا، حتى عند غياب `Content-Length` أو عدم مطابقته.
- إضافة عدادات D1 ذرية بنوافذ ثابتة لكل هوية: **10 تشغيلات/دقيقة، 100 تشغيل/يوم، و120 قراءة/دقيقة**، مع استجابة `429` و`Retry-After`. أضيفت migration `0003_request_limits.sql`.
- إخفاء تفاصيل أخطاء D1 والتنفيذ برسالة `request failed` ومعرّف طلب، وتصنيف أخطاء الإدخال المعروفة باستخدام نوع خطأ صريح.
- إضافة دعم CORS للاعتمادات مع `Vary: Origin` و`Cache-Control: private, no-store`، وضبط Console لإرسال credentials.

### الاختبارات والتوثيق

- إضافة اختبارات Worker وAccess وواجهات Console ونقل GitHub؛ تتضمن اختبارات لحد الجسم الفعلي، عزل الملكية، حدود المعدل، أخطاء داخلية لا تكشف التفاصيل، وتقييد تحديث JWKS.
- إضافة حاجز واختبارات محلية لمدخلات GitHub E2E، وحذف defaults من workflow، وتقييد `GITHUB_TOKEN` إلى القراءة، وإضافة مطابقة دقيقة مع secret `CELIA_E2E_ALLOWED_REPOSITORY`، وحصر workflow في `main` وEnvironment `github-e2e`. يجب ضبط required reviewers وbranch restriction وenvironment secrets حيًا قبل التشغيل.
- إضافة أوامر CLI للقراءة فقط من Issues ضمن repositories allowlist: `celia github issues <owner/repo> [open|closed|all]` و`celia github issue <owner/repo> <number>`؛ تتطلب `GH_TOKEN` أو `GITHUB_TOKEN` و`CELIA_GITHUB_ALLOWED_REPOSITORIES`، ولا تُمرر نص Issue إلى Agent.
- إضافة حد response (1 MiB)، timeout (15s)، وretry محدود لـGET فقط في GitHub transport؛ تثبيت Actions إلى SHAs وإعداد Dependabot لـnpm وGitHub Actions.
- إعداد تقرير مراجعة أمني وتقرير تغطية، ودليل Access، ودليل Staging وقائمة تحقق وخطة تنفيذ بمراحل موافقة.
- تحديث الرسم المعماري ليصرّح بأن وجود المسار في الشيفرة لا يثبت وجود نشر حي.

## نتائج التحقق المحلي

- أحدث تشغيل كامل بعد إصلاح parser CLI وتحسين حراسة Real E2E: **361 ناجحًا، 0 فاشل، واختباران شرطيان متخطّيان** ضمن ملف GitHub E2E؛ لم يحدث اتصال حي بـGitHub. typecheck وYAML parse و`git diff --check` ناجحة.
- آخر تقرير تغطية محفوظ (قبل إضافات GitHub Issues الحالية): **73.06% statements/lines، 82.86% branches، 81.44% functions**؛ لا يمثل قياسًا جديدًا لهذه الإضافات.
- اجتاز typecheck لجميع حزم workspace باستخدام `corepack pnpm -r run typecheck`.
- اجتاز بناء Worker الجاف عبر Wrangler وبناء Console.
- طُبقت migrations `0001` و`0002` و`0003` على D1 المحلية، واختُبر SQL العداد محليًا. لم يُستخدم `--remote`.
- اجتاز `git diff --check` والتحقق من الروابط النسبية للوثائق.

## ما لم يكتمل

- **Cloudflare Staging:** لم تُنشأ موارد Staging، ولا يوجد إعداد `env.staging` مكتمل في `apps/worker/wrangler.toml`.
- **Access حي:** لم يُنشأ أو يُضبط تطبيق Cloudflare Access فعلي، ولم تُختبر جلسة/سياسات/issuer/audience على Worker منشور.
- **D1 بعيد:** لم تُطبق migrations على قاعدة بعيدة، ولم يُتحقق من وجود قاعدة Staging مستقلة أو بياناتها.
- **حماية Cloudflare edge:** لم تُضبط قواعد rate limiting في Cloudflare؛ الحدود الحالية منفذة على D1 لكل هوية موثقة فقط.
- **اختبار runtime سحابي:** لم يُختبر حد stream أو CORS أو السجلات على Cloudflare runtime منشور.
- **GitHub E2E حقيقي:** الاختبار ما زال متخطّى ولم يُشغّل. أزيلت defaults من workflow، وأضيفت مطابقة target مع secret `CELIA_E2E_ALLOWED_REPOSITORY`؛ يلزم ضبطه مع `E2E_GH_TOKEN` محدود الصلاحية في مستودع اختبار مخصص وموافقة قبل التشغيل.
- **تكامل Worker مع GitHub:** `POST /run` ما زال يستدعي `createLocalSmokeRunner` ولا يشغّل GitHub plugin؛ نجاحه لا يثبت تكامل GitHub.
- **Production:** لم يُنشر شيء ولم يُتخذ قرار انتقال إلى Production؛ يلزم قرار ومراجعة مستقلان بعد Staging.

## خطة إكمال ما تبقى

هذه خطة تنفيذ مرحلية، وليست إذنًا بتنفيذ الإجراءات السحابية. لا تُنشأ موارد ولا تُطبق migrations بعيدة ولا يُنشر Worker/Console ولا يُشغّل GitHub E2E حي إلا بعد موافقة صريحة على البوابة الخاصة بكل خطوة.

### المرحلة 0 — حسم النطاق والقرارات (لا تغييرات سحابية)

1. مراجعة [`deployment/STAGING_CHECKLIST_AND_PLAN.md`](deployment/STAGING_CHECKLIST_AND_PLAN.md) و[`deployment/STAGING_RUNBOOK.md`](deployment/STAGING_RUNBOOK.md).
2. اعتماد هدف Staging: التحقق من Worker/Console smoke والأمن أولًا؛ إبقاء GitHub E2E الحقيقي مسارًا منفصلًا.
3. تعيين المالك والمراجعين، والـhostnames الثابتة، مستخدمي Access المسموحين، سقف التجربة، وسياسة الاحتفاظ بسجلات التشغيل وعدادات D1.
4. اتخاذ قرار مستقل عمّا إذا كان مطلوبًا ربط GitHub plugin بـ`POST /run`. هذا ليس ضمن اختبار Staging smoke الحالي، ويحتاج تصميم صلاحيات وcredential isolation ومراجعة أمنية قبل البرمجة.

**بوابة الإيقاف:** إذا لم تُحسم أسماء الموارد أو الملكية أو حدود التكلفة والبيانات، لا تنتقل للموارد السحابية.

### المرحلة 1 — تجهيز محلي قابل للمراجعة

1. بعد اعتماد قرارات المرحلة 0، أضف إعداد `env.staging` إلى Wrangler مع قيم placeholders/غير سرية فقط، وربط D1 باسم Staging؛ لا تضف database ID إنتاج أو أسرارًا إلى المستودع.
2. أضيف حاجز CLI واختبارات تمنع التشغيل عند غياب `CELIA_E2E_OWNER` و`CELIA_E2E_REPO`، وحذفت defaults من workflow وأضيفت مطابقة الهدف مع `CELIA_E2E_ALLOWED_REPOSITORY`. **المتبقي:** إعداد الـsecrets في GitHub وتشغيل الاختبار الحقيقي على مستودع مخصص بعد الموافقة.
3. اتفق على احتفاظ السجلات والعدادات وعلى سجلات تشغيل منقحة تربط `request_id` دون تسجيل JWT أو cookies أو محتوى سري.
4. شغّل الاختبارات وtypecheck وbuild وWrangler dry-run بعد إعداد staging، وراجع diff يدويًا. الـdry-run محلي ولا يثبت النشر أو إعدادات Access الحية.

**مخرج المرحلة:** تغييرات محلية قابلة للمراجعة، لا تنشئ موارد ولا تتصل بقاعدة بعيدة.

### المرحلة 2 — إنشاء العزل والهوية والحافة (موافقة G0/G1/G2)

1. إنشاء Worker وD1 وConsole preview منفصلة في حساب Cloudflare المعتمد؛ تسجيل أسماء وIDs Staging داخليًا والتحقق مرتين أنها ليست Production.
2. تعطيل أي hostname/route بديل يتجاوز Access، وضبط تطبيق Access وسياسة مستخدمين محددة و`ACCESS_TEAM_DOMAIN` و`ACCESS_AUD` وorigin Console المطابق.
3. إعداد حماية edge coarse-grained لمسارات `/run` والقراءة وفق إمكانات الحساب وخطة Cloudflare، دون اعتبارها بديلًا لعداد D1 per-subject.
4. تنفيذ dry-run ومراجعة bindings/vars/hostnames قبل أي أمر remote. إذا ظهر أي مورد إنتاجي أو تعذر تأكيد العزل، توقف.

**مخرج المرحلة:** إعداد Staging معزول ومراجع؛ لا migrations أو نشر حتى موافقة مستقلة على المرحلة التالية.

### المرحلة 3 — D1 migrations (موافقة G3 منفصلة)

1. التحقق من account ID وdatabase name/ID وحالة القاعدة. الأفضل قاعدة جديدة وفارغة؛ أي بيانات قديمة تتطلب backup وخطة مراجعة لأن صفوف ما قبل `0002` تبقى بلا مالك وغير مرئية.
2. بعد التحقق والموافقة فقط، تطبيق `0001_runs.sql` و`0002_run_ownership.sql` و`0003_request_limits.sql` على D1 Staging المحددة، والتحقق من migration history والجداول والفهارس.
3. التوقف عند أي اختلاف في ID أو ترتيب migration؛ لا تُسقط جداول ولا تنفذ rollback يدويًا.

### المرحلة 4 — نشر Staging والتحقق (موافقة نشر مستقلة)

1. نشر Worker Staging ثم Console Staging كلٌ على حدة وبـAPI base URL الخاص بـStaging.
2. تنفيذ مصفوفة التحقق في runbook: رفض anonymous/الـJWT غير الصحيح، مستخدمان مع اختبار عزل الملكية، CORS/credentials وno-store، حد body الفعلي، `429` و`Retry-After`، ومراجعة السجلات المنقحة.
3. اختبار حدود المعدل بهوية Staging مخصصة؛ لا تُنفذ 101 محاولة لاختبار الحصة اليومية ولا fault injection حي إلا بموافقة وخطة صريحة.
4. توثيق إصدار Worker ونتائج الاختبارات وmigration versions. عند فشل المصادقة أو العزل أو ظهور تسريب، أوقف التجربة وأعد Worker إلى نسخة متوافقة؛ اترك migrations الإضافية كما هي ولا تحذف البيانات تلقائيًا.

**معيار القبول:** كل الاختبارات المتفق عليها ناجحة أو لها استثناء موثق ومقبول، ولا يوجد مسار غير محمي أو اتصال ببيانات Production.

### المسار المنفصل — GitHub E2E الحقيقي

1. اختيار مستودع اختبار منفصل عن الإنتاج ومراجعة صلاحياته؛ إنشاء token محدود للمستودع، وعدم وضعه في Worker أو Console.
2. ضبط المالك والمستودع صراحةً، `CELIA_E2E_REAL=1`، والـtoken في secret store محمي، ومجلد التقرير خارج Git.
3. بعد موافقة صريحة على آثار الاختبار، تشغيل اختبار CLI وحده والتحقق من PR والـcommit وchain evidence ثم تنظيف branch/PR حسب السياسة.
4. تسجيل النتيجة على أنها **إثبات CLI GitHub adapter فقط**، لا إثبات تكامل Worker `/run`.

### المسار الاختياري — توصيل GitHub إلى Worker

إذا تقرر لاحقًا أن `/run` يجب أن ينفذ GitHub فعلًا، يبدأ ذلك كتغيير نطاق مستقل: تصميم identity-to-repository authorization، تخزين token عبر Vault مع أقل صلاحيات، منع تمرير token من المتصفح، مراجعة موافقات side effects/idempotency/audit، اختبارات تكامل مع fake GitHub ثم مستودع sandbox. لا توصل plugin ولا تنشر هذا المسار قبل مراجعة أمنية وموافقة منفصلتين.

### Production

لا يبدأ تلقائيًا بعد نجاح Staging. يتطلب خطة جديدة، موارد وD1 وAccess/Secrets منفصلة، مراجعة backup/restore وretention وedge limits وobservability، وموافقة نشر Production صريحة.

**الوضع الحالي بعد إعداد الخطة:** لم يُنفذ أي إجراء سحابي أو GitHub حي؛ هذه الخطوات تحدد ترتيب العمل وبوابات الموافقة فقط.
