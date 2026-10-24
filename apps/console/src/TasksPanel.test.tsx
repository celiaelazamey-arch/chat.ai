// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksPanel } from './components/TasksPanel';
import { listRuns, listTasks, RunRequestError } from './api';
import type { ApiRunSummary, ApiTaskSummary } from './api';

vi.mock('./api', () => ({
  listRuns: vi.fn(),
  listTasks: vi.fn(),
  RunRequestError: class RunRequestError extends Error {},
}));

const tasks: ApiTaskSummary[] = [{
  task_id: 'task-1', task: 'تحقق من البناء', verdict: 'PASSED',
  created_at: '2026-09-09T00:00:00.000Z', completed_at: '2026-09-09T00:00:02.000Z',
}];
const runs: ApiRunSummary[] = [{
  run_id: 'run-1', task_id: 'task-1', task: 'تحقق من البناء', mode: 'local', verdict: 'PASSED',
  evidence: [], created_at: '2026-09-09T00:00:00.000Z', completed_at: '2026-09-09T00:00:02.000Z',
}];

beforeEach(() => {
  vi.mocked(listTasks).mockResolvedValue(tasks);
  vi.mocked(listRuns).mockResolvedValue(runs);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TasksPanel API-to-UI behavior', () => {
  it('loads and renders real task summaries', async () => {
    render(<TasksPanel />);
    expect(screen.getByText('جارٍ تحميل سجل التنفيذ من backend...')).toBeTruthy();
    expect(await screen.findByText('تحقق من البناء')).toBeTruthy();
    expect(screen.getByText('task-1')).toBeTruthy();
    expect(listTasks).toHaveBeenCalledOnce();
  });

  it('renders an explicit empty state for a successful empty response', async () => {
    vi.mocked(listTasks).mockResolvedValueOnce([]);
    render(<TasksPanel />);
    expect(await screen.findByText('لا توجد تشغيلات محفوظة بعد.')).toBeTruthy();
  });

  it('renders the backend error instead of pretending the task history is empty', async () => {
    vi.mocked(listTasks).mockRejectedValueOnce(new RunRequestError('D1 غير متاح', 'infrastructure_unavailable'));
    render(<TasksPanel />);
    expect(await screen.findByText('تعذر تحميل المهام')).toBeTruthy();
    expect(screen.getByText('D1 غير متاح')).toBeTruthy();
  });

  it('filters runs by trimmed task id and renders the returned run', async () => {
    render(<TasksPanel />);
    await screen.findByText('تحقق من البناء');
    fireEvent.change(screen.getByLabelText('فلترة التشغيلات حسب task_id'), { target: { value: ' task-1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التشغيلات' }));
    expect(await screen.findByText('run-1')).toBeTruthy();
    expect(listRuns).toHaveBeenCalledWith('task-1');
  });

  it('shows the no-runs state for a task with no matching executions', async () => {
    vi.mocked(listRuns).mockResolvedValueOnce([]);
    render(<TasksPanel />);
    await screen.findByText('تحقق من البناء');
    fireEvent.change(screen.getByLabelText('فلترة التشغيلات حسب task_id'), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التشغيلات' }));
    await waitFor(() => expect(screen.getByText('لا توجد تشغيلات محفوظة للمهمة missing.')).toBeTruthy());
  });

  it('does not query runs for a blank filter', async () => {
    render(<TasksPanel />);
    await screen.findByText('تحقق من البناء');
    fireEvent.click(screen.getByRole('button', { name: 'عرض التشغيلات' }));
    expect(listRuns).not.toHaveBeenCalled();
  });
});
