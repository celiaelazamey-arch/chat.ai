const MAX_ASSERTION_LENGTH = 16 * 1024;
const CLOCK_SKEW_SECONDS = 60;
const CERT_CACHE_TTL_MS = 5 * 60 * 1000;
const CERT_REFRESH_COOLDOWN_MS = 30 * 1000;
const ACCESS_ASSERTION_HEADER = 'cf-access-jwt-assertion';

type AccessJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type AccessClaims = { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown; nbf?: unknown };
type CertCacheEntry = { keys: AccessJwk[]; expiresAt: number };

const certCache = new Map<string, CertCacheEntry>();
const certRefreshAttemptAt = new Map<string, number>();
const certRefreshInFlight = new Map<string, Promise<AccessJwk[]>>();

export interface AccessIdentity {
  subject: string;
}

export function accessConfigIsValid(teamDomain: string | undefined, audience: string | undefined): boolean {
  return Boolean(
    teamDomain &&
    /^[a-z0-9.-]+$/i.test(teamDomain) &&
    !teamDomain.startsWith('.') &&
    !teamDomain.endsWith('.') &&
    !teamDomain.includes('..') &&
    audience?.trim(),
  );
}

export async function authenticateAccessRequest(
  request: Request,
  teamDomain: string,
  audience: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessIdentity | null> {
  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER);
  if (!assertion || assertion.length > MAX_ASSERTION_LENGTH) return null;

  try {
    const parts = assertion.split('.');
    if (parts.length !== 3) return null;
    const header = decodeJson<{ alg?: unknown; kid?: unknown }>(parts[0]!);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null;

    const domain = teamDomain.toLowerCase();
    const issuer = `https://${domain}`;
    let keys = await loadAccessKeys(domain, fetchImpl, false);
    let jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.alg === 'RS256' && candidate.use === 'sig');
    if (!jwk) {
      keys = await loadAccessKeys(domain, fetchImpl, true);
      jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.alg === 'RS256' && candidate.use === 'sig');
    }
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const signature = decodeBase64Url(parts[2]!);
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
    if (!validSignature) return null;

    const claims = decodeJson<AccessClaims>(parts[1]!);
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== issuer || !hasAudience(claims.aud, audience)) return null;
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) return null;
    if (typeof claims.exp !== 'number' || claims.exp <= now - CLOCK_SKEW_SECONDS) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now + CLOCK_SKEW_SECONDS) return null;
    return { subject: claims.sub };
  } catch {
    return null;
  }
}

async function loadAccessKeys(domain: string, fetchImpl: typeof fetch, forceRefresh: boolean): Promise<AccessJwk[]> {
  const cached = certCache.get(domain);
  const now = Date.now();
  if (cached && cached.expiresAt > now && !forceRefresh) return cached.keys;

  const inFlight = certRefreshInFlight.get(domain);
  if (inFlight) return inFlight;

  const lastAttemptAt = certRefreshAttemptAt.get(domain);
  if (lastAttemptAt !== undefined && now - lastAttemptAt < CERT_REFRESH_COOLDOWN_MS) {
    if (cached && cached.expiresAt > now) return cached.keys;
    throw new Error('Access certificate refresh is cooling down');
  }

  // Record attempts as well as successes so an upstream outage cannot turn each
  // unknown key ID into another outbound certificate request.
  certRefreshAttemptAt.set(domain, now);
  const refresh = (async (): Promise<AccessJwk[]> => {
    const response = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Access certificate request failed');
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('keys' in body) || !Array.isArray(body.keys)) {
      throw new Error('Invalid Access certificate response');
    }
    const keys = body.keys.filter(isAccessJwk);
    if (keys.length === 0) throw new Error('No usable Access signing keys');
    certCache.set(domain, { keys, expiresAt: Date.now() + CERT_CACHE_TTL_MS });
    return keys;
  })();
  certRefreshInFlight.set(domain, refresh);
  try {
    return await refresh;
  } finally {
    if (certRefreshInFlight.get(domain) === refresh) certRefreshInFlight.delete(domain);
  }
}

function isAccessJwk(value: unknown): value is AccessJwk {
  if (typeof value !== 'object' || value === null) return false;
  const key = value as AccessJwk;
  return key.kty === 'RSA' && typeof key.kid === 'string' && key.alg === 'RS256' && key.use === 'sig';
}

function hasAudience(value: unknown, expected: string): boolean {
  return typeof value === 'string' ? value === expected : Array.isArray(value) && value.includes(expected);
}

function decodeJson<T>(segment: string): T {
  const bytes = decodeBase64Url(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
