# تفعيل Cloudflare Access للـWorker

Worker صار يرفض كل المسارات الخاصة افتراضيًا ما عدا `GET /health` وطلبات CORS `OPTIONS`. لن تعمل مسارات API الخاصة حتى تضبط القيمتين وتضع hostname خلف تطبيق Cloudflare Access.

## إعداد مطلوب لكل بيئة

1. أنشئ Cloudflare Access self-hosted application على hostname الخاص بالـWorker/API.
2. أضف سياسة دخول للمستخدمين/خدمة الاختبار فقط، ولا تستخدم سياسة `Everyone`.
3. عيّن متغيري Worker التاليين في إعدادات **كل بيئة**، دون وضعهما في ملف tracked أو في واجهة المتصفح:
   - `ACCESS_TEAM_DOMAIN`: اسم نطاق فريق Access فقط، مثل `team-name.cloudflareaccess.com` (لا scheme ولا path).
   - `ACCESS_AUD`: Audience tag الخاص بتطبيق Access لهذا الـWorker.
4. تأكد أن التطبيق يمرر assertion في `Cf-Access-Jwt-Assertion`؛ يتحقق Worker من التوقيع RS256 عبر مفاتيح Cloudflare المنشورة، ومن issuer وaudience و`exp` و`nbf` و`sub`.
5. اجعل واجهة Pages ترسل cookies عبر `credentials: include`؛ يسمح Worker بالاعتمادات فقط مع origin القائمة الصريحة، ويضيف `Vary: Origin` و`Cache-Control: private, no-store`.
6. اضبط `VITE_API_BASE_URL` على hostname المحمي نفسه. لا تستخدم Workers.dev hostname مكشوفًا كمسار بديل خارج سياسة Access.

## فصل بيانات المستخدمين

- تسجل migration `0002_run_ownership.sql` عمود `owner_id` وتضيف فهارس بحسب المالك.
- كل تشغيل جديد يُحفظ مع `sub` الموثق، وتستعلم واجهات التشغيلات والمهام ضمن `owner_id` الحالي.
- الصفوف السابقة على migration تبقى `owner_id = NULL` ولا تظهر للمستخدمين. راجعها وصدّر/احذف ما يلزم وفق سياسة الاحتفاظ قبل migration على أي قاعدة بيانات تحوي بيانات فعلية.
- Migration `0003_request_limits.sql` تنشئ عدادات fixed-window مشتركة عبر D1؛ الحد الافتراضي 10 تشغيلات/دقيقة و100 تشغيل/يوم لكل Access subject، و120 طلب قراءة/دقيقة. يوصى بإضافة rate limits عند Cloudflare edge أيضًا لتقليل الطلبات قبل وصولها إلى Worker/D1.

## تحقق قبل Staging

- اضبط قيم Access في إعدادات Worker Staging الفعلية؛ لا توجد قيم افتراضية آمنة في `wrangler.toml`، وغيابها يعيد `503` للمسارات الخاصة.
- شغّل migration على D1 Staging منفصل فقط.
- اختبر بلا جلسة، بتوقيع مزور، وبتطبيق audience آخر: يجب أن تكون النتيجة `401`.
- اختبر مستخدمين مختلفين: لا يستطيع أي منهما قراءة تشغيلات الآخر أو تفاصيله (`404` لعنصر ليس ملكه).
- اختبر جلسة Access صحيحة عبر واجهة Pages ثم استدعاء `GET /tasks` و`POST /run`، وتحقق من أن استجابة البيانات لا تُخزّن.
- يظل `/health` عامًا عمدًا ليتسنى فحص الصحة، ويكشف فقط حالة الخدمة والنمط ووجود ربط D1.

لم يتم هنا تكوين Cloudflare Access أو ترحيل قاعدة D1 حية أو نشر Worker. هذه خطوات تتطلب ضبط بيئة Cloudflare المناسبة والتحقق منها قبل إعلان Staging جاهزًا.
