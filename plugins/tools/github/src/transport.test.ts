import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecretRef, VaultAdapter } from '@aok/contracts';
import { resolveToken, tokenFromEnv } from './credentials';
import { GitHubRequestError, HttpGitHubTransport } from './transport';

afterEach(() => vi.unstubAllEnvs());

describe('HttpGitHubTransport', () => {
  it('sends GitHub headers and JSON body, then parses a successful response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ id: 42 }), { status: 201 },
    ));
    const transport = new HttpGitHubTransport('https://api.github.com', 'secret-token', fetchMock);

    await expect(transport.request('POST', '/repos/o/r/issues', { body: { title: 'bug' } }))
      .resolves.toEqual({ status: 201, json: { id: 42 } });
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/o/r/issues', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret-token',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }),
      body: JSON.stringify({ title: 'bug' }),
    }));
  });

  it('handles empty and non-JSON successful responses', async () => {
    const empty = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(empty.request('DELETE', '/resource')).resolves.toEqual({ status: 204, json: undefined });

    const text = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('accepted', { status: 200 })));
    await expect(text.request('GET', '/resource')).resolves.toEqual({ status: 200, json: 'accepted' });
  });

  it('normalizes GitHub API errors and preserves status and path', async () => {
    const transport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: 'rate limited' }), { status: 403 })));
    await expect(transport.request('GET', '/rate')).rejects.toMatchObject({
      name: 'GitHubRequestError', status: 403, path: '/rate', message: 'GitHub API 403 on /rate: rate limited',
    });
  });

  it('uses plain response text when an error body is not JSON', async () => {
    const transport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('upstream unavailable', { status: 502 })));
    await expect(transport.request('GET', '/status')).rejects.toBeInstanceOf(GitHubRequestError);
    const failingTransport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('upstream unavailable', { status: 502 })));
    await expect(failingTransport.request('GET', '/status')).rejects.toThrow('GitHub API 502 on /status: upstream unavailable');
  });

  it('propagates transport failures without disguising them as HTTP responses', async () => {
    const offline = new Error('network offline');
    const transport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockRejectedValue(offline));
    await expect(transport.request('GET', '/repos/o/r')).rejects.toBe(offline);
  });
});

describe('GitHub credential boundary', () => {
  it('resolves short-lived credentials through the vault with the requested principal', async () => {
    const ref: SecretRef = { id: 'ref-1', vault: 'test-vault', key: 'github/token' };
    const vault: VaultAdapter = { resolve: vi.fn().mockResolvedValue({ value: 'short-lived-token', expiresAt: '2026-10-24T12:00:00Z' }) };
    await expect(resolveToken(ref, vault, 'agent-1')).resolves.toBe('short-lived-token');
    expect(vault.resolve).toHaveBeenCalledWith(ref, 'agent-1');
  });

  it('prefers GH_TOKEN, falls back to GITHUB_TOKEN, and allows no token', () => {
    const originalGhToken = process.env.GH_TOKEN;
    const originalGithubToken = process.env.GITHUB_TOKEN;
    try {
      process.env.GH_TOKEN = 'preferred';
      process.env.GITHUB_TOKEN = 'fallback';
      expect(tokenFromEnv()).toBe('preferred');
      delete process.env.GH_TOKEN;
      expect(tokenFromEnv()).toBe('fallback');
      delete process.env.GITHUB_TOKEN;
      expect(tokenFromEnv()).toBeUndefined();
    } finally {
      if (originalGhToken === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = originalGhToken;
      if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalGithubToken;
    }
  });
});
