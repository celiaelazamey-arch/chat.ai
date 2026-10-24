import { generateKeyPairSync, sign as signData } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import worker from './index';
import { consumeFixedWindow, getRun, listRunsByTask, listTasks, pageSize } from './storage';

type Statement = {
  bind: (...values: unknown[]) => Statement;
  all: <T>() => Promise<{ results: T[] }>;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

const TEAM_DOMAIN = 'worker-tests.cloudflareaccess.com';
const ACCESS_AUD = 'celia-test-audience';
const ACCESS_ISSUER = `https://${TEAM_DOMAIN}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const accessJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'worker-test-key', alg: 'RS256', use: 'sig' };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split('+').join('-').split('/').join('_').split('=').join('');
}

function accessAssertion(subject = 'user-1', overrides: Record<string, unknown> = {}): string {
  const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const header = encode({ alg: 'RS256', kid: 'worker-test-key' });
  const payload = encode({
    iss: ACCESS_ISSUER,
    aud: ACCESS_AUD,
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  });
  const message = `${header}.${payload}`;
  return `${message}.${base64Url(signData('RSA-SHA256', new TextEncoder().encode(message), privateKey))}`;
}

function fakeDatabase(
  rows: Record<string, string>[] = [],
  writes: { count: number } = { count: 0 },
  failure?: Error,
): D1Database {
  let query = '';
  let bindings: unknown[] = [];
  const counters = new Map<string, { windowStart: number; count: number }>();
  const matchingRows = () => {
    let result = rows;
    if (query.includes('owner_id = ?')) {
      const ownerIndex = query.includes('task_id = ? AND owner_id = ?') || query.includes('run_id = ? AND owner_id = ?') ? 1 : 0;
      result = result.filter((row) => row.owner_id === bindings[ownerIndex]);
    }
    if (query.includes('WHERE run_id = ?')) result = result.filter((row) => row.run_id === bindings[0]);
    return result;
  };
  const statement: Statement = {
    bind: (...values) => { bindings = values; return statement; },
    all: async <T>() => {
      if (failure) throw failure;
      return { results: matchingRows() as T[] };
    },
    first: async <T>() => {
      if (failure) throw failure;
      if (query.includes('INSERT INTO request_limits')) {
        const [key, windowStart, limit] = bindings as [string, number, number];
        const current = counters.get(key);
        if (current?.windowStart === windowStart && current.count >= limit) return null;
        const next = { windowStart, count: current?.windowStart === windowStart ? current.count + 1 : 1 };
        counters.set(key, next);
        return { request_count: next.count } as T;
      }
      return (matchingRows()[0] as T | undefined) ?? null;
    },
    run: async () => {
      if (failure) throw failure;
      writes.count += 1;
      return { success: true };
    },
  };
  return { prepare: (sql: string) => { query = sql; bindings = []; return statement; } } as unknown as D1Database;
}

function request(path: string, init?: RequestInit, subject = 'user-1'): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has('cf-access-jwt-assertion')) headers.set('cf-access-jwt-assertion', accessAssertion(subject));
  return new Request(`https://example.com${path}`, { ...init, headers });
}

function unauthenticatedRequest(path: string): Request {
  return new Request(`https://example.com${path}`);
}

