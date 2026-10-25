# خارطة طريق للاستفادة من GitHub في Celia/AOK

**الغرض:** تحويل GitHub تدريجيًا من مجرد مستودع واختبار E2E يدوي إلى واجهة تعاون مضبوطة للنظام: استقبال طلب → تشغيل AOK موثق → فرع/PR → فحوصات → قرار بشري. هذه وثيقة تخطيط؛ لا تغيّر إعداد GitHub الحي ولا تنشئ App أو Webhook أو أسرارًا.

## الرؤية وحدودها

- يبقى GitHub تكاملًا خارجيًا عبر `plugins/tools/github`؛ لا تُضاف تبعية GitHub إلى `kernel`.
- يتولى GitHub إدارة المستودعات والـIssues والـPRs والـChecks والـReleases، ويتولى AOK التخطيط والتنفيذ والسياسات والأدلة.
- أول مسار إنتاجي مقترح هو **Issue → مهمة محلية/CLI → Draft PR → نتائج Checks → مراجعة بشرية**.
- لا دمج تلقائي ولا نشر من GitHub حتى تُعتمد سياسة مستقلة لذلك.
- Worker `POST /run` ما زال يستخدم `createLocalSmokeRunner`؛ لا يُعد تكامل GitHub، ولا يُوصل إليه GitHub token في الخطة الحالية.

## ما هو موجود اليوم (من المستودع)

| المجال | الموجود | الفجوة |
|---|---|---|
| GitHub Actions | `.github/workflows/ci.yml` يشغّل typecheck والاختبارات وبناء/Smoke للحاوية على push/PR إلى `main`؛ CI بلا أسرار API، Actions مثبتة محليًا على SHAs، وDependabot مضبوط لـnpm وGitHub Actions | branch rulesets/required checks وCodeQL الفعلي تحتاج تحققًا حيًا؛ التغطية والنتائج ليست جزءًا ظاهرًا من PR summary |
| Code scanning | `.github/workflows/codeql.yml` يدوي فقط، ويذكر أن CodeQL Default Setup مفعل | يجب التحقق من إعدادات Code Scanning الحية، لا الاستدلال من تعليق الملف وحده |
| Real E2E | `.github/workflows/real-e2e.yml` يدوي (`workflow_dispatch`) ويرفع أدلة؛ CLI يدعم read/branch/file/commit/PR/read | حُذفت defaults محليًا، وأضيف تطابق دقيق مع `CELIA_E2E_ALLOWED_REPOSITORY` ورفض استهداف repository المصدر، وصلاحية `GITHUB_TOKEN` للقراءة، وحصر الـjob في `main` وEnvironment `github-e2e`، ومنع التوازي على الهدف نفسه. يلزم إعداد Environment `github-e2e` حيًا بمراجعين وفروع نشر مسموحة، وحفظ `CELIA_E2E_ALLOWED_REPOSITORY` و`E2E_GH_TOKEN` كـenvironment secrets، ثم اختبار workflow على مستودع مخصص |
| GitHub plugin | عمليات repo/branch/file/commit/PR، مع `GitHubTransport` وZod schemas وFake tests | أضيف تحقق owner/repo/path وترميز file path/reference وتعقيم أخطاء HTTP؛ `github.issue.list/read` للقراءة فقط، وCLI يستخدم allowlist. أضيف timeout 15s وحد response 1 MiB وإعادة محاولة محدودة لـGET عند rate limit/transient 5xx؛ لا توجد عمليات reviews أو checks/workflow runs أو pagination عبر روابط `Link` أو idempotency للكتابة |
| الاعتمادات | `resolveToken(SecretRef, VaultAdapter, principal)` موجود؛ CLI/E2E يقرأ `GH_TOKEN`/`GITHUB_TOKEN` من البيئة | يجب توصيل Vault فعليًا في مسار الخدمة، والتحقق من `expiresAt`، واستخدام credentials قصيرة العمر ومحدودة للمستودع |
| المراجعة والملكية | `.github/CODEOWNERS` وPR template موجودان | وجود CODEOWNERS لا يثبت أن المراجعات المطلوبة أو حماية `main` مفعلة في إعدادات GitHub |
| Webhooks / Issues / Projects | لا يظهر استقبال GitHub webhook أو تحويل Issue إلى Task داخل مسار المنتج | فرصة أتمتة كبيرة، لكن يجب بناء تحقق التوقيع ومنع replay/idempotency قبل استقبال الأحداث |

## الأولوية 0 — إغلاق مخاطر GitHub الحالية (قبل توسيع الصلاحيات)

