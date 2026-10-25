# ADR-0025 — GitHub كـplugin خارجي + Namespace/Schema Registry

- **الحالة:** Accepted
- **التاريخ:** 2026-09-06

## السياق
إضافة GitHub مباشرة دون حدّ يجعل النواة تعرف `github`، ويسمح لأي plugin باختراع `admin.superpower`.

## القرار
- GitHub كـplugin خارجي بالكامل: `plugins/tools/github` (`@aok/github`) — المسار `Kernel → Capability → ToolContract → GitHubAdapter → GitHub API`.
- **لا `kernel → github`** إطلاقًا (Architecture Test يفحص النواة حرفيًا).
- **Namespace + Schema Registry**: `kernel/registry` (`@aok/registry`) + `kernel/contracts/src/naming.ts`.
  - اتفاقية التسمية `namespace.action` (lowercase، قسمان+، namespaces محجوزة: admin/kernel/root/system/…).
  - لا تنفيذ لقدرة غير مسجّلة؛ `admin.superpower` مرفوض.
- **العمليات الأساسية الأصلية**: repo.read · branch.create · file.read · file.write · git.commit · pr.create · pr.read.
- **إضافة لاحقة محلية:** `github.issue.list` و`github.issue.read` للقراءة فقط؛ لا تغيّران حدود Kernel ولا تمنحان الكتابة.
- **النقل مجرد**: `GitHubTransport` (HTTP حقيقي أو FakeTransport للاختبارات offline).
- **الأسرار**: الـtoken عبر `SecretRef → Vault → credential` — لا سر خام في النواة.
- **مبادئ الذرية 011–015** أُضيفت للدستور.

## النتائج
- إيجابي: أول E2E حقيقي يعمل ضد `elazamey/chat.ai` (PR فعلي + تحقق متعدد الطبقات) دون أي تعديل على النواة.
- قيد: الـE2E الحقيقي opt-in (`CELIA_E2E_REAL=1`) حتى لا ينشئ PRs في CI.
