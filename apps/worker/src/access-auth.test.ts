import { generateKeyPairSync, sign as signData } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessConfigIsValid, authenticateAccessRequest } from './access-auth';

const teamDomain = 'security-tests.cloudflareaccess.com';
const audience = 'celia-staging-audience';
const issuer = `https://${teamDomain}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split('+').join('-').split('/').join('_').split('=').join('');
}

function makeToken(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const encodedHeader = encode({ alg: 'RS256', kid: 'test-key-1', ...header });
  const encodedClaims = encode({
    iss: issuer,
    aud: audience,
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  });
  const content = `${encodedHeader}.${encodedClaims}`;
  const signature = base64Url(signData('RSA-SHA256', new TextEncoder().encode(content), privateKey));
  return `${content}.${signature}`;
}

function makeRequest(token: string) {
  return new Request('https://celia-api.example.test/runs', {
    headers: { 'cf-access-jwt-assertion': token },
  });
}

const accessFetch = vi.fn<typeof fetch>().mockImplementation(async () =>
  Response.json({ keys: [jwk] }),
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Cloudflare Access JWT validation', () => {
  it('validates issuer, audience, expiry and RS256 signature then returns the subject', async () => {
    await expect(authenticateAccessRequest(makeRequest(makeToken()), teamDomain, audience, accessFetch))
      .resolves.toEqual({ subject: 'user-1' });
  });

  it('rejects an absent or malformed assertion', async () => {
    await expect(authenticateAccessRequest(new Request('https://example.test'), teamDomain, audience, accessFetch))
      .resolves.toBeNull();
    await expect(authenticateAccessRequest(makeRequest('not.a.jwt'), teamDomain, audience, accessFetch))
      .resolves.toBeNull();
  });

  it('rejects wrong issuer, audience, expired, premature, and subjectless claims', async () => {
    const invalidClaims = [
      { iss: 'https://attacker.example' },
      { aud: 'other-app' },
      { exp: Math.floor(Date.now() / 1000) - 120 },
      { nbf: Math.floor(Date.now() / 1000) + 120 },
      { sub: '' },
    ];
    for (const claims of invalidClaims) {
      await expect(authenticateAccessRequest(makeRequest(makeToken(claims)), teamDomain, audience, accessFetch))
        .resolves.toBeNull();
    }
  });

  it('rejects an altered signature and unsupported algorithm', async () => {
    const valid = makeToken();
    const [header, payload, signature] = valid.split('.');
    const changedSignature = `${header}.${payload}.${signature!.startsWith('A') ? 'B' : 'A'}${signature!.slice(1)}`;
    await expect(authenticateAccessRequest(makeRequest(changedSignature), teamDomain, audience, accessFetch))
      .resolves.toBeNull();
    await expect(authenticateAccessRequest(makeRequest(makeToken({}, { alg: 'none' })), teamDomain, audience, accessFetch))
      .resolves.toBeNull();
  });

  it('throttles forced JWKS refreshes for unknown key IDs', async () => {
    const domain = 'unknown-kid.cloudflareaccess.com';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ keys: [jwk] }));
    const unknownKidToken = makeToken({}, { kid: 'attacker-selected-kid' });

    await expect(authenticateAccessRequest(makeRequest(unknownKidToken), domain, audience, fetchMock)).resolves.toBeNull();
    await expect(authenticateAccessRequest(makeRequest(unknownKidToken), domain, audience, fetchMock)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throttles repeated unknown-key refreshes when the certificate endpoint fails', async () => {
    const domain = 'unknown-kid-outage.cloudflareaccess.com';
    const initialFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ keys: [jwk] }));
    await expect(authenticateAccessRequest(makeRequest(makeToken({ iss: `https://${domain}` })), domain, audience, initialFetch))
      .resolves.toEqual({ subject: 'user-1' });

    const nextTime = Date.now() + 301_000;
    vi.useFakeTimers();
    vi.setSystemTime(nextTime);
    const failingFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('certificate endpoint unavailable'));
    const unknownKidToken = makeToken({}, { kid: 'unknown-during-outage' });
    await expect(authenticateAccessRequest(makeRequest(unknownKidToken), domain, audience, failingFetch)).resolves.toBeNull();
    await expect(authenticateAccessRequest(makeRequest(unknownKidToken), domain, audience, failingFetch)).resolves.toBeNull();
    expect(failingFetch).toHaveBeenCalledOnce();
  });

  it('rejects oversized tokens and fails closed when certificates cannot be fetched', async () => {
    await expect(authenticateAccessRequest(makeRequest('x'.repeat(16_385)), teamDomain, audience, accessFetch))
      .resolves.toBeNull();
    await expect(authenticateAccessRequest(makeRequest(makeToken()), 'unavailable.cloudflareaccess.com', audience,
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))).resolves.toBeNull();
  });

  it('rejects invalid configuration rather than accepting URL-shaped domains', () => {
    expect(accessConfigIsValid(teamDomain, audience)).toBe(true);
    expect(accessConfigIsValid('https://team.cloudflareaccess.com', audience)).toBe(false);
    expect(accessConfigIsValid('team.cloudflareaccess.com', undefined)).toBe(false);
    expect(accessConfigIsValid('team..cloudflareaccess.com', audience)).toBe(false);
  });
});
