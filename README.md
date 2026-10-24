# chat.ai — Agent Operating Kernel (AOK)

نظام تشغيل للوكلاء (Agent Operating System) ينافس Manus وClaude Code.
**نواة ذرية انشطارية**: عدد قليل من الـprimitives يولّد النظام كله، والنواة ontology-neutral لا تعرف Agent ولا Tool ولا Model.

```text
Intent → Task → Plan → Policy → Execution → Evidence → Verification → Outcome → Audit
```

## الوثائق المرجعية (العقود العليا السبعة)

- 📜 **[KERNEL_CONSTITUTION.md](docs/KERNEL_CONSTITUTION.md)** — دستور النواة (القواعد العشر + الذرية + المبادئ الاقتصادية + المناعة).
- 📄 **[ATOMIC_KERNEL_CONTRACT.md](docs/ATOMIC_KERNEL_CONTRACT.md)** — عقد النواة الذرية (interfaces + قواعد التبعية).
- 💰 **[ZERO_COST_ECONOMIC_CONTRACT.md](docs/ZERO_COST_ECONOMIC_CONTRACT.md)** — العقد الاقتصادي (Free Core + BYOK + Runner + Metering/Quota).
- 🔐 **[SECURITY_CONTRACT.md](docs/SECURITY_CONTRACT.md)** — العقد الأمني (Capability-based + Sandbox + Vault).
- 🔑 **[WORKER_ACCESS_SETUP.md](docs/security/WORKER_ACCESS_SETUP.md)** — إعداد Cloudflare Access وهوية المستخدم وعزل تشغيلات D1 لطبقة Worker.
- 👑 **[OWNERSHIP_CONTRACT.md](docs/OWNERSHIP_CONTRACT.md)** — عقد الملكية (Digital Ownership Layer).
- 🧾 **[PROVENANCE_CONTRACT.md](docs/PROVENANCE_CONTRACT.md)** — عقد المصدر (genesis hash + proof bundle).
- 🛡️ **[IMMUNE_SYSTEM_CONTRACT.md](docs/IMMUNE_SYSTEM_CONTRACT.md)** — عقد الجهاز المناعي (Detect/Decide/Isolate/Recover/Verify/Learn).
- 📄 **[ARCHITECTURE_CONTRACT_V1.md](docs/ARCHITECTURE_CONTRACT_V1.md)** — عقد النظام الشامل (العقود/APIs/آلات الحالة).
- 🗂️ **[سجل القرارات المعمارية (ADRs)](docs/architecture/ADRs/)** — كل قرار بسياقه ونتائجه.

### الملكية والمصدر (قابلة للتنفيذ)

- `PROJECT_IDENTITY.yaml` + `PROJECT_GENESIS.md` — هوية المشروع + genesis hash قابل لإعادة الحساب.
- `celia ownership prove` → `ownership-proof/` (حزمة إثبات تقنية).
- `THIRD_PARTY_NOTICES.md` (IP Firewall) + `.github/CODEOWNERS` + `CONTRIBUTING.md` (DCO).
- `bash scripts/ownership-audit.sh` — مراقبة الاستحواذ (OWNERSHIP_ALERT).
- Ownership Tests في `tests/architecture/` تفرض كل ذلك بالكود.

### الجهاز المناعي (Digital Immune System)

- `kernel/immune/` (`@aok/immune`) — سبعة أعضاء: detector · risk-engine · policy-firewall · quarantine · recovery · integrity · incident.
- القاعدة الذهبية: `Agent → Immune → Policy → Execution` — لا `Agent → execute`.
- `celia health` · `celia safe-mode` · `celia emergency-lock` — مراقبة + Safe Mode + Disaster Mode.
- Immune Tests في `tests/architecture/` + سيناريوهات حقيقية في `kernel/immune/src/index.test.ts`.

### الـTest Harness + System Resurrection Test (العضو #30)

- `tests/harness/` (`@aok/harness`) — Mock World · Failure Injection · Chaos · Replay · Deterministic Clock/IDs · Fake GitHub/Model/Vault.
- **System Resurrection Test**: سيناريو القبول الكامل (26 خطوة) محليًا بـ$0 مع حقن الهجمات/الفشل:
  `ATTACK/FAILURE → DETECT → CONTAIN → RECORD → RECOVER → VERIFY → RESUME`.
- خريطة الإغلاق الكاملة (TIER 0/1/2 + ترتيب البناء) في `docs/milestones/SYSTEM_OF_SYSTEMS.md`.

## البدائيات الأربعة

```ts
Entity · Event · Capability · Result
```

