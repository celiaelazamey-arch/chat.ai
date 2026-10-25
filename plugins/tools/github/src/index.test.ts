import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  GitHubPlugin,
  GITHUB_ACTIONS,
  GitHubRequestError,
} from './index';
import type { GitHubResponse, GitHubRequestOptions, GitHubTransport } from './index';
import { ExecutorRegistry, createExecutionContext } from '@aok/execution';
import { validateCapabilityName } from '@aok/contracts';
import { fileRead } from './operations';
import { vi } from 'vitest';

/** نقل وهمي (offline) — يحاكي مسارات GitHub المستخدمة في الـE2E. */
class FakeGitHub implements GitHubTransport {
  refs = new Map<string, string>();
  files = new Map<string, { content: string; sha: string }>();
  prs: Record<number, Record<string, unknown>> = {};
  prCounter = 0;

  constructor() {
    this.refs.set('refs/heads/main', 'sha-main');
  }

  async request(method: string, path: string, opts?: GitHubRequestOptions): Promise<GitHubResponse> {
    const body = (opts?.body ?? {}) as Record<string, unknown>;
    if (method === 'GET' && path.includes('/issues?')) {
      return { status: 200, json: [
        { number: 12, title: 'bug', body: 'untrusted issue text', state: 'open', html_url: 'https://github.com/o/r/issues/12', user: { login: 'reporter' }, labels: [{ name: 'aok:ready' }], updated_at: '2026-10-24T00:00:00Z' },
        { number: 13, title: 'pull request', pull_request: { url: 'api' } },
      ] };
    }
    if (method === 'GET' && /\/issues\/\d+$/.test(path)) {
      if (path.endsWith('/13')) return { status: 200, json: { number: 13, title: 'PR', pull_request: { url: 'api' } } };
      return { status: 200, json: { number: 12, title: 'bug', body: 'untrusted issue text', state: 'open', html_url: 'https://github.com/o/r/issues/12', user: { login: 'reporter' }, labels: [{ name: 'aok:ready' }], updated_at: '2026-10-24T00:00:00Z' } };
    }
    // GET /repos/{o}/{r}
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(path)) {
      return { status: 200, json: { full_name: 'o/r', default_branch: 'main' } };
    }
    // GET /git/ref/heads/{branch}
    if (method === 'GET' && path.includes('/git/ref/heads/')) {
      const branch = 'refs/heads/' + path.split('/git/ref/heads/')[1];
      return { status: 200, json: { ref: branch, object: { sha: this.refs.get(branch) ?? 'sha-main' } } };
    }
    // POST /git/refs (create branch)
    if (method === 'POST' && path.endsWith('/git/refs')) {
      const ref = body.ref as string;
      this.refs.set(ref, body.sha as string);
      return { status: 201, json: { ref, object: { sha: body.sha } } };
    }
    // GET contents (file read)
    if (method === 'GET' && path.includes('/contents/')) {
      const key = path.split('/contents/')[1] ?? '';
      const file = this.files.get(key) ?? { content: Buffer.from('hello', 'utf8').toString('base64'), sha: 'sha-file' };
      return { status: 200, json: { content: file.content, sha: file.sha } };
    }
    // PUT contents (file write → commit)
    if (method === 'PUT' && path.includes('/contents/')) {
      const key = path.split('/contents/')[1] ?? '';
      const content = Buffer.from((body.content as string) ?? '', 'base64').toString('utf8');
      this.files.set(key, { content: (body.content as string), sha: 'sha-file-2' });
      return { status: 201, json: { commit: { sha: 'sha-commit-1' }, content: { sha: 'sha-file-2' } } };
    }
    // GET /git/commits/{sha}
    if (method === 'GET' && path.includes('/git/commits/')) {
      return { status: 200, json: { tree: { sha: 'tree-1' }, parents: [{ sha: 'sha-commit-1' }] } };
    }
    // POST /git/commits
    if (method === 'POST' && path.endsWith('/git/commits')) {
      return { status: 201, json: { sha: 'sha-commit-2' } };
    }
    // PATCH /git/refs/heads/{branch}
    if (method === 'PATCH' && path.includes('/git/refs/heads/')) {
      const branch = 'refs/heads/' + path.split('/git/refs/heads/')[1];
      this.refs.set(branch, body.sha as string);
      return { status: 200, json: { sha: body.sha } };
    }
    // POST /pulls
    if (method === 'POST' && path.endsWith('/pulls')) {
      const number = ++this.prCounter;
      this.prs[number] = {
        number,
        html_url: `https://github.com/o/r/pull/${number}`,
        head: { sha: 'sha-commit-2', ref: body.head },
        base: { ref: body.base },
        state: 'open',
        title: body.title,
        draft: body.draft,
      };
      return { status: 201, json: this.prs[number] };
    }
    // GET /pulls/{n}/files
    if (method === 'GET' && /\/pulls\/\d+\/files$/.test(path)) {
      return { status: 200, json: [{ filename: 'docs/e2e-marker.md', status: 'added' }] };
    }
    // GET /pulls/{n}
    if (method === 'GET' && /\/pulls\/\d+$/.test(path)) {
      const n = Number(path.split('/pulls/')[1]);
      return { status: 200, json: this.prs[n] ?? {} };
    }
    throw new GitHubRequestError(404, 'not found (fake)', path);
  }
}

