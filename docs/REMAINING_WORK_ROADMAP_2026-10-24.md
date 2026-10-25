# خطة تطوير وتحديث المستودع — الأعمال غير المكتملة

**تاريخ الحالة:** 2026-10-24
**الغرض:** تحويل الأعمال المتبقية إلى مراحل تنفيذ قابلة للقياس، بترتيب يقلل المخاطر ولا يخلط بين إثبات محلي، اختبار حي، وجاهزية إنتاج. هذه الخطة لا تُنشئ موارد خارجية ولا تمنح إذنًا بالنشر أو بتوسيع الصلاحيات.

## ملخص تنفيذي

الأفضل ألا نبدأ بإضافة ميزات كثيرة قبل إغلاق بوابات التشغيل والأمان. الترتيب المقترح:

1. مراجعة التغييرات المحلية الحالية وإعادة إنتاج التحقق والتغطية.
2. إكمال حواجز المستودع وCI، ثم E2E حقيقي **على مستودع اختبار فقط** بعد إعداد الأسرار.
3. تجهيز Staging Cloudflare معزول والتحقق من الهوية والـD1 والحدود؛ لا Production.
4. إكمال مسار GitHub من Issue للقراءة إلى خطة يراجعها الإنسان، ثم Draft PR بموافقات وقيود واضحة.
5. اتخاذ قرار منفصل إن كان GitHub مطلوبًا داخل Worker `/run`.
6. بعد ثبات ذلك، تنفيذ M8 الهوية، M9 المراقبة والأسرار، ثم M10 الموافقات وقبول النظام الكامل، وفق الاعتماديات المعرفة في وثائق milestones.

## الحالة المرجعية: ما ثبت وما لم يثبت

| المجال | الموجود في الشيفرة/المستودع | ما لم يكتمل أو لم يُثبت |
|---|---|---|
| Runtime المحلي | مسار smoke محدود واختبارات قبول محلية؛ بوابة Runtime Execution منفصلة عن التكاملات الحقيقية | لا يثبت مزود نموذج حقيقيًا، أو GitHub live، أو هوية/تفويض Production |
| Worker/Console | Access JWT وملكية التشغيلات وحدود طلب/معدل ومعالجة أخطاء موجودة محليًا؛ migrations محلية | لا Cloudflare Staging حي، ولا إعداد/تطبيق Access حي، ولا D1 بعيدة، ولا تحقق من runtime منشور أو حماية edge |
| GitHub Actions | CI وCodeQL وReal E2E workflows؛ أضيفت permissions الأقل، target allowlist وحظر source repo، وكل Actions مثبتة على SHAs؛ Dependabot updates لـnpm وActions | لا إعداد GitHub secrets الحية، ولا تشغيل E2E حقيقي، ولا تحقق من CodeQL default setup أو branch rulesets/required checks الحية |
| GitHub plugin | عمليات repo/branch/file/commit/PR وIssues للقراءة؛ CLI read-only مع allowlist وLocalRunner/ledger؛ Draft PR؛ تحقق مسارات ورسائل منقحة؛ timeout 15s، حد response 1 MiB، وGET retry محدود | لا قراءة live مجرّبة، ولا Task دائم أو واجهة Console؛ لا checks/reviews؛ لا idempotency أو موافقات كتابة موحدة؛ لا allowlist عامة في adapter أو pagination عبر Link headers |
| الهوية والأسرار | `kernel/identity` موجود، وVault MVP/واجهات اعتماد موجودة | milestones M8 وM9 ما زالت مخططة بحسب مستنداتها؛ لا دورة هوية/إلغاء موثقة كاملة، ولا تدوير/نطاق/تدقيق Vault مكتمل |
| HITL والقبول | موافقة MVP في local-runner وسيناريوهات اختبار قوية | نظام موافقات مستقل ومربوط بهوية/ledger، expiration/escalation، feature flags/artifact manager وقبول 26 خطوة بكل حقنها ما زالت ضمن M10 المخطط |
| التغطية والتغييرات الحالية | أحدث suite محليًا 361 ناجحًا و2 skipped؛ typecheck نجح | آخر تقرير تغطية محفوظ يسبق إضافات GitHub Issues الحالية؛ يلزم إعادة قياسه. يوجد عمل محلي غير ملتزم في worktree يجب مراجعته وعدم خلطه بتغييرات لاحقة بلا مراجعة |

## الخطة حسب الأولوية والبوابات

### P0 — تثبيت الحالة المحلية قبل توسعة النطاق

