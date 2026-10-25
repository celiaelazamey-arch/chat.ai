// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboard } from './components/HomeDashboard';
import type { AgentRun } from './domain';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const baseProps = {
  runs: 0,
  lastRun: null,
  onNewTask: vi.fn(),
  onOpenTasks: vi.fn(),
  onOpenProjects: vi.fn(),
};

describe('HomeDashboard', () => {
  it('routes the primary actions to task creation, task history, and the project', () => {
    render(<HomeDashboard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /ابدأ مهمة جديدة/ }));
    fireEvent.click(screen.getByRole('button', { name: /سجل المهام/ }));
    fireEvent.click(screen.getByRole('button', { name: /^المشروع$/ }));
    expect(baseProps.onNewTask).toHaveBeenCalledOnce();
    expect(baseProps.onOpenTasks).toHaveBeenCalledOnce();
    expect(baseProps.onOpenProjects).toHaveBeenCalledOnce();
    expect(screen.getByText('لا توجد طلبات في هذه الجلسة')).toBeTruthy();
  });

  it('shows actual run state and evidence count and opens the task history', () => {
    const lastRun: AgentRun = {
      id: 'local-run', project: 'celiaelazamey-arch/chat.ai', goal: 'راجع اختبارات المشروع',
      state: 'completed', nodes: [], files: [], backendRunId: 'run-42',
      verdict: 'PASSED', evidenceCount: 2, evidence: [{ check: 'tests' }, { check: 'typecheck' }],
    };
    render(<HomeDashboard {...baseProps} runs={1} lastRun={lastRun} />);
    expect(screen.getByText('راجع اختبارات المشروع')).toBeTruthy();
    expect(screen.getByText('run · run-42')).toBeTruthy();
    expect(screen.getByText('2', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('اكتمل')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /راجع اختبارات المشروع/ }));
    expect(baseProps.onOpenTasks).toHaveBeenCalledOnce();
  });
});
