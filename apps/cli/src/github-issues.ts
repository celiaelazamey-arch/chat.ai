import { LocalRunner } from './local-runner';
import { GitHubPlugin, HttpGitHubTransport, type GitHubTransport } from '@aok/github';

export interface GithubIssueReadConfig {
  token: string;
  allowedRepositories: string[];
}

export interface GithubRepositoryTarget {
  owner: string;
  repo: string;
  fullName: string;
}

export function githubIssueReadConfig(env: NodeJS.ProcessEnv): GithubIssueReadConfig | undefined {
  const token = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  const allowedRepositories = (env.CELIA_GITHUB_ALLOWED_REPOSITORIES ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!token || allowedRepositories.length === 0) return undefined;
  return { token, allowedRepositories: [...new Set(allowedRepositories)] };
}

export function parseGithubRepositoryTarget(value: string): GithubRepositoryTarget | undefined {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/.exec(value.trim());
  if (!match || match[2] === '.' || match[2] === '..') return undefined;
  return { owner: match[1]!, repo: match[2]!, fullName: `${match[1]}/${match[2]}` };
}

export type GithubIssueCommand =
  | { kind: 'list'; target: GithubRepositoryTarget; state: 'open' | 'closed' | 'all' }
  | { kind: 'read'; target: GithubRepositoryTarget; issueNumber: number };

/** Shared argument parser used by the actual CLI and unit tests. */
export function parseGithubIssueCommand(args: string[]): GithubIssueCommand | undefined {
  const [operation, repository, argument, ...extra] = args;
  if (operation !== 'issues' && operation !== 'issue') return undefined;
  if (extra.length > 0) throw new Error('Unexpected extra GitHub CLI arguments.');
  const target = repository ? parseGithubRepositoryTarget(repository) : undefined;
  if (!target) throw new Error('Provide a valid owner/repo target.');

  if (operation === 'issues') {
    const state = argument ?? 'open';
    if (state !== 'open' && state !== 'closed' && state !== 'all') {
      throw new Error('Issue state must be open, closed, or all.');
    }
    return { kind: 'list', target, state };
  }

  if (!argument || !/^[0-9]+$/.test(argument)) throw new Error('Provide a positive issue number.');
  const issueNumber = Number(argument);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('Provide a positive issue number.');
  return { kind: 'read', target, issueNumber };
}

export interface GithubIssueReadResult {
  runId: string;
  taskId: string;
  repository: string;
  action: 'github.issue.list' | 'github.issue.read';
  verdict: string;
  output: unknown;
  evidence: unknown[];
  ledgerIntegrity: boolean;
}

/**
 * Read-only GitHub Issue intake. It grants only issue.list/issue.read for one
 * explicitly allowlisted repository; untrusted issue text is returned as data
 * and is never fed to a model or interpreted as instructions here.
 */
export async function readGithubIssues(
  config: GithubIssueReadConfig,
  target: GithubRepositoryTarget,
  options: { issueNumber?: number; state?: 'open' | 'closed' | 'all'; page?: number; perPage?: number; labels?: string[] } = {},
  transport: GitHubTransport = new HttpGitHubTransport('https://api.github.com', config.token),
): Promise<GithubIssueReadResult> {
  const allowed = new Set(config.allowedRepositories.map((repository) => repository.toLowerCase()));
  if (!allowed.has(target.fullName.toLowerCase())) {
    throw new Error(`GitHub repository is not allowlisted: ${target.fullName}`);
  }
  const action = options.issueNumber === undefined ? 'github.issue.list' : 'github.issue.read';
  if (options.issueNumber !== undefined && (!Number.isSafeInteger(options.issueNumber) || options.issueNumber < 1)) {
    throw new Error('Issue number must be a positive integer');
  }

  const runner = new LocalRunner({
    approvalPolicy: { 'github.issue.list': 'auto', 'github.issue.read': 'auto' },
  });
  // This runner is scoped to one call; the exact repository is enforced above
  // before constructing it (CapabilityScope itself is currently wildcard-only).
  runner.grant({ id: 'github-issue-read-list', principal: 'github-issue-reader', capability: 'github.issue.list', scope: '*', effect: 'allow' });
  runner.grant({ id: 'github-issue-read-one', principal: 'github-issue-reader', capability: 'github.issue.read', scope: '*', effect: 'allow' });
  new GitHubPlugin(transport).register(runner.executors);

  const input = options.issueNumber === undefined
    ? {
        owner: target.owner,
        repo: target.repo,
        state: options.state ?? 'open',
        page: options.page ?? 1,
        perPage: options.perPage ?? 30,
        labels: options.labels,
      }
    : { owner: target.owner, repo: target.repo, number: options.issueNumber };
  const outcome = await runner.run(`Read GitHub issues in ${target.fullName}`, {
    actorId: 'github-issue-reader',
    plan: [action],
    steps: [{ action, input }],
  });
  const result = outcome.results[0];
  if (outcome.verdict !== 'PASSED' || !result || result.status !== 'success') {
    const detail = result?.output as { error?: unknown } | undefined;
    throw new Error(typeof detail?.error === 'string' ? detail.error : 'GitHub Issue read failed');
  }
  return {
    runId: outcome.runId,
    taskId: outcome.taskId,
    repository: target.fullName,
    action,
    verdict: outcome.verdict,
    output: result.output,
    evidence: result.evidence,
    ledgerIntegrity: runner.ledger.verifyIntegrity().valid,
  };
}
