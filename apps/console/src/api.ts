export interface ApiRunResponse {
  run_id: string;
  task_id: string;
  task: string;
  mode: 'local' | 'cloud';
  verdict: 'PASSED' | 'FAILED' | 'BLOCKED';
  usage: unknown;
  evidence: unknown[];
}

export interface ApiTaskSummary {
  task_id: string;
  task: string;
  verdict: string;
  created_at: string;
  completed_at: string;
}

export interface ApiRunSummary {
  run_id: string;
  task_id: string;
  task: string;
  mode: string;
  verdict: string;
  evidence: unknown[];
  created_at: string;
  completed_at: string;
}

export interface ApiRunDetails extends ApiRunSummary {
  results: unknown;
  verification: unknown;
  usage: unknown;
}

export type RunErrorKind = 'network' | 'invalid_response' | 'api_rejected' | 'infrastructure_unavailable';

export class RunRequestError extends Error {
  constructor(
    message: string,
    readonly kind: RunErrorKind,
  ) {
    super(message);
    this.name = 'RunRequestError';
  }
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export async function runTask(task: string): Promise<ApiRunResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/run`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task }),
    });
  } catch {
    throw new RunRequestError('تعذر الوصول إلى خدمة التنفيذ. تحقق من الاتصال وحاول مرة أخرى.', 'network');
  }

  let body: ApiRunResponse | { error?: string };
  try {
    body = (await response.json()) as ApiRunResponse | { error?: string };
  } catch {
    throw new RunRequestError(`استجابة غير صالحة من خدمة التنفيذ (${response.status}).`, 'invalid_response');
  }
  if (!response.ok) {
    if (response.status === 503) {
      throw new RunRequestError('خدمة التنفيذ غير جاهزة مؤقتًا. حاول مرة أخرى لاحقًا.', 'infrastructure_unavailable');
    }
    throw new RunRequestError('error' in body && body.error ? body.error : `فشل طلب التنفيذ (${response.status}).`, 'api_rejected');
  }
  if (!('verdict' in body) || !body.run_id || !body.task_id) {
    throw new RunRequestError('استجابة التنفيذ ناقصة أو غير صالحة.', 'invalid_response');
  }
  return body as ApiRunResponse;
}

export async function listTasks(limit = 25): Promise<ApiTaskSummary[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/tasks?limit=${encodeURIComponent(String(limit))}`, { credentials: 'include' });
  } catch {
    throw new RunRequestError('تعذر الوصول إلى سجل المهام.', 'network');
  }

  let body: { tasks?: ApiTaskSummary[] } | { error?: string };
  try {
    body = (await response.json()) as { tasks?: ApiTaskSummary[] } | { error?: string };
  } catch {
    throw new RunRequestError(`استجابة غير صالحة من سجل المهام (${response.status}).`, 'invalid_response');
  }
  if (!response.ok) {
    if (response.status === 503) {
      throw new RunRequestError('سجل المهام غير جاهز مؤقتًا. حاول مرة أخرى لاحقًا.', 'infrastructure_unavailable');
    }
    throw new RunRequestError(
      'error' in body && body.error ? body.error : `فشل طلب سجل المهام (${response.status}).`,
      'api_rejected',
    );
  }
  if (!('tasks' in body) || !Array.isArray(body.tasks)) {
    throw new RunRequestError('استجابة سجل المهام ناقصة أو غير صالحة.', 'invalid_response');
  }
  return body.tasks;
}

export async function listRuns(taskId: string, limit = 25): Promise<ApiRunSummary[]> {
  const query = new URLSearchParams({ limit: String(limit), task_id: taskId });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/runs?${query.toString()}`, { credentials: 'include' });
  } catch {
    throw new RunRequestError('تعذر الوصول إلى سجل التشغيلات.', 'network');
  }

  let body: { runs?: ApiRunSummary[] } | { error?: string };
  try {
    body = (await response.json()) as { runs?: ApiRunSummary[] } | { error?: string };
  } catch {
    throw new RunRequestError(`استجابة غير صالحة من سجل التشغيلات (${response.status}).`, 'invalid_response');
  }
  if (!response.ok) {
    if (response.status === 503) {
      throw new RunRequestError('سجل التشغيلات غير جاهز مؤقتًا. حاول مرة أخرى لاحقًا.', 'infrastructure_unavailable');
    }
    throw new RunRequestError(
      'error' in body && body.error ? body.error : `فشل طلب سجل التشغيلات (${response.status}).`,
      'api_rejected',
    );
  }
  if (!('runs' in body) || !Array.isArray(body.runs)) {
    throw new RunRequestError('استجابة سجل التشغيلات ناقصة أو غير صالحة.', 'invalid_response');
  }
  return body.runs;
}

export async function getRun(runId: string): Promise<ApiRunDetails> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/runs/${encodeURIComponent(runId)}`, { credentials: 'include' });
  } catch {
    throw new RunRequestError('تعذر الوصول إلى تفاصيل التشغيل.', 'network');
  }

  let body: ApiRunDetails | { error?: string };
  try {
    body = (await response.json()) as ApiRunDetails | { error?: string };
  } catch {
    throw new RunRequestError(`استجابة غير صالحة من تفاصيل التشغيل (${response.status}).`, 'invalid_response');
  }
  if (!response.ok) {
    if (response.status === 503) {
      throw new RunRequestError('تفاصيل التشغيل غير جاهزة مؤقتًا. حاول مرة أخرى لاحقًا.', 'infrastructure_unavailable');
    }
    throw new RunRequestError(
      'error' in body && body.error ? body.error : `فشل طلب تفاصيل التشغيل (${response.status}).`,
      'api_rejected',
    );
  }
  if (!('run_id' in body) || !body.run_id || !Array.isArray(body.evidence)) {
    throw new RunRequestError('استجابة تفاصيل التشغيل ناقصة أو غير صالحة.', 'invalid_response');
  }
  return body as ApiRunDetails;
}