describe('GitHubPlugin — capability names follow the convention', () => {
  it('all registered actions are valid names (no reserved namespace)', () => {
    for (const a of GITHUB_ACTIONS) {
      expect(validateCapabilityName(a).valid, a).toBe(true);
    }
  });

  it('registers schemas for every action', () => {
    const plugin = new GitHubPlugin(new FakeGitHub());
    for (const a of GITHUB_ACTIONS) {
      expect(plugin.schemaRegistry.hasCapability(a), a).toBe(true);
    }
  });
});

describe('GitHub API path safety', () => {
  it('rejects traversal paths before making a request', async () => {
    const request = vi.fn<GitHubTransport['request']>();
    await expect(fileRead({ request }, { owner: 'o', repo: 'r', path: '../secret' }))
      .rejects.toThrow('Invalid repository file path');
    await expect(fileRead({ request }, { owner: 'o', repo: 'r', path: 'safe/../../secret' }))
      .rejects.toThrow('Invalid repository file path');
    expect(request).not.toHaveBeenCalled();
  });

  it('encodes path segments so delimiters cannot escape the file path', async () => {
    const request = vi.fn<GitHubTransport['request']>().mockResolvedValue({
      status: 200,
      json: { content: Buffer.from('safe').toString('base64'), sha: 'sha' },
    });
    await fileRead({ request }, { owner: 'o', repo: 'r', path: 'docs/a?b#c.md' });
    expect(request).toHaveBeenCalledWith('GET', '/repos/o/r/contents/docs/a%3Fb%23c.md');
  });

  it('rejects invalid repository coordinates before making a request', async () => {
    const request = vi.fn<GitHubTransport['request']>();
    await expect(fileRead({ request }, { owner: 'o/attacker', repo: 'r', path: 'README.md' }))
      .rejects.toThrow('Invalid GitHub owner');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('GitHubPlugin — offline vertical slice through the unified execute()', () => {
  async function runSlice() {
    const fake = new FakeGitHub();
    const plugin = new GitHubPlugin(fake);
    const executors = new ExecutorRegistry();
    plugin.register(executors);

    const ctx = createExecutionContext({
      runId: 'r1',
      actorId: 'coder',
      capabilities: GITHUB_ACTIONS.map((action) => ({ id: action, action, scope: '*', constraints: [] })),
    });

    // استيراد execute من الـkernel (مفصول عن الـplugin)
    const { execute } = await import('@aok/execution');

    const repo = await execute('github.repo.read', { owner: 'o', repo: 'r' }, ctx, executors);
    expect(repo.status).toBe('success');

    const branch = await execute(
      'github.repo.branch.create',
      { owner: 'o', repo: 'r', branch: 'e2e', from: (repo.output as { defaultBranchSha: string }).defaultBranchSha },
      ctx,
      executors,
    );
    expect(branch.status).toBe('success');

    const write = await execute(
      'github.repo.file.write',
      { owner: 'o', repo: 'r', path: 'docs/e2e-marker.md', branch: 'e2e', content: '# e2e', message: 'e2e change' },
      ctx,
      executors,
    );
    expect(write.status).toBe('success');
    expect(write.evidence[0]?.kind).toBe('git_commit');

    const pr = await execute(
      'github.pull_request.create',
      { owner: 'o', repo: 'r', title: 'e2e', head: 'e2e', base: 'main' },
      ctx,
      executors,
    );
    expect(pr.status).toBe('success');
    return { pr, write, branch, repo, fake };
  }

  it('executes repo.read → branch.create → file.write → pr.create with evidence', async () => {
    const { pr, write, fake } = await runSlice();
    expect(pr.status).toBe('success');
    expect(fake.prs[1]?.draft).toBe(true);
    expect(write.evidence).toHaveLength(1);
    expect((pr.output as { number: number }).number).toBe(1);
  });

  it('validates input schemas (no execution without contract)', async () => {
    const plugin = new GitHubPlugin(new FakeGitHub());
    const executors = new ExecutorRegistry();
    plugin.register(executors);
    const { execute } = await import('@aok/execution');
    const ctx = createExecutionContext({
      runId: 'r1',
      actorId: 'coder',
      capabilities: [{ id: 'x', action: 'github.repo.read', scope: '*', constraints: [] }],
    });
    const res = await execute('github.repo.read', { bad: 'input' }, ctx, executors);
    expect(res.status).toBe('failure');
  });

  it('reads Issues as untrusted input and excludes pull requests from the issue list', async () => {
    const plugin = new GitHubPlugin(new FakeGitHub());
    const executors = new ExecutorRegistry();
    plugin.register(executors);
    const { execute } = await import('@aok/execution');
    const ctx = createExecutionContext({
      runId: 'issue-run',
      actorId: 'triager',
      capabilities: ['github.issue.list', 'github.issue.read'].map((action) => ({ id: action, action, scope: '*', constraints: [] })),
    });
    const listed = await execute('github.issue.list', { owner: 'o', repo: 'r', labels: ['aok:ready'] }, ctx, executors);
    expect(listed.status).toBe('success');
    expect((listed.output as { issues: { number: number; body: string | null }[] }).issues)
      .toEqual([{ number: 12, title: 'bug', body: 'untrusted issue text', bodyTruncated: false, state: 'open', url: 'https://github.com/o/r/issues/12', author: 'reporter', labels: ['aok:ready'], updatedAt: '2026-10-24T00:00:00Z' }]);
    const read = await execute('github.issue.read', { owner: 'o', repo: 'r', number: 12 }, ctx, executors);
    expect(read.status).toBe('success');
    expect((read.output as { body: string }).body).toBe('untrusted issue text');
    const pullRequestNumber = await execute('github.issue.read', { owner: 'o', repo: 'r', number: 13 }, ctx, executors);
    expect(pullRequestNumber.status).toBe('failure');
    expect(listed.evidence[0]?.kind).toBe('http_check');
  });

  it('pr.read returns the diff (files) for verification', async () => {
    const plugin = new GitHubPlugin(new FakeGitHub());
    const executors = new ExecutorRegistry();
    plugin.register(executors);
    const { execute } = await import('@aok/execution');
    const ctx = createExecutionContext({
      runId: 'r1',
      actorId: 'coder',
      capabilities: GITHUB_ACTIONS.map((a) => ({ id: a, action: a, scope: '*', constraints: [] })),
    });
    // create then read
    await execute('github.pull_request.create', { owner: 'o', repo: 'r', title: 't', head: 'h', base: 'main' }, ctx, executors);
    const read = await execute('github.pull_request.read', { owner: 'o', repo: 'r', number: 1 }, ctx, executors);
    expect(read.status).toBe('success');
    expect((read.output as { files: { filename: string }[] }).files[0]?.filename).toBe('docs/e2e-marker.md');
  });

  it('uses the reserved-namespace-safe SchemaRegistry (zod)', () => {
    const plugin = new GitHubPlugin(new FakeGitHub());
    expect(() => plugin.schemaRegistry.validateCapabilityInput('github.repo.read', {})).toThrow(z.ZodError);
  });
});
