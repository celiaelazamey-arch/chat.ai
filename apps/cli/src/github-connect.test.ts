import { describe, it, expect } from 'vitest';
import { HttpGitHubTransport } from '@aok/github';
import {
  formatConnectionReport,
  githubTokenSource,
  githubTransportFromEnv,
  parseOwnerRepo,
  verifyGithubConnection,
} from './github-connect';

const SECRET = 'ghp_SENTINEL_SECRET_DO_NOT_PRINT';

type FetchImpl = typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch وهمي يلتقط الترويسات — لإثبات أن السر يسافر في الترويسة فقط ولا يظهر في أي مُخرج. */
function fakeFetch(captured: { authorization?: string }, opts: { repoStatus?: number; userStatus?: number } = {}): FetchImpl {
  return async (input, init) => {
    const url = String(input);
    captured.authorization = new Headers(init?.headers).get('Authorization') ?? undefined;
    if (url.endsWith('/user')) {
      return opts.userStatus === 401
        ? jsonResponse(401, { message: 'Bad credentials' })
        : jsonResponse(200, { login: 'elazamey' });
    }
    if (url.includes('/repos/')) {
      return opts.repoStatus === 404
        ? jsonResponse(404, { message: 'Not Found' })
        : jsonResponse(200, {
            full_name: 'elazamey/chat.ai',
            default_branch: 'main',
            permissions: { pull: true, push: true, admin: true },
          });
    }
    return jsonResponse(404, { message: 'Not Found' });
  };
}

describe('verifyGithubConnection — real check over the transport boundary', () => {
  it('verifies the authenticated user and repo permissions', async () => {
    const captured: { authorization?: string } = {};
    const transport = new HttpGitHubTransport('https://api.github.com', SECRET, fakeFetch(captured));

    const report = await verifyGithubConnection({ transport, owner: 'elazamey', repo: 'chat.ai' });

    expect(captured.authorization).toBe(`Bearer ${SECRET}`); // السر استُخدم في الترويسة…
    expect(report.connected).toBe(true);
    expect(report.login).toBe('elazamey');
    expect(report.repo).toEqual({
      fullName: 'elazamey/chat.ai',
      defaultBranch: 'main',
      permissions: { pull: true, push: true, admin: true },
    });
  });

  it('never leaks the credential into the report or its formatting', async () => {
    const captured: { authorization?: string } = {};
    const transport = new HttpGitHubTransport('https://api.github.com', SECRET, fakeFetch(captured));

    const report = await verifyGithubConnection({ transport, owner: 'elazamey', repo: 'chat.ai' });
    const printed = `${JSON.stringify(report)}\n${formatConnectionReport(report, 'GH_TOKEN')}`;

    expect(printed).not.toContain(SECRET); // …ولا يظهر أبدًا في أي مخرج
    expect(printed).toContain('credential source: GH_TOKEN');
    expect(printed).toContain('connected as elazamey');
  });

  it('reports NOT CONNECTED on 401 without leaking the credential', async () => {
    const captured: { authorization?: string } = {};
    const transport = new HttpGitHubTransport('https://api.github.com', SECRET, fakeFetch(captured, { userStatus: 401 }));

    const report = await verifyGithubConnection({ transport, owner: 'elazamey', repo: 'chat.ai' });

    expect(report.connected).toBe(false);
    expect(report.authenticated).toBe(false);
    expect(report.error).toContain('401');
    expect(`${JSON.stringify(report)}${formatConnectionReport(report, 'GH_TOKEN')}`).not.toContain(SECRET);
  });

  it('fails the check when the repo is inaccessible (404)', async () => {
    const captured: { authorization?: string } = {};
    const transport = new HttpGitHubTransport('https://api.github.com', SECRET, fakeFetch(captured, { repoStatus: 404 }));

    const report = await verifyGithubConnection({ transport, owner: 'x', repo: 'missing' });

    expect(report.connected).toBe(false);
    expect(report.error).toContain('404');
  });

  it('auth-only check (no repo) reports the login', async () => {
    const captured: { authorization?: string } = {};
    const transport = new HttpGitHubTransport('https://api.github.com', SECRET, fakeFetch(captured));

    const report = await verifyGithubConnection({ transport });

    expect(report).toEqual({ connected: true, authenticated: true, login: 'elazamey' });
  });
});

describe('credential resolution from the environment (no fake connections)', () => {
  it('returns undefined when no credential is configured', () => {
    expect(githubTokenSource({})).toBeUndefined();
    expect(githubTransportFromEnv({})).toBeUndefined();
  });

  it('prefers GH_TOKEN over GITHUB_TOKEN and reports only the source name', () => {
    expect(githubTokenSource({ GITHUB_TOKEN: 'x' })).toBe('GITHUB_TOKEN');
    expect(githubTokenSource({ GH_TOKEN: 'x', GITHUB_TOKEN: 'y' })).toBe('GH_TOKEN');
    expect(githubTransportFromEnv({ GH_TOKEN: 'x' })?.source).toBe('GH_TOKEN');
  });

  it('parses owner/repo, honors env defaults, and rejects malformed input', () => {
    expect(parseOwnerRepo('a/b')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseOwnerRepo(undefined, {})).toEqual({ owner: 'elazamey', repo: 'chat.ai' });
    expect(parseOwnerRepo(undefined, { CELIA_E2E_OWNER: 'me', CELIA_E2E_REPO: 'mine' })).toEqual({ owner: 'me', repo: 'mine' });
    expect(() => parseOwnerRepo('nope')).toThrow('owner/repo');
  });
});
