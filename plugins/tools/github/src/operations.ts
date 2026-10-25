import type { EvidenceRef } from '@aok/contracts';
import type { GitHubTransport } from './transport';

/** صلاحيات GitHub المدعومة حاليًا؛ عمليات Issues الإضافية للقراءة فقط. */
export const GITHUB_ACTIONS = [
  'github.repo.read',
  'github.issue.list',
  'github.issue.read',
  'github.repo.branch.create',
  'github.repo.file.read',
  'github.repo.file.write',
  'github.git.commit',
  'github.pull_request.create',
  'github.pull_request.read',
] as const;

export type GithubAction = (typeof GITHUB_ACTIONS)[number];

export interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  defaultBranchSha: string;
}

function obj<T>(value: unknown): T {
  return value as T;
}

function b64encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

function b64decode(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function repoPath(owner: string, repo: string): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('Invalid GitHub owner');
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') {
    throw new Error('Invalid GitHub repository name');
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function contentPath(path: string): string {
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid repository file path');
  }
  return segments.map(encodeURIComponent).join('/');
}

function refPath(ref: string): string {
  if (!ref || /[\r\n]/.test(ref)) throw new Error('Invalid Git reference');
  return encodeURIComponent(ref);
}

export async function repoRead(t: GitHubTransport, input: { owner: string; repo: string }): Promise<RepoInfo> {
  const root = repoPath(input.owner, input.repo);
  const repoRes = await t.request('GET', root);
  const repo = obj<{ full_name: string; default_branch: string }>(repoRes.json);
  const refRes = await t.request('GET', `${root}/git/ref/heads/${refPath(repo.default_branch)}`);
  const ref = obj<{ object: { sha: string } }>(refRes.json);
  return {
    owner: input.owner,
    repo: input.repo,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    defaultBranchSha: ref.object.sha,
  };
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  body: string | null;
  bodyTruncated: boolean;
  state: string;
  url: string;
  author: string | null;
  labels: string[];
  updatedAt: string;
}

const ISSUE_BODY_LIMIT = 20_000;

function summarizeIssue(issue: Record<string, unknown>): GitHubIssueSummary {
  const body = typeof issue.body === 'string' ? issue.body : null;
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label) => typeof label === 'string'
      ? label
      : typeof label === 'object' && label !== null && typeof (label as { name?: unknown }).name === 'string'
        ? (label as { name: string }).name
        : '').filter(Boolean)
    : [];
  const user = issue.user as { login?: unknown } | null | undefined;
  return {
    number: Number(issue.number),
    title: typeof issue.title === 'string' ? issue.title.slice(0, 1_000) : '',
    body: body === null ? null : body.slice(0, ISSUE_BODY_LIMIT),
    bodyTruncated: body !== null && body.length > ISSUE_BODY_LIMIT,
    state: typeof issue.state === 'string' ? issue.state : 'unknown',
    url: typeof issue.html_url === 'string' ? issue.html_url : '',
    author: typeof user?.login === 'string' ? user.login : null,
    labels,
    updatedAt: typeof issue.updated_at === 'string' ? issue.updated_at : '',
  };
}

export async function issueList(
  t: GitHubTransport,
  input: { owner: string; repo: string; state: 'open' | 'closed' | 'all'; page: number; perPage: number; labels?: string[] },
): Promise<{ issues: GitHubIssueSummary[]; page: number; perPage: number }> {
  const params = new URLSearchParams({ state: input.state, page: String(input.page), per_page: String(input.perPage) });
  if (input.labels?.length) params.set('labels', input.labels.join(','));
  const res = await t.request('GET', `${repoPath(input.owner, input.repo)}/issues?${params.toString()}`);
  if (!Array.isArray(res.json)) throw new Error('Invalid GitHub issues response');
  const issues = (res.json as Record<string, unknown>[])
    .filter((issue) => !('pull_request' in issue))
    .map(summarizeIssue);
  return { issues, page: input.page, perPage: input.perPage };
}

export async function issueRead(
  t: GitHubTransport,
  input: { owner: string; repo: string; number: number },
): Promise<GitHubIssueSummary> {
  const res = await t.request('GET', `${repoPath(input.owner, input.repo)}/issues/${input.number}`);
  const issue = obj<Record<string, unknown>>(res.json);
  if ('pull_request' in issue) throw new Error('Requested number is a pull request, not an issue');
  return summarizeIssue(issue);
}

export async function branchCreate(
  t: GitHubTransport,
  input: { owner: string; repo: string; branch: string; from: string },
): Promise<{ ref: string; sha: string }> {
  const root = repoPath(input.owner, input.repo);
  const res = await t.request('POST', `${root}/git/refs`, {
    body: { ref: `refs/heads/${input.branch}`, sha: input.from },
  });
  const created = obj<{ ref: string; object: { sha: string } }>(res.json);
  return { ref: created.ref, sha: created.object.sha };
}

export async function fileRead(
  t: GitHubTransport,
  input: { owner: string; repo: string; path: string; ref?: string },
): Promise<{ path: string; content: string; sha: string }> {
  const q = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
  const res = await t.request('GET', `${repoPath(input.owner, input.repo)}/contents/${contentPath(input.path)}${q}`);
  const file = obj<{ content: string; sha: string }>(res.json);
  return { path: input.path, content: b64decode(file.content), sha: file.sha };
}

