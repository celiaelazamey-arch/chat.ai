import type { ApprovalPolicy } from '@aok/contracts';
import { GITHUB_ACTIONS, type GithubAction } from '@aok/github';

/**
 * تصنيف عمليات GitHub حسب الأثر الجانبي:
 * - قراءات: بلا أثر على المستودع → تلقائية افتراضيًا.
 * - كتابات: تُنشئ/تُعدّل حالة على GitHub → يجب استشارة موافقة لكل عملية على حدة.
 *   “استشارة الموافقة” هنا تعني استدعاء `onApprovalRequired` قبل أي كتابة؛
 *   أما كون الإجابة تفاعلًا بشريًا فعليًا فيعتمد على تنفيذ ذلك المعالج
 *   (الـCLI يقدّم تنفيذًا تفاعليًا، والـE2E الحقيقي يستخدم موافقة مسبقة من المشغّل).
 */
export const GITHUB_READ_ACTIONS = [
  'github.repo.read',
  'github.repo.file.read',
  'github.pull_request.read',
] as const satisfies readonly GithubAction[];

export const GITHUB_WRITE_ACTIONS = [
  'github.repo.branch.create',
  'github.repo.file.write',
  'github.git.commit',
  'github.pull_request.create',
] as const satisfies readonly GithubAction[];

// ضمان وقت الترجمة: كل عملية GitHub مصنّفة تمامًا مرة واحدة، فلا تمر عملية جديدة بلا سياسة صريحة.
type GithubActionCoverage =
  Exclude<GithubAction, (typeof GITHUB_READ_ACTIONS)[number] | (typeof GITHUB_WRITE_ACTIONS)[number]> extends never
    ? true
    : never;
const _githubActionCoverage: GithubActionCoverage = true;
void _githubActionCoverage;

/**
 * سياسة موافقة GitHub (مشدّدة):
 * القراءات `auto` افتراضيًا، أما إنشاء الفروع وكتابة الملفات والـcommits وإنشاء الـPRs
 * فتحتاج استشارة `onApprovalRequired` لكل عملية. هذه ليست مجرد قيمة افتراضية:
 * `enforceGithubApprovalPolicy` أدناه يجعل طبقة قفل الكتابات هي الطبقة الأخيرة دائمًا.
 */
export const GITHUB_APPROVAL_POLICY: ApprovalPolicy = Object.fromEntries([
  ...GITHUB_READ_ACTIONS.map((action) => [action, 'auto'] as const),
  ...GITHUB_WRITE_ACTIONS.map((action) => [action, 'approval'] as const),
]);

/** طبقة القفل غير القابلة للتجاوز من التهيئة العادية: كل كتابة GitHub تتطلب موافقة دائمًا. */
export const GITHUB_WRITE_POLICY_LOCK: ApprovalPolicy = Object.fromEntries(
  GITHUB_WRITE_ACTIONS.map((action) => [action, 'approval'] as const),
);

/**
 * يُطبّق عقد تكامل GitHub على أي سياسة قادمة من المتصل:
 * - قد يشدد المتصل القراءات من `auto` إلى `approval` إن أراد.
 * - لا يستطيع تخفيف أي كتابة إلى `auto`؛ طبقة القفل تُطبق أخيرًا وتتجاهل ذلك التخفيف.
 *
 * هذا القفل يحكم قرار “هل الموافقة مطلوبة؟”، ولا يخترع إجابة الموافقة نفسها:
 * الإجابة تأتي من `onApprovalRequired`، وغيابه/رفضه يعني عدم التنفيذ.
 */
export function enforceGithubApprovalPolicy(callerPolicy: ApprovalPolicy = {}): ApprovalPolicy {
  return {
    ...GITHUB_APPROVAL_POLICY,
    ...callerPolicy,
    ...GITHUB_WRITE_POLICY_LOCK,
  };
}

/** المنح الأدنى اللازمة لتشغيل عمليات GitHub لـprincipal واحد (deny له الأسبقية دائمًا في محرك السياسة). */
export function githubGrantsFor(principal: string) {
  return GITHUB_ACTIONS.map((capability) => ({
    id: `github:${capability}`,
    principal,
    capability,
    // النطاق '*' لأن LocalRunner يقيّم السياسة حاليًا على مستوى القدرة لا المورد؛
    // تقييد النطاق إلى repo:owner/name يحتاج تمرير نطاق كل خطوة من مُدخلاتها (تطوير لاحق موثق).
    scope: '*',
    effect: 'allow' as const,
  }));
}
