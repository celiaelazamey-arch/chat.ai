import { HttpGitHubTransport, type GitHubTransport } from '@aok/github';

export interface GithubRepoAccess {
  fullName: string;
  defaultBranch: string;
  /** صلاحيات الـtoken الفعلية كما تعيدها GitHub API لهذا المستودع. */
  permissions: {
    pull: boolean;
    push: boolean;
    admin: boolean;
  };
}

export interface GithubConnectionReport {
  /** الاتصال صالح للقراءة؛ ومع فحص مستودع: صالح للوصول إليه أيضًا. */
  connected: boolean;
  authenticated: boolean;
  /** تسجيل الدخول المُتحقق منه عبر GET /user — بلا أي سر. */
  login?: string;
  repo?: GithubRepoAccess;
  /** رسالة خطأ آمنة للعرض (من GitHub API) — لا تحتوي السر أبدًا بحكم البناء. */
  error?: string;
}

export interface VerifyGithubConnectionOptions {
  transport: GitHubTransport;
  owner?: string;
  repo?: string;
}

/**
 * تحقق حقيقي من اتصال GitHub: المصادقة (GET /user) + صلاحية الوصول إلى مستودع
 * (GET /repos/{owner}/{repo}) مع صلاحيات الـtoken عليه.
 *
 * الأمان: تستلم الدالة `GitHubTransport` مُهيأً ولا ترى الـtoken الخام أبدًا،
 * وتقريرها لا يتضمن أي حقل يمكن أن يحمل السر.
 */
export async function verifyGithubConnection(
  opts: VerifyGithubConnectionOptions,
): Promise<GithubConnectionReport> {
  try {
    const userRes = await opts.transport.request('GET', '/user');
    const login = (userRes.json as { login?: string } | undefined)?.login;
    if (!login) {
      return { connected: false, authenticated: false, error: 'GitHub API did not return an authenticated user' };
    }

    if (!opts.owner || !opts.repo) {
      return { connected: true, authenticated: true, login };
    }

    const repoRes = await opts.transport.request('GET', `/repos/${opts.owner}/${opts.repo}`);
    const repo = repoRes.json as {
      full_name: string;
      default_branch: string;
      permissions?: { pull?: boolean; push?: boolean; admin?: boolean };
    };
    return {
      connected: true,
      authenticated: true,
      login,
      repo: {
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        permissions: {
          pull: Boolean(repo.permissions?.pull),
          push: Boolean(repo.permissions?.push),
          admin: Boolean(repo.permissions?.admin),
        },
      },
    };
  } catch (err) {
    return {
      connected: false,
      authenticated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** اسم متغير البيئة الحامل للـtoken (للإبلاغ عن المصدر فقط — لا تُعاد القيمة أبدًا). */
export type GithubTokenSource = 'GH_TOKEN' | 'GITHUB_TOKEN';

export function githubTokenSource(env: NodeJS.ProcessEnv = process.env): GithubTokenSource | undefined {
  if (env.GH_TOKEN) return 'GH_TOKEN';
  if (env.GITHUB_TOKEN) return 'GITHUB_TOKEN';
  return undefined;
}

/** يبني Transport حقيقيًا من بيئة التشغيل، أو يعيد undefined عند غياب أي اعتماد (لا نجاح وهمي). */
export function githubTransportFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { transport: GitHubTransport; source: GithubTokenSource } | undefined {
  const source = githubTokenSource(env);
  if (!source) return undefined;
  const token = env[source]!;
  return { transport: new HttpGitHubTransport('https://api.github.com', token), source };
}

/** المستودع الافتراضي للفحص — نفس افتراضات اختبار الـE2E الحقيقي. */
export function defaultGithubRepo(env: NodeJS.ProcessEnv = process.env): { owner: string; repo: string } {
  return {
    owner: env.CELIA_E2E_OWNER ?? 'elazamey',
    repo: env.CELIA_E2E_REPO ?? 'chat.ai',
  };
}

/** يحلّل وسيط `owner/repo` إن قُدّم، وإلا يعيد الافتراضي. */
export function parseOwnerRepo(
  arg: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { owner: string; repo: string } {
  if (!arg) return defaultGithubRepo(env);
  const [owner, repo] = arg.split('/');
  if (!owner || !repo) throw new Error(`expected owner/repo, got '${arg}'`);
  return { owner, repo };
}

/** تقرير بشري آمن للطباعة: مصدر الاعتماد باسمه فقط، ونتائج الفحص، بلا قيمة السر. */
export function formatConnectionReport(
  report: GithubConnectionReport,
  source: GithubTokenSource | undefined,
): string {
  const lines: string[] = [];
  lines.push(`credential source: ${source ?? '(none)'} (value never printed)`);
  if (!report.authenticated) {
    lines.push('github: NOT CONNECTED');
    if (report.error) lines.push(`error: ${report.error}`);
    return lines.join('\n');
  }
  lines.push(`github: connected as ${report.login}`);
  if (report.repo) {
    const p = report.repo.permissions;
    lines.push(`repo: ${report.repo.fullName} (default branch: ${report.repo.defaultBranch})`);
    lines.push(`permissions: pull=${p.pull} push=${p.push} admin=${p.admin}`);
    lines.push(p.push ? 'write access: available (writes still require explicit approval)' : 'write access: read-only');
  }
  return lines.join('\n');
}
