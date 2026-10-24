# THIRD-PARTY NOTICES — سجل ملكية الغير (IP Intake)

> كل مكوّن خارجي يدخل المشروع (dependency / code / template / model / plugin / …)
> يُسجَّل هنا: الأصل + الترخيص + التوافق التجاري.
> **القاعدة (Third-Party IP Firewall):** ما ليس مُعلنًا هنا لا يدخل.
> يتحقق من ذلك اختبار معماري (`Third-party licenses are tracked`).
> المرجع: [`docs/OWNERSHIP_CONTRACT.md`](docs/OWNERSHIP_CONTRACT.md).

## التصنيف

```text
ALLOWED     ← متوافق تجاريًا (مسموح)
REVIEW      ← يحتاج مراجعة قانونية قبل الاعتماد
RESTRICTED  ← مسموح بشروط محددة (انتبه)
BLOCKED     ← ممنوع (GPL-copyleft قسري في نواة مغلقة المصدر، تراخيص غير تجارية، …)
```

## السجل

| الحزمة | الترخيص | التصنيف | ملاحظة |
|---|---|---|---|
| zod | MIT | ALLOWED | عقود المخططات |
| @types/node | MIT | ALLOWED | أنواع Node (dev) |
| typescript | Apache-2.0 | ALLOWED | المترجم (dev) |
| vitest | MIT | ALLOWED | الاختبارات (dev) |
| @vitest/coverage-v8 | MIT | ALLOWED | قياس تغطية الاختبارات (dev) |
| yaml | ISC | ALLOWED | قراءة PROJECT_IDENTITY.yaml |
| tsx | MIT | ALLOWED | تشغيل CLI (dev) |
| esbuild | MIT | ALLOWED | تبعية غير مباشرة (dev) |
| lucide-react | ISC | ALLOWED | أيقونات واجهة `apps/console` |
| react-dom | MIT | ALLOWED | واجهة React — `apps/console` |
| @types/react | MIT | ALLOWED | أنواع React (dev، `apps/console`) |
| @types/react-dom | MIT | ALLOWED | أنواع react-dom (dev، `apps/console`) |
| @testing-library/react | MIT | ALLOWED | اختبارات تفاعل مكونات React (dev، `apps/console`) |
| jsdom | MIT | ALLOWED | بيئة DOM لاختبارات React (dev، `apps/console`) |
| @vitejs/plugin-react | MIT | ALLOWED | ملحق Vite لـ React (dev، `apps/console`) |
| @cloudflare/workers-types | MIT | ALLOWED | أنواع Cloudflare Workers (dev، `apps/worker`) |
| wrangler | MIT | ALLOWED | أداة نشر Cloudflare Workers/Pages (dev، `apps/worker`) |

## أدوات التشغيل (Tooling — ليست deps في الحزم)

| الأداة | الترخيص | ملاحظة |
|---|---|---|
| Node.js | MIT-style (custom) | الـruntime |
| pnpm | MIT | مدير الحزم |

## قاعدة التحقق (قابلة للتنفيذ)

اختبار معماري يقرأ كل `package.json` ويجمع التبعيات غير الداخلية (`workspace:*` / `@aok/*`)
ويتأكد أن كل اسم حزمة مُعلن في هذا الملف مع تصنيف. أي تبعية جديدة غير مُعلنة = فشل CI.

## مصادر خارجية غير برمجية (تُسجَّل عند دخولها)

```text
dependency | code snippet | template | icon | font | model | dataset | prompt | plugin | MCP server
→ origin · license · author · source · version · compatibility · commercial_use
```
