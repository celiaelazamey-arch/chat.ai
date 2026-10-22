import { describe, it, expect, vi } from 'vitest';
import { LocalRunner, type ApprovalRequest } from './local-runner';
import { createGithubRunner, createGithubRunnerFromEnv } from './github-runner';
import {
  enforceGithubApprovalPolicy,
  GITHUB_APPROVAL_POLICY,
  GITHUB_READ_ACTIONS,
  GITHUB_WRITE_ACTIONS,
} from './github-policy';
import { GITHUB_APPROVAL_POLICY as REEXPORTED_POLICY, runGithubE2E } from './github-e2e';
import { GITHUB_ACTIONS, GitHubRequestError, type GitHubRequestOptions, type GitHubResponse, type GitHubTransport } from '@aok/github';

/** نقل GitHub وهمي (offline بالكامل) يسجّل كل طلب — لإثبات ما حدث وما لم يحدث على الحدود. */
class FakeGitHub implements GitHubTransport {
  requests: { method: string; path: string }[] = [];
  refs = new Map<string, string>([['refs/heads/main', 'sha-main']]);
  writtenPaths: string[] = [];
  prs: Record<number, Record<string, unknown>> = {};
  prCounter = 0;

  async request(method: string, path: string, opts?: GitHubRequestOptions): Promise<GitHubResponse> {
    this.requests.push({ method, path });
    const body = (opts?.body ?? {}) as Record<string, unknown>;

    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(path)) {
      const [, , owner, repo] = path.split('/');
      return { status: 200, json: { full_name: `${owner}/${repo}`, default_branch: 'main', permissions: { pull: true, push: true, admin: false } } };
    }
    if (method === 'GET' && path.includes('/git/ref/heads/')) {
      const branch = 'refs/heads/' + path.split('/git/ref/heads/')[1];
      return { status: 200, json: { ref: branch, object: { sha: this.refs.get(branch) ?? 'sha-main' } } };
    }
    if (method === 'POST' && path.endsWith('/git/refs')) {
      const ref = body.ref as string;
      this.refs.set(ref, body.sha as string);
      return { status: 201, json: { ref, object: { sha: body.sha } } };
    }
    if (method === 'GET' && path.includes('/contents/')) {
      return { status: 200, json: { content: Buffer.from('hello', 'utf8').toString('base64'), sha: 'sha-file' } };
    }
    if (method === 'PUT' && path.includes('/contents/')) {
      this.writtenPaths.push((path.split('/contents/')[1] ?? '').split('?')[0]!);
      return { status: 201, json: { commit: { sha: 'sha-commit-1' }, content: { sha: 'sha-file-2' } } };
    }
    if (method === 'GET' && path.includes('/git/commits/')) {
      return { status: 200, json: { tree: { sha: 'tree-1' }, parents: [{ sha: 'sha-commit-1' }] } };
    }
    if (method === 'POST' && path.endsWith('/git/commits')) {
      return { status: 201, json: { sha: 'sha-commit-2' } };
    }
    if (method === 'PATCH' && path.includes('/git/refs/heads/')) {
      const branch = 'refs/heads/' + path.split('/git/refs/heads/')[1];
      this.refs.set(branch, body.sha as string);
      return { status: 200, json: { sha: body.sha } };
    }
    if (method === 'POST' && path.endsWith('/pulls')) {
      const number = ++this.prCounter;
      this.prs[number] = {
        number,
        html_url: `https://github.com/o/r/pull/${number}`,
        head: { sha: 'sha-commit-2', ref: body.head },
        base: { ref: body.base },
        state: 'open',
        title: body.title,
      };
      return { status: 201, json: this.prs[number] };
    }
    if (method === 'GET' && /\/pulls\/\d+\/files$/.test(path)) {
      return { status: 200, json: this.writtenPaths.map((filename) => ({ filename, status: 'added' })) };
    }
    if (method === 'GET' && /\/pulls\/\d+$/.test(path)) {
      return { status: 200, json: this.prs[Number(path.split('/pulls/')[1])] ?? {} };
    }
    throw new GitHubRequestError(404, 'not found (fake)', path);
  }

  writeRequests() {
    return this.requests.filter((r) => r.method !== 'GET');
  }
}

describe('GitHub approval policy — reads auto, every write requires explicit approval', () => {
  it('classifies every GitHub action with an explicit policy', () => {
    expect([...GITHUB_READ_ACTIONS, ...GITHUB_WRITE_ACTIONS].sort()).toEqual([...GITHUB_ACTIONS].sort());
    for (const action of GITHUB_READ_ACTIONS) expect(GITHUB_APPROVAL_POLICY[action], action).toBe('auto');
    for (const action of GITHUB_WRITE_ACTIONS) expect(GITHUB_APPROVAL_POLICY[action], action).toBe('approval');
    expect(REEXPORTED_POLICY).toBe(GITHUB_APPROVAL_POLICY);
  });

  it('applies the write-policy lock last while still honoring stricter reads', () => {
    const enforced = enforceGithubApprovalPolicy({
      'github.repo.read': 'approval', // تشديد مسموح
      'github.repo.branch.create': 'auto', // محاولة تجاوز يجب تجاهلها
      'github.repo.file.write': 'auto',
      'github.git.commit': 'auto',
      'github.pull_request.create': 'auto',
    });

    expect(enforced['github.repo.read']).toBe('approval');
    for (const action of GITHUB_WRITE_ACTIONS) expect(enforced[action], action).toBe('approval');
  });
});