1. **[مكتمل محليًا] إزالة defaults من Real E2E workflow:** `owner` و`repo` مطلوبان بلا قيم افتراضية؛ guard يقبل فقط الهدف المطابق لـ`CELIA_E2E_ALLOWED_REPOSITORY`. لا يزال ضبط السر الحي واختبار الـworkflow على مستودع disposable مطلوبًا.
2. **[منجز محليًا جزئيًا] تقوية الـworkflow:** عُيّنت صلاحية `contents: read` في CI وReal E2E، وفُصل token الاختبار عن `GITHUB_TOKEN`، وثُبتت Actions المستخدمة إلى SHAs، وأضيف Dependabot لـnpm وGitHub Actions. يلزم إعداد secrets المحدودة والتحقق حيًا من الصلاحيات؛ لم يجرِ بعد actionlint في CI.
3. **[يتطلب إعدادًا حيًا] فحص إعدادات المستودع:** تحقق فعليًا من ruleset/branch protection لـ`main`: منع force-push والحذف، required CI/CodeQL checks، مراجعة CODEOWNERS، وقيود الدمج. لا تفترض تفعيلها من الملفات وحدها.
4. **[مكتمل محليًا] مزامنة الوثائق:** حدّث milestone وRunbook وقائمة Staging؛ لم يُشغّل E2E الحي.
5. **[مكتمل محليًا جزئيًا] تقوية حدود Adapter:** تحقق owner/repo/path ومراجع Git، وترميز المسارات ورفض traversal؛ تُنقّح رسائل الأخطاء، وتُحد الاستجابة إلى 1 MiB، ويُفرض timeout 15s، مع إعادة محاولة واحدة محدودة لـGET فقط. لا تزال allowlist per-caller في طبقة plugin العامة وpagination عبر روابط API وتفاصيل retries على أكثر الحالات مطلوبة.

**معيار الخروج:** لا يستطيع تشغيل E2E يدوي غير مقصود أن يكتب إلى المستودع الأساسي، والـCI العادي بلا أسرار وبصلاحيات قراءة فقط.

## المرحلة 1 — استخدام Issues كقائمة عمل آمنة (قراءة فقط أولًا)

- **[منجز محليًا]** أضفت Issue forms للـbug والـfeature مع acceptance criteria والاختبارات ونطاق/مخاطر، وأغلقت issue الفارغة. لا تزال إدارة labels الحية وProject اختيارية وتحتاج ضبطًا على GitHub.
- عرّف labels بسيطة مثل `aok:ready`, `aok:needs-human`, `aok:blocked`, `aok:done`؛ لا تنشئ labels أو Project حيًا دون ضبط معتمد.
- **[منجز محليًا]** CLI يوفّر `celia github issues <owner/repo> [open|closed|all]` و`celia github issue <owner/repo> <number>` عبر LocalRunner وGitHub plugin. يتطلب `GH_TOKEN` أو `GITHUB_TOKEN` و`CELIA_GITHUB_ALLOWED_REPOSITORIES` كقائمة مستودعات مفصولة بفواصل؛ يقرأ فقط ويطبع JSON مع تنبيه أن المحتوى غير موثوق. لم تُختبر قراءة حيّة بعد.
- **[منجز محليًا جزئيًا]** أداتا `github.issue.list/read` بالـplugin تحدّ body إلى 20,000 حرف وتستبعد PRs من قائمة Issues. لا يوجد بعد إنشاء Task دائم/ربط تشغيلات بين جلسات CLI، ولا تفسير آمن لمحتوى Issue بواسطة Agent.
- اربط كل تشغيل بمفتاح ثابت مثل `owner/repo#issue` و`run_id`، واحفظ رابط Issue وPR والأدلة في السجل.
- اعتبر نص Issue والتعليقات وملفات المستودع **مدخلات غير موثوقة**: لا تنفذ تعليمات مضمّنة تلقائيًا، ولا تستنتج موافقة من label وحده؛ استخدم trigger من actor مخول وموافقة صريحة للكتابة.

**معيار الخروج:** يمكن للمستخدم استيراد Issue للقراءة، مراجعة الخطة، ورفضها دون أي أثر خارجي.

## المرحلة 2 — دورة PR آمنة من خلال CLI/LocalRunner

- **[منجز محليًا جزئيًا]** عملية PR الحالية ترسل `draft: true` دائمًا. لا تزال دورة branch/patch الحتمية، path allowlist والموافقة قبل كل كتابة غير مطبقة.
- أضف idempotency: إعادة المحاولة لا تنشئ فروعًا/PRs مكررة؛ سجّل GitHub delivery/operation IDs والـcommit SHA.
- اجعل الصلاحيات متدرجة: القراءة تلقائية ضمن allowlist؛ إنشاء فرع/تعديل محتوى يتطلب موافقة على الخطة/الـdiff؛ إنشاء PR يحتاج موافقة واضحة. لا تضف `merge` في هذه المرحلة.
- أضف قراءة PR diff والـmetadata ونتائج required checks مع pagination وretry/backoff لاحترام rate limits وsecondary limits.
- لا تُعلن نجاح المهمة لمجرد إنشاء PR: انتظر checks المحددة، تحقق من SHA الجاري اختباره ومراجعات المطلوبة، ثم أعد ملخصًا للمستخدم مع الروابط والأدلة.
- وسّع Fake transport واختبارات الحالات: 403/429، `Retry-After`, timeouts، صفحات متعددة، PR موجود سابقًا، فشل جزئي بعد branch/commit، ورفض تعديل خارج allowlist.

