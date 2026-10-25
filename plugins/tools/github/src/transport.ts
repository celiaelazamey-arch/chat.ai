/** نقل HTTP عام — عزل كامل للـKernel عن GitHub (ATOMICITY PRINCIPLE 011). */

export interface GitHubResponse {
  status: number;
  json: unknown;
}

export interface GitHubRequestOptions {
  body?: unknown;
}

export interface GitHubTransport {
  request(method: string, path: string, opts?: GitHubRequestOptions): Promise<GitHubResponse>;
}

export interface HttpGitHubTransportOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxGetRetries?: number;
  maxRetryDelayMs?: number;
}

export class GitHubRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly path: string,
  ) {
    super(`GitHub API ${status} on ${path}: ${message}`);
    this.name = 'GitHubRequestError';
  }
}

export class GitHubResponseTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`GitHub response exceeds the ${maxBytes} byte limit`);
    this.name = 'GitHubResponseTooLargeError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_MAX_GET_RETRIES = 1;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

async function readBoundedBody(res: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await res.body?.cancel();
    throw new GitHubResponseTooLargeError(maxBytes);
  }

  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GitHubResponseTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function retryDelayMs(res: Response, attempt: number): number | undefined {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const reset = res.headers.get('x-ratelimit-reset');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0' && reset) {
    const resetAt = Number(reset) * 1_000;
    if (Number.isFinite(resetAt)) return Math.max(0, resetAt - Date.now());
  }
  if (res.status === 429) return undefined; // require GitHub's retry hint for rate limits
  return Math.min(250 * 2 ** attempt, 2_000); // transient 5xx only
}

function shouldRetryGet(res: Response): boolean {
  return res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504 ||
    (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
}

/** HTTPS transport with bounded response size, request timeout, and GET-only retries. */
export class HttpGitHubTransport implements GitHubTransport {
  private readonly options: Required<HttpGitHubTransportOptions>;

  constructor(
    private baseUrl: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
    options: HttpGitHubTransportOptions = {},
  ) {
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      maxGetRetries: options.maxGetRetries ?? DEFAULT_MAX_GET_RETRIES,
      maxRetryDelayMs: options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
    };
    if (this.options.timeoutMs < 1 || this.options.maxResponseBytes < 1 || this.options.maxGetRetries < 0 || this.options.maxRetryDelayMs < 0) {
      throw new Error('Invalid GitHub transport limits');
    }
  }

  async request(method: string, path: string, opts?: GitHubRequestOptions): Promise<GitHubResponse> {
    const retryableRead = method.toUpperCase() === 'GET';
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });

      if (retryableRead && attempt < this.options.maxGetRetries && shouldRetryGet(res)) {
        const delay = retryDelayMs(res, attempt);
        if (delay !== undefined && delay <= this.options.maxRetryDelayMs) {
          await res.body?.cancel();
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      const text = await readBoundedBody(res, this.options.maxResponseBytes);
      let json: unknown;
      try {
        json = text.length ? JSON.parse(text) : undefined;
      } catch {
        json = text;
      }
      if (!res.ok) {
        const rawMessage = typeof json === 'string'
          ? json
          : typeof json === 'object' && json !== null && typeof (json as { message?: unknown }).message === 'string'
            ? (json as { message: string }).message
            : text;
        const messageWithoutToken = this.token
          ? String(rawMessage).replaceAll(this.token, '[REDACTED]')
          : String(rawMessage);
        const msg = messageWithoutToken.replace(/[\r\n\t\0-\x1f\x7f]+/g, ' ').slice(0, 500);
        throw new GitHubRequestError(res.status, msg, path);
      }
      return { status: res.status, json };
    }
  }
}