describe('GitHub wiring into the real execution path (LocalRunner)', () => {
  it('leaves the default runner deny-by-default with no GitHub executors', async () => {
    const runner = new LocalRunner();
    expect(runner.executors.list()).toEqual([]);
    expect(runner.githubPlugin).toBeUndefined();

    const outcome = await runner.run('read a repo without any wiring', {
      steps: [{ action: 'github.repo.read', input: { owner: 'o', repo: 'r' } }],
    });
    expect(outcome.verdict).toBe('FAILED');
  });

  it('registers all 7 actions when GitHub is explicitly enabled', () => {
    const runner = createGithubRunner({ transport: new FakeGitHub() });
    expect(runner.executors.list().sort()).toEqual([...GITHUB_ACTIONS].sort());
    expect(runner.githubPlugin).toBeDefined();
  });

  it('builds a wired runner from the environment only when a credential exists', () => {
    expect(createGithubRunnerFromEnv({})).toBeUndefined();
    const runner = createGithubRunnerFromEnv({ GH_TOKEN: 'x' });
    expect(runner?.executors.list()).toHaveLength(7);
  });

  it('runs reads automatically without ever asking for approval', async () => {
    const onApprovalRequired = vi.fn(async () => false);
    const runner = createGithubRunner({ transport: new FakeGitHub(), onApprovalRequired });

    const outcome = await runner.run('inspect', {
      steps: [
        { action: 'github.repo.read', input: { owner: 'o', repo: 'r' } },
        { action: 'github.repo.file.read', input: { owner: 'o', repo: 'r', path: 'README.md' } },
      ],
    });

    expect(outcome.verdict).toBe('PASSED');
    expect(onApprovalRequired).not.toHaveBeenCalled();
  });

  it('blocks writes before the transport when no approval handler exists', async () => {
    const fake = new FakeGitHub();
    const runner = createGithubRunner({ transport: fake }); // بلا معالج موافقة إطلاقًا

    const outcome = await runner.run('try to write', {
      steps: [
        { action: 'github.repo.read', input: { owner: 'o', repo: 'r' } },
        { action: 'github.repo.branch.create', input: { owner: 'o', repo: 'r', branch: 'e2e', from: 'sha-main' } },
      ],
    });

    expect(outcome.verdict).toBe('FAILED');
    expect(outcome.results[1]?.output).toEqual({ error: "'github.repo.branch.create' requires approval" });
    expect(outcome.ledger.map((e) => e.type)).toContain('ApprovalDenied');
    expect(fake.writeRequests()).toEqual([]); // لم يعبر أي طلب كتابة إلى الحدود
  });

  it('cannot be bypassed by a caller approvalPolicy that downgrades writes to auto', async () => {
    const fake = new FakeGitHub();
    const onApprovalRequired = vi.fn(async (_req: ApprovalRequest) => false);
    const runner = createGithubRunner({
      transport: fake,
      approvalPolicy: Object.fromEntries(GITHUB_WRITE_ACTIONS.map((action) => [action, 'auto'])),
      onApprovalRequired,
    });

    const outcome = await runner.run('attempt a policy bypass', {
      steps: [
        {
          action: 'github.repo.branch.create',
          input: { owner: 'o', repo: 'r', branch: 'bypass-attempt', from: 'sha-main' },
        },
      ],
    });

    expect(outcome.verdict).toBe('FAILED');
    expect(onApprovalRequired).toHaveBeenCalledTimes(1); // الاستشارة حدثت رغم محاولة auto
    expect(onApprovalRequired.mock.calls[0]?.[0]?.action).toBe('github.repo.branch.create');
    expect(outcome.ledger.map((e) => e.type)).toEqual(
      expect.arrayContaining(['ApprovalRequired', 'ApprovalDenied']),
    );
    expect(fake.writeRequests()).toEqual([]);
  });

  it('still consults approval for a downgraded write before an approved execution', async () => {
    const fake = new FakeGitHub();
    const onApprovalRequired = vi.fn(async (_req: ApprovalRequest) => true);
    const runner = createGithubRunner({
      transport: fake,
      approvalPolicy: { 'github.repo.branch.create': 'auto' },
      onApprovalRequired,
    });

    const outcome = await runner.run('approved write after attempted downgrade', {
      steps: [
        {
          action: 'github.repo.branch.create',
          input: { owner: 'o', repo: 'r', branch: 'approved-branch', from: 'sha-main' },
        },
      ],
    });

    expect(outcome.verdict).toBe('PASSED');
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
    expect(fake.writeRequests()).toHaveLength(1);
  });

  it('honors a caller policy that makes reads stricter than the default', async () => {
    const fake = new FakeGitHub();
    const onApprovalRequired = vi.fn(async (_req: ApprovalRequest) => false);
    const runner = createGithubRunner({
      transport: fake,
      approvalPolicy: { 'github.repo.read': 'approval' },
      onApprovalRequired,
    });

    const outcome = await runner.run('strict read', {
      steps: [{ action: 'github.repo.read', input: { owner: 'o', repo: 'r' } }],
    });

    expect(outcome.verdict).toBe('FAILED');
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
    expect(fake.requests).toEqual([]);
  });

  it('denies only the refused write and executes the explicitly approved ones', async () => {
    const fake = new FakeGitHub();
    const runner = createGithubRunner({
      transport: fake,
      onApprovalRequired: async (req) => req.action !== 'github.pull_request.create',
    });

    const outcome = await runner.run('write but no PR', {
      steps: [
        { action: 'github.repo.read', input: { owner: 'o', repo: 'r' } },
        { action: 'github.repo.branch.create', input: { owner: 'o', repo: 'r', branch: 'e2e', from: 'sha-main' } },
        { action: 'github.repo.file.write', input: { owner: 'o', repo: 'r', path: 'docs/x.md', branch: 'e2e', content: 'x', message: 'x' } },
        { action: 'github.pull_request.create', input: { owner: 'o', repo: 'r', title: 't', head: 'e2e', base: 'main' } },
      ],
    });

    expect(outcome.verdict).toBe('FAILED');
    expect(outcome.results.slice(0, 3).every((r) => r.status === 'success')).toBe(true);
    expect(outcome.results[3]?.status).toBe('failure');
    expect(fake.requests.some((r) => r.method === 'POST' && r.path.endsWith('/pulls'))).toBe(false);
  });

  it('executes the full slice when each write is explicitly approved (4 approvals, 0 for reads)', async () => {
    const fake = new FakeGitHub();
    const onApprovalRequired = vi.fn(async (_req: ApprovalRequest) => true);
    const runner = createGithubRunner({ transport: fake, onApprovalRequired });

    const outcome = await runner.run('full github slice', {
      steps: [
        { action: 'github.repo.read', input: { owner: 'o', repo: 'r' } },
        { action: 'github.repo.branch.create', input: { owner: 'o', repo: 'r', branch: 'e2e', from: 'sha-main' } },
        { action: 'github.repo.file.write', input: { owner: 'o', repo: 'r', path: 'docs/e2e-marker.md', branch: 'e2e', content: '# e2e', message: 'e2e' } },
        { action: 'github.git.commit', input: { owner: 'o', repo: 'r', branch: 'e2e', message: 'empty' } },
        { action: 'github.pull_request.create', input: { owner: 'o', repo: 'r', title: 't', head: 'e2e', base: 'main' } },
        { action: 'github.pull_request.read', input: { owner: 'o', repo: 'r', number: 1 } },
      ],
    });

    expect(outcome.verdict).toBe('PASSED');
    expect(onApprovalRequired).toHaveBeenCalledTimes(4);
    expect(onApprovalRequired.mock.calls.map(([req]) => req.action)).toEqual([
      'github.repo.branch.create',
      'github.repo.file.write',
      'github.git.commit',
      'github.pull_request.create',
    ]);
  });
});

