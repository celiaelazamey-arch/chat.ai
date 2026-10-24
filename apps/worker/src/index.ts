import { createLocalSmokeRunner, type ProofCarryingOutcome } from '@aok/cli';
import { accessConfigIsValid, authenticateAccessRequest } from './access-auth';
import { consumeFixedWindow, getRun, listRunsByTask, listTasks, pageSize, saveRun } from './storage';

interface Env {
  CELIA_MODE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  CONSOLE_ORIGIN?: string;
  DB?: D1Database;
}

interface RunRequest {
  task: string;
}

class ClientInputError extends Error {}

const MAX_BODY_BYTES = 64 * 1024;
const RUNS_PER_MINUTE = 10;
const RUNS_PER_DAY = 100;
const READS_PER_MINUTE = 120;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = {
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-origin': allowedOrigin(origin, env.CONSOLE_ORIGIN),
      'access-control-allow-credentials': 'true',
      vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);
      return json(
        {
          status: 'ok',
          service: 'celia-worker',
          mode: env.CELIA_MODE === 'cloud' ? 'cloud' : 'local',
          persistence: env.DB ? 'd1' : 'unavailable',
        },
        200,
        cors,
      );
    }

    if (!accessConfigIsValid(env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)) {
      return json({ error: 'authentication is not configured' }, 503, cors);
    }
    const identity = await authenticateAccessRequest(request, env.ACCESS_TEAM_DOMAIN!, env.ACCESS_AUD!);
    if (!identity) return json({ error: 'unauthorized' }, 401, cors);

    const runMatch = url.pathname.match(/^\/runs\/([^/]+)$/);
    const isRunList = request.method === 'GET' && url.pathname === '/runs';
    const isRunDetails = request.method === 'GET' && runMatch !== null;
    const isTaskList = request.method === 'GET' && url.pathname === '/tasks';
    const isRunCreate = request.method === 'POST' && url.pathname === '/run';

    if (!isRunList && !isRunDetails && !isTaskList && !isRunCreate) {
      if (url.pathname === '/run') return json({ error: 'method not allowed' }, 405, cors);
      return json({ error: 'not found' }, 404, cors);
    }
    if (!env.DB) return json({ error: 'D1 persistence is required' }, 503, cors);

    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    try {
      const rateLimit = isRunCreate
        ? await consumeFixedWindow(env.DB, `run-minute:${identity.subject}`, RUNS_PER_MINUTE, 60)
        : await consumeFixedWindow(env.DB, `read-minute:${identity.subject}`, READS_PER_MINUTE, 60);
      if (!rateLimit.allowed) return rateLimited(rateLimit.retryAfter, cors);

      if (isRunCreate) {
        const dailyQuota = await consumeFixedWindow(env.DB, `run-day:${identity.subject}`, RUNS_PER_DAY, 86_400);
        if (!dailyQuota.allowed) return rateLimited(dailyQuota.retryAfter, cors);

        const body = await readJson(request);
        const { task } = parseRunRequest(body);
        const outcome = await createLocalSmokeRunner(env.CELIA_MODE === 'cloud' ? 'cloud' : 'local').run(task);
        await saveRun(env.DB, outcome, identity.subject);
        return json(publicOutcome(outcome), 200, cors);
      }

      if (isRunList) {
        return json({
          runs: await listRunsByTask(
            env.DB,
            pageSize(url.searchParams.get('limit')),
            url.searchParams.get('task_id') ?? undefined,
            identity.subject,
          ),
        }, 200, cors);
      }
      if (isRunDetails && runMatch) {
        const run = await getRun(env.DB, decodeURIComponent(runMatch[1]!), identity.subject);
        return run ? json(run, 200, cors) : json({ error: 'run not found' }, 404, cors);
      }
      return json({ tasks: await listTasks(env.DB, pageSize(url.searchParams.get('limit')), identity.subject) }, 200, cors);
    } catch (error) {
      if (error instanceof ClientInputError) {
        return json({ error: error.message }, 400, cors);
      }
      // Do not expose D1, runner, or upstream exception details to API clients.
      return json({ error: 'request failed', request_id: requestId }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;

function parseRunRequest(body: unknown): RunRequest {
  if (typeof body !== 'object' || body === null || !('task' in body) || typeof body.task !== 'string') {
    throw new ClientInputError('request body must contain a string task');
  }
  const task = body.task.trim();
  if (!task) throw new ClientInputError('task must not be empty');
  return { task };
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw new ClientInputError('request body has invalid content length');
    if (parsedLength > MAX_BODY_BYTES) throw new ClientInputError('request body is too large');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ClientInputError('request body must be valid JSON');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size check remains authoritative even if upstream cancellation fails.
        }
        throw new ClientInputError('request body is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new ClientInputError('request body must be valid JSON');
  }
}

function publicOutcome(outcome: ProofCarryingOutcome) {
  return {
    run_id: outcome.runId,
    task_id: outcome.taskId,
    task: outcome.intent,
    mode: outcome.mode,
    verdict: outcome.verdict,
    results: outcome.results,
    verification: outcome.verification,
    usage: outcome.usage,
    evidence: outcome.verification.evidence,
  };
}

function rateLimited(retryAfter: number, cors: HeadersInit): Response {
  const headers = new Headers(cors);
  headers.set('retry-after', String(retryAfter));
  return json({ error: 'rate limit exceeded' }, 429, headers);
}

function json(value: unknown, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  responseHeaders.set('cache-control', 'private, no-store');
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function allowedOrigin(origin: string | null, configuredConsoleOrigin?: string): string {
  const allowed = new Set([
    'https://celia-console.pages.dev',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  if (configuredConsoleOrigin) allowed.add(configuredConsoleOrigin);
  return origin && allowed.has(origin) ? origin : 'https://celia-console.pages.dev';
}