const accessEnv = { ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ keys: [accessJwk] })));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('worker protocol and error boundaries', () => {
  it('reports health mode and persistence readiness without exposing secrets', async () => {
    const local = await worker.fetch(request('/health'), { CELIA_MODE: 'local' });
    expect(local.status).toBe(200);
    await expect(local.json()).resolves.toEqual({
      status: 'ok', service: 'celia-worker', mode: 'local', persistence: 'unavailable',
    });

    const cloud = await worker.fetch(request('/health'), { CELIA_MODE: 'cloud', DB: fakeDatabase() });
    await expect(cloud.json()).resolves.toMatchObject({ mode: 'cloud', persistence: 'd1' });
  });

  it('answers preflight and only advertises the allowlisted console origin', async () => {
    const allowed = await worker.fetch(request('/', {
      method: 'OPTIONS', headers: { origin: 'https://celia-console.pages.dev' },
    }), {});
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://celia-console.pages.dev');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(allowed.headers.get('vary')).toBe('Origin');

    const staging = await worker.fetch(request('/', {
      method: 'OPTIONS', headers: { origin: 'https://staging-console.example.test' },
    }), { CONSOLE_ORIGIN: 'https://staging-console.example.test' });
    expect(staging.headers.get('access-control-allow-origin')).toBe('https://staging-console.example.test');

    const untrusted = await worker.fetch(request('/', {
      method: 'OPTIONS', headers: { origin: 'https://attacker.example' },
    }), {});
    expect(untrusted.headers.get('access-control-allow-origin')).not.toBe('https://attacker.example');
  });

  it('requires a valid Cloudflare Access identity and fails closed when auth config is missing', async () => {
    const env = { ...accessEnv, DB: fakeDatabase() };
    const missing = await worker.fetch(unauthenticatedRequest('/tasks'), env);
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({ error: 'unauthorized' });

    const invalid = await worker.fetch(request('/tasks', {
      headers: { 'cf-access-jwt-assertion': 'forged.token.value' },
    }), env);
    expect(invalid.status).toBe(401);

    const unconfigured = await worker.fetch(request('/tasks'), { DB: fakeDatabase() });
    expect(unconfigured.status).toBe(503);
    await expect(unconfigured.json()).resolves.toEqual({ error: 'authentication is not configured' });
  });

  it('returns explicit 404 and 405 responses for unknown routes and unsupported methods', async () => {
    expect((await worker.fetch(request('/missing'), accessEnv)).status).toBe(404);
    expect((await worker.fetch(request('/health', { method: 'POST' }), {})).status).toBe(405);
    expect((await worker.fetch(request('/run'), accessEnv)).status).toBe(405);
  });

  it('classifies malformed and invalid run requests as client errors', async () => {
    const env = { ...accessEnv, CELIA_MODE: 'local', DB: fakeDatabase() };
    const malformed = await worker.fetch(request('/run', { method: 'POST', body: '{' }), env);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'request body must be valid JSON' });

    const missingTask = await worker.fetch(request('/run', {
      method: 'POST', body: JSON.stringify({ other: 'value' }),
    }), env);
    expect(missingTask.status).toBe(400);

    const emptyTask = await worker.fetch(request('/run', {
      method: 'POST', body: JSON.stringify({ task: '   ' }),
    }), env);
    expect(emptyTask.status).toBe(400);
  });

  it('rejects oversized payloads using both declared and actual stream size', async () => {
    const env = { ...accessEnv, CELIA_MODE: 'local', DB: fakeDatabase() };
    const declaredTooLarge = await worker.fetch(request('/run', {
      method: 'POST',
      headers: { 'content-length': String(65 * 1024) },
      body: JSON.stringify({ task: 'too large' }),
    }), env);
    expect(declaredTooLarge.status).toBe(400);
    await expect(declaredTooLarge.json()).resolves.toEqual({ error: 'request body is too large' });

    const actualTooLarge = await worker.fetch(request('/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'x'.repeat(65 * 1024) }),
    }), env);
    expect(actualTooLarge.status).toBe(400);
    await expect(actualTooLarge.json()).resolves.toEqual({ error: 'request body is too large' });

    const understated = await worker.fetch(request('/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '1' },
      body: JSON.stringify({ task: 'x'.repeat(65 * 1024) }),
    }), env);
    expect(understated.status).toBe(400);
    await expect(understated.json()).resolves.toEqual({ error: 'request body is too large' });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65 * 1024)); },
      cancel() { throw new Error('upstream cancellation failed'); },
    });
    const cancellationFailure = await worker.fetch(request('/run', {
      method: 'POST', body: stream, duplex: 'half',
    } as RequestInit), env);
    expect(cancellationFailure.status).toBe(400);
    await expect(cancellationFailure.json()).resolves.toEqual({ error: 'request body is too large' });
  });
});

describe('worker throttling and safe failures', () => {
  it('limits run creation per authenticated owner and reports a retry delay', async () => {
    const writes = { count: 0 };
    const env = { ...accessEnv, CELIA_MODE: 'local', DB: fakeDatabase([], writes) };
    const responses: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await worker.fetch(request('/run', {
        method: 'POST', body: JSON.stringify({ task: `run ${index}` }),
      }), env));
    }
    expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(true);
    expect(responses[10]?.status).toBe(429);
    expect(Number(responses[10]?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(responses[10]?.json()).resolves.toEqual({ error: 'rate limit exceeded' });
    expect(writes.count).toBe(10);
  });

  it('does not expose storage or execution exception details to clients', async () => {
    for (const detail of ['private D1 credentials detail', 'task internal stack detail', 'request body internal detail']) {
      const response = await worker.fetch(request('/tasks'), {
        ...accessEnv, DB: fakeDatabase([], { count: 0 }, new Error(detail)),
      });
      expect(response.status).toBe(500);
      const body = await response.json() as { error: string; request_id: string };
      expect(body.error).toBe('request failed');
      expect(body.request_id).toBeTruthy();
      expect(JSON.stringify(body)).not.toContain(detail);
    }
  });
});

