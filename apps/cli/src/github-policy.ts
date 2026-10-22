import type { ApprovalPolicy } from '@aok/contracts';
import { GITHUB_ACTIONS, type GithubAction } from '@aok/github';

/**
 * تصنيف عمليات GitHub حسب الأثر الجانبي:
 * - قراءات: بلا أثر على المستودع → تلقائية.
 * - كتابات: تُنشئ/تُعدّل حالة على GitHub → موافقة بشرية صريحة إلزامية لكل عملية.
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
 * القراءات `auto`، أما إنشاء الفروع وكتابة الملفات والـcommits وإنشاء الـPRs
 * فتتطلب موافقة صريحة عبر `onApprovalRequired` — ولا توجد أي موافقة آلية افتراضية.
 */
export const GITHUB_APPROVAL_POLICY: ApprovalPolicy = Object.fromEntries([
  ...GITHUB_READ_ACTIONS.map((action) => [action, 'auto'] as const),
  ...GITHUB_WRITE_ACTIONS.map((action) => [action, 'approval'] as const),
]);

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
