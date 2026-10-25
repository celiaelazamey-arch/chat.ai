import { useCallback, useState } from 'react';
import { Bot, FolderKanban, ListChecks, Settings, TerminalSquare } from 'lucide-react';
import type {
  Activity,
  AgentPlan,
  AgentRun,
  AgentStateModel,
  ChatMessage,
  ProjectSection,
  ProjectState,
} from './domain';
import { guessType, ulid } from './mock';
import { runTask, RunRequestError } from './api';
import { providerStatus, routeTask } from './kernel';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Chat } from './components/Chat';
import { AgentWorkspace } from './components/AgentWorkspace';
import { ProviderPanel } from './components/ProviderPanel';
import { ApiKeys } from './components/ApiKeys';
import { HomeDashboard } from './components/HomeDashboard';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { TasksPanel } from './components/TasksPanel';
import {
  createUnavailablePlan,
  initialAgentState,
  transitionAgentState,
} from './agent-state';

export type View =
  | 'home'
  | 'workspace'
  | 'chat'
  | 'tasks'
  | 'files'
  | 'agents'
  | 'projects'
  | 'providers'
  | 'keys'
  | 'settings';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [routeNote, setRouteNote] = useState<string | null>(null);
  const [runsCount, setRunsCount] = useState(0);
  const [agentState, setAgentState] = useState<AgentStateModel>(initialAgentState);
  const [plan] = useState<AgentPlan>(createUnavailablePlan);
  const [project, setProject] = useState<ProjectState>({
    id: 'chat-ai',
    name: 'Celia',
    repository: 'celiaelazamey-arch/chat.ai',
    section: 'overview',
  });

  const submitGoal = useCallback(async (goal: string) => {
    const clean = goal.trim();
    if (!clean || busy) return;

    setMessages((prev) => [
      ...prev,
      { id: `u_${ulid()}`, role: 'user', content: clean, time: nowTime() },
    ]);

    const type = guessType(clean);
    const model = routeTask(type, type === 'coding' || type === 'planning');
    setRouteNote(model ? `${model.providerId} · ${model.id} (اقتراح غير مستخدم في طلب API)` : 'لا يوجد اقتراح محلي');
    setView('workspace');
    setBusy(true);
    setAgentState((current) => transitionAgentState(current, { type: 'planning' }));
    setActivities([]);
    setRunsCount((c) => c + 1);
    setRun({
      id: `run_${ulid()}`,
      project: 'celiaelazamey-arch/chat.ai',
      goal: clean,
      state: 'running',
      nodes: [
      ],
      files: [],
    });
    setActivities([
      { id: `a_${ulid()}`, kind: 'user', text: 'استلمت الواجهة الهدف', detail: 'تم حفظ الطلب في سجل الجلسة.', time: nowTime() },
      { id: `a_${ulid()}`, kind: 'tool', text: 'إرسال طلب التنفيذ إلى خدمة API', detail: 'POST /run · بانتظار استجابة الخدمة.', time: nowTime() },
    ]);

    try {
      setAgentState((current) => transitionAgentState(current, { type: 'run.started' }));
      const outcome = await runTask(clean);
      setAgentState((current) => transitionAgentState(current, {
        type: 'run.completed',
        runId: outcome.run_id,
        verdict: outcome.verdict,
      }));
      setRun((current) => current ? {
        ...current,
        state: outcome.verdict === 'PASSED' ? 'completed' : 'failed',
        nodes: [],
        backendRunId: outcome.run_id,
        taskId: outcome.task_id,
        verdict: outcome.verdict,
        evidenceCount: outcome.evidence.length,
        evidence: outcome.evidence,
      } : current);
      setActivities((prev) => [
        ...prev,
        { id: `a_${ulid()}`, kind: 'tool', text: `وصلت استجابة التنفيذ: ${outcome.verdict}`, detail: `run_id: ${outcome.run_id} · ${outcome.evidence.length} عنصر دليل`, time: nowTime() },
      ]);
      setMessages((prev) => [
        ...prev,
        {
          id: `m_${ulid()}`,
          role: 'assistant',
          content: `اكتمل التنفيذ عبر API: ${outcome.verdict}`,
          time: nowTime(),
          meta: `${outcome.mode} · run ${outcome.run_id}`,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تنفيذ المهمة.';
      const errorKind = error instanceof RunRequestError ? error.kind : 'invalid_response';
      setAgentState((current) => transitionAgentState(current, { type: 'run.failed', error: message }));
      setRun((current) => current ? {
        ...current,
        state: 'failed',
        error: message,
        nodes: [],
      } : current);
      setActivities((prev) => [
        ...prev,
        { id: `a_${ulid()}`, kind: 'system', text: `فشل الطلب (${errorKind})`, detail: message, time: nowTime() },
      ]);
      setMessages((prev) => [
        ...prev,
        {
          id: `m_${ulid()}`,
          role: 'assistant',
          content: `تعذر تنفيذ المهمة عبر API: ${message}`,
          time: nowTime(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh' }}>
      <Sidebar view={view} setView={setView} runs={runsCount} />
      <div className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar view={view} project="celiaelazamey-arch/chat.ai" />
        <main style={{ flex: 1, minHeight: 0 }}>
          {view === 'workspace' && (
            <AgentWorkspace run={run} activities={activities} agentState={agentState} plan={plan} />
          )}
          {view === 'home' && (
            <HomeDashboard
              runs={runsCount}
              lastRun={run}
              onNewTask={() => setView('chat')}
              onOpenTasks={() => setView('tasks')}
              onOpenProjects={() => setView('projects')}
            />
          )}
          {view === 'projects' && (
            <ProjectWorkspace
              project={project}
              onSectionChange={(section: ProjectSection) => {
                setProject((current) => ({ ...current, section }));
                if (section === 'chat') setView('chat');
                if (section === 'agent') setView('workspace');
              }}
            />
          )}
          {view === 'chat' && (
            <Chat
              messages={messages}
              busy={busy}
              onSend={submitGoal}
              onSuggest={submitGoal}
              routeNote={routeNote}
            />
          )}
          {view === 'providers' && <ProviderPanel providers={providerStatus()} />}
          {view === 'keys' && <ApiKeys />}
          {view === 'tasks' && (
            <TasksPanel />
          )}
          {view === 'files' && (
            <Placeholder icon={<TerminalSquare size={26} />} title="الملفات" body="مستكشف ملفات مساحة العمل + الـDiff المرئي لأي تعديل أنجزه وكيل." />
          )}
          {view === 'agents' && (
            <Placeholder icon={<Bot size={26} />} title="الوكلاء" body="سجلّ الوكلاء المنشورة (AgentContract) وقدرات كل وكيل." />
          )}
          {view === 'settings' && (
            <Placeholder icon={<Settings size={26} />} title="الإعدادات" body="تفضيلات النظام، السياسات، وبوابة المناعة (Immune Gate)." />
          )}
        </main>
      </div>
    </div>
  );
}

function Placeholder({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, color: 'var(--text-faint)' }}>
        <div style={{ color: 'var(--text-dim)', marginBottom: 10 }}>{icon}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dim)' }}>{title}</div>
        <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>{body}</div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            border: '1px dashed var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          منطقة ضمن خريطة الطريق — الأسبقية حاليًا للـWorkspace + Provider Router
        </div>
      </div>
    </div>
  );
}

function nowTime(): string {
  return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false });
}
