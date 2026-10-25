import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRequestOptions, GitHubResponse, GitHubTransport } from '@aok/github';
import { githubIssueReadConfig, parseGithubIssueCommand, parseGithubRepositoryTarget, readGithubIssues } from './github-issues';

afterEach(() => vi.unstubAllEnvs());

class FakeIssueTransport implements GitHubTransport {
  calls: { method: string; path: string; options?: GitHubRequestOptions }[] = [];

  async request(method: string, path: string, options?: GitHubRequestOptions): Promise<GitHubResponse> {
    this.calls.push({ method, path, options });
    const issue = {
      number: 7,
      title: 'untrusted title',
      body: `untrusted body${String.fromCharCode(27)}[31m`,
      state: 'open',
      html_url: 'https://github.com/acme/widget/issues/7',
      user: { login: 'reporter' },
      labels: [{ name: 'aok:ready' }],
      updated_at: '2026-10-24T00:00:00Z',
    };
    if (method !== 'GET') throw new Error(`unexpected method ${method}`);
    if (path.includes('/issues?')) return { status: 200, json: [issue, { ...issue, number: 8, pull_request: { url: 'pr' } }] };
    if (path.endsWith('/issues/7')) return { status: 200, json: issue };
    throw new Error(`unexpected path ${path}`);
  }
}

const config = { token: 'private-token', allowedRepositories: ['acme/widget'] };
const target = parseGithubRepositoryTarget('acme/widget')!;

describe('GitHub CLI argument parser', () => {
  it.each(['1', '7'])('accepts a valid issue number %s', (value) => {
    expect(parseGithubIssueCommand(['issue', 'acme/widget', value])).toEqual({
      kind: 'read',
      target,
      issueNumber: Number(value),
    });
  });

  it.each(['', '0', '-1', '1.5', 'seven', '9007199254740992'])('rejects an invalid issue number %s', (value) => {
    expect(() => parseGithubIssueCommand(['issue', 'acme/widget', value])).toThrow('positive issue number');
  });

  it('rejects extra arguments and malformed targets, while accepting list states', () => {
    expect(() => parseGithubIssueCommand(['issue', 'acme/widget', '7', 'extra'])).toThrow('extra');
    expect(() => parseGithubIssueCommand(['issue', '../repo', '7'])).toThrow('owner/repo');
    expect(parseGithubIssueCommand(['issues', 'acme/widget', 'closed'])).toEqual({ kind: 'list', target, state: 'closed' });
    expect(parseGithubIssueCommand(['models'])).toBeUndefined();
  });
});

describe('read-only GitHub issue intake', () => {
  it('requires both a token and an explicit repository allowlist', () => {
    expect(githubIssueReadConfig({})).toBeUndefined();
    expect(githubIssueReadConfig({ GH_TOKEN: 'token' })).toBeUndefined();
    expect(githubIssueReadConfig({ GITHUB_TOKEN: 'token', CELIA_GITHUB_ALLOWED_REPOSITORIES: ' acme/widget,acme/widget ' }))
      .toEqual({ token: 'token', allowedRepositories: ['acme/widget'] });
    expect(githubIssueReadConfig({ GH_TOKEN: ' preferred ', GITHUB_TOKEN: 'fallback', CELIA_GITHUB_ALLOWED_REPOSITORIES: 'ACME/widget' }))
      .toEqual({ token: 'preferred', allowedRepositories: ['acme/widget'] });
  });

  it('accepts one explicit owner/repo and rejects malformed targets', () => {
    expect(parseGithubRepositoryTarget('acme/widget')).toEqual({ owner: 'acme', repo: 'widget', fullName: 'acme/widget' });
    expect(parseGithubRepositoryTarget('acme/widget/extra')).toBeUndefined();
    expect(parseGithubRepositoryTarget('../widget')).toBeUndefined();
    expect(parseGithubRepositoryTarget('acme/..')).toBeUndefined();
  });

  it('reads allowlisted Issues through the ledger and never issues a write request', async () => {
    const transport = new FakeIssueTransport();
    const result = await readGithubIssues(config, target, { state: 'open', perPage: 10 }, transport);
    expect(result).toMatchObject({ repository: 'acme/widget', action: 'github.issue.list', verdict: 'PASSED', ledgerIntegrity: true });
    expect((result.output as { issues: { number: number }[] }).issues.map((issue) => issue.number)).toEqual([7]);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({ method: 'GET' });
    expect(transport.calls[0]?.path).toContain('per_page=10');
    expect(JSON.stringify(result)).not.toContain('private-token');
    // JSON output escapes terminal control characters in untrusted issue content.
    expect(JSON.stringify(result)).not.toContain(String.fromCharCode(27));
    expect(JSON.stringify(result)).toContain(String.raw`\u001b`);
  });

  it('reads one Issue by number and rejects a repository outside the allowlist before network access', async () => {
    const transport = new FakeIssueTransport();
    const result = await readGithubIssues(config, target, { issueNumber: 7 }, transport);
    expect(result.action).toBe('github.issue.read');
    expect(transport.calls[0]?.path).toBe('/repos/acme/widget/issues/7');
    await expect(readGithubIssues(config, parseGithubRepositoryTarget('other/repo')!, {}, transport))
      .rejects.toThrow('not allowlisted');
    expect(transport.calls).toHaveLength(1);
  });

  it('rejects invalid Issue numbers before network access', async () => {
    const transport = new FakeIssueTransport();
    await expect(readGithubIssues(config, target, { issueNumber: 0 }, transport)).rejects.toThrow('positive integer');
    expect(transport.calls).toHaveLength(0);
  });
});
