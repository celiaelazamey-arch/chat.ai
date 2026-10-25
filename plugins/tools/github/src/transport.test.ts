import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecretRef, VaultAdapter } from '@aok/contracts';
import { resolveToken, tokenFromEnv } from './credentials';
import { GitHubRequestError, GitHubResponseTooLargeError, HttpGitHubTransport } from './transport';

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

  it('redacts the bearer token, strips control characters, and caps upstream error text', async () => {
    const secret = 'token-that-must-not-leak';
    const transport = new HttpGitHubTransport('https://api.github.com', secret,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        message: `upstream echoed ${secret}\n${'x'.repeat(800)}`,
      }), { status: 500 })));
    let caught: unknown;
    try {
      await transport.request('GET', '/status');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubRequestError);
    const message = (caught as Error).message;
    expect(message).not.toContain(secret);
    expect(message).toContain('[REDACTED]');
    expect(message).not.toMatch(/[\r\n]/);
    expect(message.length).toBeLessThan(560);
  });

  it('uses plain response text when an error body is not JSON', async () => {
    const transport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('upstream unavailable', { status: 502 })), { maxGetRetries: 0 });
    await expect(transport.request('GET', '/status')).rejects.toBeInstanceOf(GitHubRequestError);
    const failingTransport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('upstream unavailable', { status: 502 })), { maxGetRetries: 0 });
    await expect(failingTransport.request('GET', '/status')).rejects.toThrow('GitHub API 502 on /status: upstream unavailable');
  });

  it('retries a rate-limited GET only when GitHub supplies a safe retry hint', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'slow down' }), { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const transport = new HttpGitHubTransport('https://api.github.com', 'token', fetchMock, {
      maxGetRetries: 1,
      maxRetryDelayMs: 0,
    });
    await expect(transport.request('GET', '/repos/o/r/issues')).resolves.toEqual({ status: 200, json: { items: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a write request after a rate-limit response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ message: 'slow down' }), { status: 429, headers: { 'retry-after': '0' } },
    ));
    const transport = new HttpGitHubTransport('https://api.github.com', 'token', fetchMock, {
      maxGetRetries: 3,
      maxRetryDelayMs: 0,
    });
    await expect(transport.request('POST', '/repos/o/r/pulls', { body: { title: 'draft' } }))
      .rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces the response byte limit even if the response is chunked', async () => {
    const transport = new HttpGitHubTransport('https://api.github.com', 'token',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ content: 'more than 8 bytes' }), { status: 200 })),
      { maxResponseBytes: 8 },
    );
    await expect(transport.request('GET', '/large')).rejects.toBeInstanceOf(GitHubResponseTooLargeError);
  });

  it('adds a bounded abort signal to every request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = new HttpGitHubTransport('https://api.github.com', 'token', fetchMock, { timeoutMs: 1234 });
    await transport.request('GET', '/bounded');
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
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