describe('runGithubE2E (offline, via injected transport)', () => {
  const baseCfg = {
    owner: 'o',
    repo: 'r',
    branch: 'e2e-test',
    readPath: 'README.md',
    writePath: 'docs/e2e-marker.md',
    fileContent: '# e2e',
    commitMessage: 'e2e',
    prTitle: 'e2e',
  };

  it('refuses to run with neither token nor transport', async () => {
    await expect(runGithubE2E({ ...baseCfg })).rejects.toThrow('requires cfg.token or cfg.transport');
  });

  it('fails safely without approval — no write ever reaches GitHub', async () => {
    const fake = new FakeGitHub();
    const outcome = await runGithubE2E({ ...baseCfg, transport: fake });

    expect(outcome.verdict).toBe('FAILED');
    expect(fake.writeRequests()).toEqual([]);
    expect(outcome.ledgerEventTypes).toContain('ApprovalDenied');
    expect(outcome.executedActions).not.toContain('github.pull_request.create');
  });

  it('passes end-to-end with explicit approval for each write', async () => {
    const fake = new FakeGitHub();
    const onApprovalRequired = vi.fn(async () => true);
    const outcome = await runGithubE2E({ ...baseCfg, transport: fake, onApprovalRequired });

    expect(outcome.verdict).toBe('PASSED');
    expect(outcome.prNumber).toBe(1);
    expect(outcome.chainValid).toBe(true);
    expect(onApprovalRequired).toHaveBeenCalledTimes(4);
    for (const action of GITHUB_ACTIONS) expect(outcome.executedActions, action).toContain(action);
    expect(outcome.ledgerEventTypes.filter((t) => t === 'ApprovalGranted')).toHaveLength(4);
  });
});