منها تتولد بقية النظام. والـKernel يهتم فقط: **هل يستطيع الفاعل؟ ما السياسة؟ ماذا حدث؟ ما الدليل؟ هل تحقق؟**

## القواعد العشر (مفروضة بالكود)

1. النواة **لا تعرف** Agents. 2. النواة **لا تعتمد** على Model Provider.
3. لا تنفيذ مميز بدون Capability. 4. كل أثر جانبي → Event.
5. كل إنجاز خارجي → قابل للتحقق. 6. الـPlugins لا تعدّل حالة النواة.
7. الأسرار خارج حالة التطبيق. 8. الحالة قابلة لإعادة البناء من الأحداث.
9. لا مكوّن يمنح نفسه صلاحية. 10. كل حدود قدرة صريحة.

تُفرض عبر **Architecture Tests** في `tests/architecture/` — كسر القانون يفشل في CI.

## البنية (Monorepo)

```text
kernel/     contracts · execution · capability · policy · transition · events · economics · registry · provenance · immune
runtime/    scheduler · sandbox · orchestrator (DAG Executor + Scheduler + Idempotency + Compensation + Bulkhead)
plugins/    agents · tools · tools/github · models · memory · verification
adapters/   vault · billing
apps/       cli (celia + LocalRunner + GitHub E2E + ownership prove)
tests/      architecture · harness      (فرض القوانين + System Resurrection Test بالكود)
storage/    store (Event Store · Projections · Checkpoints · Evidence — SQLite dev/test + Postgres adapter)
```

| المكوّن | الحزمة |
|---|---|
| البدائيات + العقود | `@aok/contracts` |
| التنفيذ الموحّد `execute()` | `@aok/execution` |
| التركيب (Composition) | `@aok/capability` |
| السياسة (deny-precedence) | `@aok/policy` |
| آلات الحالة + الـDAG | `@aok/transition` |
| الـLedger + Projections | `@aok/events` |
| الجدولة / الـSandbox / الـOrchestrator | `@aok/scheduler` · `@aok/sandbox` · `@aok/orchestrator` |
| الأدوات / الوكلاء | `@aok/tools` · `@aok/agents` |
| النماذج / الذاكرة / التحقق | `@aok/models` · `@aok/memory` · `@aok/verification` |
| الأسرار | `@aok/vault` |
| الاقتصاد (قياس + حدود) | `@aok/economics` |
| الفوترة (خارج النواة) | `@aok/billing` |
| الأسماء + المخططات | `@aok/registry` |
| GitHub (plugin خارجي) | `@aok/github` |
| الملكية + المصدر | `@aok/provenance` |
| الجهاز المناعي (Immune Core) | `@aok/immune` |
| التخزين الدائم (M3) | `@aok/store` |
| الـRunner المحلي + CLI | `@aok/cli` |

## التشغيل

```bash
corepack enable            # تفعيل pnpm
pnpm install
pnpm test                  # Vitest (يشمل Architecture + Ownership + Immune Tests)
pnpm typecheck             # tsc --noEmit لكل الحزم
pnpm ownership:prove       # إصدار حزمة الإثبات إلى ownership-proof/
celia health               # مراقبة النظام (System Health + Immunity Metrics)
celia safe-mode            # وضع آمن: read-only بلا شبكة/أسرار/نشر/كتابة
celia emergency-lock       # STOP شامل + حفظ الدليل + عزل الـrunner
```

## الدفع التلقائي إلى المستودع

كل `commit` يدفع الفرع الحالي إلى `origin` فورًا (hook داخل المستودع):

```bash
bash scripts/setup-hooks.sh   # التفعيل لأي نسخة جديدة
```

## الحالة

`M4 COMPLETE (Orchestrator + Workflow Executor)` — النواة الذرية + الطبقة الاقتصادية +
GitHub Adapter (plugin خارجي) + أول E2E حقيقي ضد المستودع (PR فعلي + تحقق متعدد الطبقات) +
**طبقة الملكية والمصدر** (7 عقود عليا + Genesis + Ownership Ledger + `celia ownership prove`) +
**الجهاز المناعي** (7 أعضاء + Immune Gate/Runtime + Kill Switch + Quarantine + Circuit Breakers) +
**M3** (`@aok/store`: Event Store/Projections/Checkpoints/Evidence + DurableLedger + System Resurrection Test حقيقي) +
**M4** (`@aok/orchestrator`: DAG Executor + Scheduler مستقل + Idempotency + Compensation + Bulkhead + hydrate/resume — Resurrection + Chaos E2E حقيقي).
التسلسل الملزم: **Model Gateway → Memory/RAG → Identity → Observability → M5 Free Deployment → M6 Real E2E + CI → M7 Monetization**.
