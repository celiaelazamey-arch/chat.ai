import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRun, listRuns, listTasks, runTask, RunRequestError } from './api';

afterEach(() => vi.restoreAllMocks());

describe('runTask', () => {
  it('surfaces network failures with a user-facing message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(runTask('test')).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('تعذر الوصول إلى خدمة التنفيذ'),
    });
  });

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ verdict: 'PASSED' }), { status: 200 }),
    ));

    await expect(runTask('test')).rejects.toMatchObject({
      kind: 'invalid_response',
      message: expect.stringContaining('استجابة التنفيذ ناقصة'),
    });
  });

  it('classifies an API rejection separately from transport failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'blocked by policy' }), { status: 403 }),
    ));

    await expect(runTask('test')).rejects.toEqual(
      expect.objectContaining({
        name: 'RunRequestError',
        kind: 'api_rejected',
        message: 'blocked by policy',
      } satisfies Partial<RunRequestError>),
    );
  });

  it('classifies a 503 execution response as infrastructure unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'D1 persistence is required for /run' }), { status: 503 }),
    ));

    await expect(runTask('test')).rejects.toMatchObject({
      kind: 'infrastructure_unavailable',
      message: 'خدمة التنفيذ غير جاهزة مؤقتًا. حاول مرة أخرى لاحقًا.',
    });
  });

  it('classifies a 503 task-history response as infrastructure unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'D1 persistence is not configured' }), { status: 503 }),
    ));

    await expect(listTasks()).rejects.toMatchObject({
      kind: 'infrastructure_unavailable',
      message: 'سجل المهام غير جاهز مؤقتًا. حاول مرة أخرى لاحقًا.',
    });
  });

  it('requests runs with the task_id filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ runs: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listRuns('task-42', 10)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/runs?limit=10&task_id=task-42', { credentials: 'include' });
  });

  it('returns an empty filtered run list without inventing results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    ));

    await expect(listRuns('missing-task')).resolves.toEqual([]);
  });

  it('surfaces filtered run API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'query failed' }), { status: 500 }),
    ));

    await expect(listRuns('task-42')).rejects.toMatchObject({
      kind: 'api_rejected',
      message: 'query failed',
    });
  });

  it('loads evidence details for a persisted run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        run_id: 'run-42',
        task_id: 'task-42',
        task: 'verify',
        mode: 'local',
        verdict: 'PASSED',
        results: [],
        verification: {},
        usage: {},
        evidence: [{ evidenceId: 'check-1', kind: 'local_smoke' }],
        created_at: '2026-09-09T00:00:00.000Z',
        completed_at: '2026-09-09T00:00:00.000Z',
      }), { status: 200 }),
    ));

    await expect(getRun('run-42')).resolves.toMatchObject({
      run_id: 'run-42',
      evidence: [{ evidenceId: 'check-1', kind: 'local_smoke' }],
    });
  });
});