export async function fileWrite(
  t: GitHubTransport,
  input: { owner: string; repo: string; path: string; branch: string; content: string; message: string },
): Promise<{ commitSha: string; contentSha: string }> {
  const res = await t.request('PUT', `${repoPath(input.owner, input.repo)}/contents/${contentPath(input.path)}`, {
    body: {
      message: input.message,
      content: b64encode(input.content),
      branch: input.branch,
    },
  });
  const out = obj<{ commit: { sha: string }; content: { sha: string } }>(res.json);
  return { commitSha: out.commit.sha, contentSha: out.content.sha };
}

export async function gitCommit(
  t: GitHubTransport,
  input: { owner: string; repo: string; branch: string; message: string },
): Promise<{ sha: string }> {
  const root = repoPath(input.owner, input.repo);
  const refRes = await t.request('GET', `${root}/git/ref/heads/${refPath(input.branch)}`);
  const parentSha = obj<{ object: { sha: string } }>(refRes.json).object.sha;
  const parentRes = await t.request('GET', `${root}/git/commits/${encodeURIComponent(parentSha)}`);
  const parent = obj<{ tree: { sha: string }; parents: { sha: string }[] }>(parentRes.json);
  const commitRes = await t.request('POST', `${root}/git/commits`, {
    body: { message: input.message, tree: parent.tree.sha, parents: [parentSha] },
  });
  const commit = obj<{ sha: string }>(commitRes.json);
  await t.request('PATCH', `${root}/git/refs/heads/${refPath(input.branch)}`, {
    body: { sha: commit.sha },
  });
  return { sha: commit.sha };
}

export async function prCreate(
  t: GitHubTransport,
  input: { owner: string; repo: string; title: string; head: string; base: string; body?: string },
): Promise<{ number: number; url: string; headSha: string; headRef: string; baseRef: string; state: string }> {
  const res = await t.request('POST', `${repoPath(input.owner, input.repo)}/pulls`, {
    body: { title: input.title, head: input.head, base: input.base, body: input.body ?? '', draft: true },
  });
  const pr = obj<{ number: number; html_url: string; head: { sha: string; ref: string }; base: { ref: string }; state: string }>(res.json);
  return { number: pr.number, url: pr.html_url, headSha: pr.head.sha, headRef: pr.head.ref, baseRef: pr.base.ref, state: pr.state };
}

export async function prRead(
  t: GitHubTransport,
  input: { owner: string; repo: string; number: number },
): Promise<{
  number: number;
  state: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  title: string;
  url: string;
  files: { filename: string; status: string }[];
}> {
  const root = repoPath(input.owner, input.repo);
  const res = await t.request('GET', `${root}/pulls/${input.number}`);
  const pr = obj<{ number: number; state: string; title: string; html_url: string; head: { sha: string; ref: string }; base: { ref: string } }>(res.json);
  const filesRes = await t.request('GET', `${root}/pulls/${input.number}/files`);
  const files = obj<{ filename: string; status: string }[]>(filesRes.json);
  return {
    number: pr.number,
    state: pr.state,
    headSha: pr.head.sha,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    title: pr.title,
    url: pr.html_url,
    files,
  };
}

export interface OperationOutcome {
  output: unknown;
  evidence: EvidenceRef[];
}

/** نقطة الدخول الموحّدة للعمليات — كل عملية تعيد دليلها. */
export async function dispatch(
  action: GithubAction,
  input: unknown,
  t: GitHubTransport,
): Promise<OperationOutcome> {
  switch (action) {
    case 'github.repo.read': {
      const out = await repoRead(t, input as { owner: string; repo: string });
      return { output: out, evidence: [{ evidenceId: `github.repo.read:${out.fullName}`, kind: 'http_check' }] };
    }
    case 'github.issue.list': {
      const out = await issueList(t, input as Parameters<typeof issueList>[1]);
      return { output: out, evidence: [{ evidenceId: `github.issue.list:${out.issues.map((issue) => issue.number).join(',')}`, kind: 'http_check' }] };
    }
    case 'github.issue.read': {
      const out = await issueRead(t, input as Parameters<typeof issueRead>[1]);
      return { output: out, evidence: [{ evidenceId: `github.issue.read:#${out.number}`, kind: 'http_check' }] };
    }
    case 'github.repo.branch.create': {
      const out = await branchCreate(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.repo.branch.create:${out.sha}`, kind: 'git_commit' }] };
    }
    case 'github.repo.file.read': {
      const out = await fileRead(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.repo.file.read:${out.sha}`, kind: 'file' }] };
    }
    case 'github.repo.file.write': {
      const out = await fileWrite(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.repo.file.write:${out.commitSha}`, kind: 'git_commit' }] };
    }
    case 'github.git.commit': {
      const out = await gitCommit(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.git.commit:${out.sha}`, kind: 'git_commit' }] };
    }
    case 'github.pull_request.create': {
      const out = await prCreate(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.pull_request.create:#${out.number}`, kind: 'artifact' }] };
    }
    case 'github.pull_request.read': {
      const out = await prRead(t, input as never);
      return { output: out, evidence: [{ evidenceId: `github.pull_request.read:#${out.number}`, kind: 'http_check' }] };
    }
  }
}