**العمل**
- راجع كل تغييرات worktree الحالية على الفرع `arena/ae473de2-chat-ai`، وافصل منطقيًا بين hardening Worker السابق، وحماية Real E2E، وميزات GitHub الجديدة والوثائق.
- أعد تشغيل الاختبارات الكاملة وtypecheck وbuild/dry-run الملائم، وحدّث تقرير التغطية من قياس حقيقي بعد تغييرات GitHub الحالية؛ وضّح ما تم تخطيه دائمًا.
- أضف تحققًا آليًا لقوالب Issue وworkflow (يفضل `actionlint` في CI عند اعتماده) بدل الاكتفاء بتحليل YAML.
- راجع `docs/QUALITY` و`STATUS_SUMMARY` حتى تميز أرقام التغطية التاريخية عن أحدث تشغيل.

**معيار الخروج**
- لا تغييرات غير مفهومة/غير موثقة؛ نتائج قابلة لإعادة الإنتاج؛ GitHub E2E الحقيقي يظل معلّمًا skipped إلى أن تُفتح بوابته صراحةً.

**المخاطر/الاعتماديات**
- كل إصلاح regression يجب أن يسبقه اختبار لسلوك المستخدم/المكوّن، لا مجرد رفع نسبة coverage.

### P1 — حماية المستودع وGitHub Actions

**العمل المحلي**
1. **منجز محليًا:** permissions منخفضة، Actions مثبتة على commit SHAs، وأضيف Dependabot لـGitHub Actions وnpm؛ لا auto-merge.
2. أضف lint آليًا للـworkflows (مثل actionlint) إلى CI، وتحقق أن Dependabot يحدّث SHAs المثبتة.
3. **يتطلب تحققًا حيًا:** فعالية CodeQL Default Setup، required checks الفعلية، وbranch rulesets وصلاحيات GitHub الفعلية؛ امنع تداخل إعدادات CodeQL.

**إعداد GitHub حي مطلوب، لا يمكن استنتاجه من الملفات**
- Branch ruleset لـ`main`: required checks الصحيحة، مراجعة CODEOWNERS، منع force-push والحذف، وسياسة الدمج.
- تحقق من Code Scanning فعليًا.
- إعداد secret `CELIA_E2E_ALLOWED_REPOSITORY` و`E2E_GH_TOKEN` على مستودع اختبار disposable مخصص فقط، بصلاحيات أقل ما يمكن. لا تستخدم المستودع الأساسي كهدف.
- بعد مراجعة الأثر وتنظيفه، شغّل workflow مرة واحدة بموافقة صريحة وسجل artifact؛ لا تسجل token ولا تعرضه في logs.

**معيار الخروج**
- PR عادي لا يحتاج secrets، وCI صلاحياته قراءة؛ E2E لا يبدأ بدون target صريح يطابق allowlist ولا يستطيع استهداف مستودع مصدر الـworkflow؛ إعدادات الحماية الحية موثقة.

### P2 — Cloudflare Staging معزول

**لا يبدأ حتى تتوفر قيم وملكية الموارد من صاحب الحساب**؛ لا تخمين لأسماء Workers/D1 أو domain أو IDs.

1. استكمال قرار نطاق Staging في `docs/deployment/STAGING_CHECKLIST_AND_PLAN.md`: owner/reviewers، hostname، مستخدمو Access، quota/cost ceiling، retention، وهل GitHub خارج النطاق أم لا.
2. إدخال قيم غير سرية فقط إلى إعداد `env.staging` بعد اعتماد الأسماء/IDs؛ لا تضع IDs إنتاج أو secrets في Git.
3. إنشاء Worker/D1/Access منفصلة ببوابة موافقة؛ راجع `wrangler dry-run` قبل أي remote command.
4. تطبيق migrations على D1 Staging المحددة بعد التحقق المزدوج من ID وحالة القاعدة؛ ثم نشر Worker وConsole منفصلين.
5. نفّذ مصفوفة runbook: Access anonymous/invalid/valid، عزل مالكين، CORS/credentials، stream body 64 KiB، D1 quota و`429/Retry-After`، سجلات منقحة، واختبار rollback متفق عليه.
6. لا تعتبر وجود D1 counters بديلًا عن Cloudflare edge rate limits؛ تحقق من حماية edge بصورة منفصلة.

**معيار الخروج**
- نتائج تشغيل Staging قابلة للتدقيق، موارد معزولة عن Production، migrations معلومة، لا tokens في D1/logs، ولا مسار يتجاوز Access.

### P3 — جعل GitHub Issue مدخلًا لعمل محلي مضبوط