describe('worker persistence boundary', () => {
  it('rejects /run explicitly when D1 is unavailable', async () => {
    const response = await worker.fetch(
      request('/run', { method: 'POST', body: JSON.stringify({ task: 'test' }) }),
      { ...accessEnv, CELIA_MODE: 'local' },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'D1 persistence is required',
    });
  });

  it('serves /runs, /runs/:id, and /tasks only through the configured D1 boundary', async () => {
    const db = fakeDatabase([{
      run_id: 'run-1',
      owner_id: 'user-1',
      task_id: 'task-1',
      task: 'test',
      mode: 'local',
      verdict: 'PASSED',
      results_json: '[]',
      verification_json: '{}',
      usage_json: '{}',
      evidence_json: '[]',
      created_at: '2026-09-09T00:00:00.000Z',
      completed_at: '2026-09-09T00:00:00.000Z',
    }]);
    const env = { ...accessEnv, CELIA_MODE: 'local', DB: db };

    const runsResponse = await worker.fetch(request('/runs?limit=1&task_id=task-1'), env);
    expect(runsResponse.status).toBe(200);
    expect(runsResponse.headers.get('cache-control')).toBe('private, no-store');
    expect((await worker.fetch(request('/runs/run-1'), env)).status).toBe(200);
    expect((await worker.fetch(request('/tasks?limit=1'), env)).status).toBe(200);
  });

  it('restricts history and individual run lookups to the authenticated owner', async () => {
    const db = fakeDatabase([
      { run_id: 'own-run', owner_id: 'user-1', task_id: 'own-task', task: 'mine', mode: 'local', verdict: 'PASSED', results_json: '[]', verification_json: '{}', usage_json: '{}', evidence_json: '[]', created_at: '2026-09-09T00:00:00.000Z', completed_at: '2026-09-09T00:00:00.000Z' },
      { run_id: 'other-run', owner_id: 'user-2', task_id: 'other-task', task: 'not mine', mode: 'local', verdict: 'PASSED', results_json: '[]', verification_json: '{}', usage_json: '{}', evidence_json: '[]', created_at: '2026-09-09T00:00:00.000Z', completed_at: '2026-09-09T00:00:00.000Z' },
    ]);
    const response = await worker.fetch(request('/runs'), { ...accessEnv, DB: db });
    await expect(response.json()).resolves.toMatchObject({ runs: [expect.objectContaining({ run_id: 'own-run' })] });
    expect((await worker.fetch(request('/runs/other-run'), { ...accessEnv, DB: db })).status).toBe(404);
  });

  it('persists a successful /run before returning the response', async () => {
    const writes = { count: 0 };
    const response = await worker.fetch(
      request('/run', { method: 'POST', body: JSON.stringify({ task: 'persist this run' }) }),
      { ...accessEnv, CELIA_MODE: 'local', DB: fakeDatabase([], writes) },
    );

    expect(response.status).toBe(200);
    expect(writes.count).toBe(1);
  });
});

describe('D1 storage query boundaries', () => {
  it('uses an atomic fixed-window counter and resets at the next window', async () => {
    const db = fakeDatabase();
    await expect(consumeFixedWindow(db, 'owner:read', 2, 60, 120)).resolves.toMatchObject({ allowed: true });
    await expect(consumeFixedWindow(db, 'owner:read', 2, 60, 121)).resolves.toMatchObject({ allowed: true });
    await expect(consumeFixedWindow(db, 'owner:read', 2, 60, 122)).resolves.toEqual({ allowed: false, retryAfter: 58 });
    await expect(consumeFixedWindow(db, 'owner:read', 2, 60, 180)).resolves.toMatchObject({ allowed: true });
  });

  it('returns a 404 for an unknown stored run and 503 when history storage is missing', async () => {
    const missingRun = await worker.fetch(request('/runs/not-found'), { ...accessEnv, DB: fakeDatabase([]) });
    expect(missingRun.status).toBe(404);
    await expect(missingRun.json()).resolves.toEqual({ error: 'run not found' });

    const unavailable = await worker.fetch(request('/tasks'), accessEnv);
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: 'D1 persistence is required' });
  });

  it('caps invalid and excessive page sizes', () => {
    expect(pageSize(null)).toBe(25);
    expect(pageSize('0')).toBe(25);
    expect(pageSize('1000')).toBe(100);
    expect(pageSize('10')).toBe(10);
  });

  it('deserializes stored run records and task summaries', async () => {
    const db = fakeDatabase([{
      run_id: 'run-1',
      owner_id: 'user-1',
      task_id: 'task-1',
      task: 'test',
      mode: 'local',
      verdict: 'PASSED',
      results_json: '[]',
      verification_json: '{}',
      usage_json: '{}',
      evidence_json: '[]',
      created_at: '2026-09-09T00:00:00.000Z',
      completed_at: '2026-09-09T00:00:00.000Z',
    }]);

    await expect(getRun(db, 'run-1', 'user-1')).resolves.toMatchObject({ run_id: 'run-1' });
    await expect(listRunsByTask(db, 10, 'task-1', 'user-1')).resolves.toHaveLength(1);
    await expect(listTasks(db, 10, 'user-1')).resolves.toEqual([expect.objectContaining({ task_id: 'task-1' })]);
  });
});