**معيار الخروج:** PR تجريبي Draft إلى فرع غير محمي في مستودع sandbox؛ لا merge أو deploy، وكل أثر جانبي مرتبط بالموافقة والـledger.

## المرحلة 3 — هوية GitHub App وwebhooks (بعد ثبوت مسار PR)

1. فضّل GitHub App على PAT دائم: installation واحدة أو أكثر، صلاحيات repo مختارة فقط، وتوكنات installation قصيرة العمر.
2. اجعل Vault هو مصدر credential الوحيد لمسار الخدمة: resolve وقت التنفيذ، تحقق من الانتهاء/النطاق، لا تسجّل token، ولا تمرره إلى Console أو issue/PR body أو logs.
3. اربط هوية مستخدم AOK بالمستودعات المسموح بها؛ لا تسمح بأن يحدد prompt أو Issue أي `owner/repo` بلا سياسة allowlist وموافقة.
4. أضف webhook endpoint فقط عند الحاجة للأحداث الفورية: تحقق `X-Hub-Signature-256` قبل parsing، تحقق من delivery ID، منع replay/التكرار، حجم body/حد معدل، ثم ضع الحدث في queue قبل العمل الثقيل.
5. أعد استخدام polling في CLI/Actions أولًا إن كان أبسط؛ لا تبنِ webhook service لمجرد وجود الإمكانية.

**معيار الخروج:** event موقّع صالح يقود إلى تحديث حالة Task مرة واحدة فقط؛ replay أو signature خاطئ لا ينشئ أي أثر.

## المرحلة 4 — ربط المنتج السحابي (قرار نطاق مستقل)

لا يُربط GitHub بـWorker `/run` إلا بعد اجتياز Staging الحالي واعتماد تصميم منفصل يتضمن:

- مصادقة Access مع ربط المستخدم بـGitHub installation/repositories المصرح بها.
- Vault/short-lived credentials؛ يمنع تخزين token في D1 أو إرساله من المتصفح.
- queue/asynchronous execution، حدود موارد، idempotency، موافقات جانبية، سجل تدقيق وأدلة.
- عزل المستأجرين، CORS/Access، واختبارات abuse/failure على بيئة Staging معزولة.

إذا بقي الهدف smoke runner فقط، اترك GitHub plugin في CLI ولا توصل الشبكة الخارجية إلى Worker.

## المرحلة 5 — Release وموثوقية المستودع

- أضف Dependabot/Renovate لمراجعة تحديثات الحزم، ولا تدمج تحديثات حساسة تلقائيًا قبل CI.
- فعّل CodeQL/Security scanning مرة واحدة وفق إما Default Setup أو Advanced Setup؛ لا تجمع إعدادين متعارضين.
- بعد استقرار دورة PR، أنشئ Release workflow على tags/بيئة محمية: build، tests، SBOM، provenance/attestation، release notes، ثم نشر بموافقة منفصلة.
- لا تستخدم `pull_request_target` لتشغيل كود PR غير موثوق مع أسرار؛ لا تسمح للـbot بدمج PRs أو نشر artifacts بلا حماية environment.

## مؤشرات النجاح

- كل task من Issue يملك `run_id` وbranch/PR/check links قابلة للتتبع.
- صفر كتابة خارج repository/path allowlist، وصفر credentials في logs أو artifacts.
- إعادة تشغيل نفس الحدث لا تنشئ أثرًا مكررًا.
- نسبة تشغيلات PR التي اجتازت checks والـreview المطلوبة، ومتوسط الزمن من Issue مصرح به إلى Draft PR.
- عدد حالات rollback/فشل جزئي، واستهلاك GitHub API مقابل حدود المعدل.

## ترتيب التنفيذ المقترح

1. إغلاق P0 (خصوصًا إزالة defaults الخطرة من real-e2e workflow والتحقق من branch rules).
2. اعتماد مستودع sandbox وcredentials محدودة وتشغيل Real E2E بعد الموافقة.
3. Issues read-only → Draft PR من CLI، مع path/repo allowlists وapproval gates.
4. GitHub App/Vault وwebhooks عند وجود حاجة تشغيلية حقيقية.
5. قرار مستقل: Worker integration أم إبقاء GitHub في CLI.
6. Release automation بعد استقرار الاختبارات والسياسات.

**لا شيء في هذه الخارطة ينفذ تلقائيًا، ولا تعني موافقة على النشر أو على الكتابة في مستودع حقيقي.**