1. **منجز محليًا للقراءة فقط:** أوامر `celia github issues <owner/repo> [open|closed|all]` و`celia github issue <owner/repo> <number>` تستدعي plugin عبر LocalRunner. تتطلب `GH_TOKEN` أو `GITHUB_TOKEN` و`CELIA_GITHUB_ALLOWED_REPOSITORIES` (قائمة مفصولة بفواصل)، تمنح قراءة Issue فقط في runner هذه العملية، وتعيد JSON مع evidence؛ لا تغذي body إلى Agent ولا تنفذ أي write. لم يحدث اتصال حي بـGitHub.
2. **التالي:** اعرض Issue كبيانات غير موثوقة في Console أو task preview؛ لا تمرر body كتعليمات نظام ولا تعد labels موافقة؛ اعرض خطة وملفات واختبارات قبل التنفيذ.
3. أضف سجل Task دائمًا مرتبطًا بمفتاح `owner/repo#issue` و`run_id` وevidence مع خيار رفض/إلغاء بلا آثار GitHub؛ حاليًا ledger مؤقت داخل عملية CLI.
4. أضف سياسة actor/source إذا كان التشغيل يتأثر بمستخدم GitHub؛ لا تنفذ comments أو labels أو webhooks قبل التحقق من هوية الفاعل والتكرار.
5. راجع labels المطلوبة (`aok:ready`, `aok:needs-human`, `aok:blocked`, `aok:done`) وإعدادها في GitHub منفصلًا عن قوالب Issue. لا تعتمد على وجودها قبل تهيئتها.

**معيار الخروج**
- يمكن قراءة Issue المسموح به وعرض JSON ودليل ledger محلي؛ لا تُنشأ خطة تنفيذ تلقائية ولا يحدث أي تعديل على GitHub أو المستودع دون خطوة موافقة مستقلة.

### P4 — من الخطة إلى Draft PR، ثم checks/reviews

**المتطلبات قبل الكتابة**
- سياسة repo/path allowlist؛ validation لكل مسار وbranch؛ branch حتمي يربط بالـTask؛ حد حجم الملفات/body/response.
- موافقة explicit على الخطة قبل branch/patch؛ موافقة ثانية قبل PR عند الحاجة؛ Audit/evidence لكل أثر.
- idempotency للمحاولات: لا branch أو PR مكرر؛ معالجة الفشل الجزئي بعد branch/commit ووجود PR سابق.

**التنفيذ المتدرج**
1. **منجز جزئيًا محليًا:** توجد response limit (1 MiB)، timeout (15s)، واختبار retry واحد لـGET عند 429 مع `Retry-After`؛ استكمل اختبارات 403/429/reset، pagination عبر Link وretries/recovery بمصفوفة أخطاء أوسع.
2. وسّع APIs لقراءة PR state/diff/reviews/check runs، مع ربط checks بالـhead SHA المطلوب لا بآخر حالة عامة.
3. في مستودع sandbox: branch → تعديل allowlisted → Draft PR، مع manual approval؛ ممنوع merge/deploy.
4. لا تعتبر task مكتملة حتى تعرض حالة checks/review والـcommit SHA، وتتحقق من required results التي يحددها maintainer.

**معيار الخروج**
- Sandbox PR قابل للتكرار دون ازدواجية، لا يغير مسارًا خارج allowlist، ولا يدمج تلقائيًا، وكل نتيجة لها أدلة.

### P5 — قرار GitHub App وwebhooks وWorker

- لا تنشئ GitHub App/webhook الآن. أولًا أثبت مسار CLI وDraft PR في Sandbox.
- إذا polling كافٍ، ابق عليه. إذا لزم event-driven، صمم App minimal permissions، installation tokens قصيرة العمر، secret في Vault، signature validation، delivery dedupe/replay prevention، queue وحدود body/rate.
- اكتب قرارًا مستقلًا: إبقاء GitHub في CLI أو إدخاله إلى Worker `/run`. أي توصيل Worker يتطلب user→installation→repo authorization، عزل tenants، asynchronous queue، سياسة الموافقة، وحزمة Staging security tests. لا ترسل token من Console ولا تخزنه في D1.

**معيار الخروج**
- قرار scope موثق؛ إن نُفذ webhook فالتوقيع والتكرار/الـreplay مختبران؛ لا أثر غير مصرح به.

### P6 — إكمال platform milestones M8 → M9 → M10

الترتيب مقيد باعتماديات الوثائق، ولا يُختزل بتنفيذ الحزم بالتوازي دون عقد:

1. **M8 Identity & Access:** نموذج Org/User/Session/TokenRef/Role/Trust/Revocation، أحداث Ledger لكل grant/revoke، policy deny بعد الإلغاء، replay/chaos؛ مع architectural test يمنع الأسرار الخام في kernel. لا تبدأ SSO أو multi-tenancy قبل Tier 2/3.
2. **M9 Observability & Secrets:** correlation IDs من task/run/node، logs/metrics محلية قابلة لإعادة البناء، reliability state، Vault rotation/scope/revoke/audit مع اختبارات crash/restart/redaction؛ لا sink SaaS خارجي في هذه المرحلة.
3. **M10 HITL & Full acceptance:** Approval Request/Decision/Expiration/Escalation مستقلة ومربوطة بـPrincipal موثق، لا agent يمنح نفسه الموافقة، deterministic flags/config/artifact manifests، ثم 26-step acceptance مع حقن Model/Tool/Network/Crash/Quota/Privilege/Prompt-injection/duplicate.
4. **M7 Monetization follow-up:** تبقى خلف milestones الأمنية/الهوية؛ تحقق من tenant quota/metering/events حسب عقد M7 قبل أي billing حقيقي. Noop/local adapters فقط حتى اعتماد منتج ومدفوعات.

**معيار الخروج لكل milestone**
- DoD المكتوب في وثيقته يثبت باختبارات سلوكية وevidence؛ نجاح typecheck أو وجود ملفات/حزم وحده لا يعني اكتماله.

### P7 — الإصدارات والتشغيل طويل الأمد

بعد ثبات Staging وCI وsecurity:
- Release workflow على tags مع environment approval، build/test، SBOM، provenance/attestation، changelog وartifact retention.
- خط نشر منفصل لـWorker/Console مع rollback قابل للاختبار، health/smoke، migrations forward-safe، وإدارة النسخ.
- لا auto-deploy Production أو auto-merge؛ يلزم قرار حوكمة وموافقة منفصلة.

## القرارات/المدخلات المطلوبة قبل أي عمل حي

| السؤال | المطلوب من المالك |
|---|---|
| GitHub E2E | اسم مستودع disposable مخصص، قبول إضافة secrets المحدودة إليه، ومن يوافق على آثار test PR/branch |
| قواعد المستودع | من يملك تفعيل ruleset/required checks وقرار عدد المراجعين |
| Cloudflare Staging | الحساب المعتمد، أسماء/IDs موارد Staging أو الموافقة على إنشائها، hostname، مستخدمو Access، سقف التكلفة والبيانات |
| نطاق Worker/GitHub | هل `POST /run` يبقى smoke/local أم يجب أن ينفذ GitHub فعلًا؟ القرار يغير معماريًا وصلاحيات جوهرية |
| milestones | هل M8–M10 ما زالت أولويات المنتج التالية، أم توجد أهداف منتج أحدث؟ |

## ما لا يدخل التنفيذ الآن

- لا App/webhook أو GitHub write credentials أو إعدادات Cloudflare حية قبل قرار وقيم معتمدة.
- لا دمج أو نشر تلقائي من bot.
- لا توصيل GitHub plugin إلى Worker افتراضيًا.
- `plugins/memory/src/index.ts` فارغ عمدًا حسب القرار الحالي؛ لا تُختلق له اختبارات تنفيذ قبل اعتماد تصميم وميزة.
- لا وصف لنجاح الاختبارات المحلية بأنه اعتماد Production.

## اقتراح تقسيم العمل إلى PRs

1. **PR A — تثبيت الحالة الحالية:** مراجعة التغييرات المحلية، تحديث الملخص/التغطية، تحقق محلي كامل.
2. **PR B — GitHub repository hygiene:** pin actions، Dependabot، وتحسين validation الآلي للـworkflows/templates.
3. **PR C — Issue-to-local-task read-only:** CLI وrepo allowlist وevidence أُضيفت محليًا؛ المتبقي durable task/plan preview واختبارات injection/abuse إضافية.
4. **PR D — safe Draft PR pipeline:** path allowlist، approvals، idempotency، checks/reviews، sandbox-only.
5. **مسار تشغيل منفصل:** GitHub/Cloudflare secrets وrulesets وStaging/E2E حي بعد الموافقة؛ لا يخلط في PR كود محلي واحد.
6. **M8 ثم M9 ثم M10:** كل milestone PR مستقل وفق dependencies وDoD.

**قاعدة التوقف:** عند غياب repo/hostname/resource ID/owner/scope معتمد، يتوقف العمل عند التحضير المحلي ولا يُخمن أو ينشأ مورد خارجي.
