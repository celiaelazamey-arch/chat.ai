import type { GitHubTransport } from '@aok/github';
import { LocalRunner, type RunnerOptions } from './local-runner';
import { githubTransportFromEnv } from './github-connect';

export interface GithubRunnerOptions extends Omit<RunnerOptions, 'github'> {
  transport: GitHubTransport;
  /** الـprincipal الذي تُمنح له قدرات GitHub. الافتراضي: 'coder'. */
  principal?: string;
}

/**
 * Runner مفعّل فيه GitHub داخل مسار التنفيذ الفعلي:
 * عمليات مسجّلة + منح + سياسة موافقة مشدّدة.
 * الكتابات لا تُنفَّذ إلا إذا قدّم المتصل `onApprovalRequired` وافق صراحة —
 * غيابه يعني الرفض الافتراضي (سلوك LocalRunner القائم).
 */
export function createGithubRunner(opts: GithubRunnerOptions): LocalRunner {
  const { transport, principal, ...runnerOpts } = opts;
  return new LocalRunner({ ...runnerOpts, github: { transport, principal } });
}

/**
 * نفس الـRunner لكن بالاعتماد من بيئة التشغيل (GH_TOKEN/GITHUB_TOKEN).
 * يعيد undefined عند غياب الاعتماد — لا Runner وهمي ولا نجاح مُدّعى.
 */
export function createGithubRunnerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: Omit<GithubRunnerOptions, 'transport'> = {},
): LocalRunner | undefined {
  const fromEnv = githubTransportFromEnv(env);
  if (!fromEnv) return undefined;
  return createGithubRunner({ ...opts, transport: fromEnv.transport });
}
