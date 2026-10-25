import {
  CheckCircle2,
  Circle,
  CircleAlert,
  FileCode2,
  FileText,
  Loader2,
  Settings2,
  ShieldCheck,
  Wrench,
  Workflow,
} from 'lucide-react';
import type { AgentNode, AgentPlan, AgentRun, AgentStateModel, WorkspaceFile } from '../domain';
import { Pill, type Tone } from './Pill';

const FILE_ICON: Record<WorkspaceFile['kind'], typeof FileCode2> = {
  code: FileCode2,
  test: FileCode2,
  config: Settings2,
  doc: FileText,
  other: FileText,
};

const FILE_COLOR: Record<WorkspaceFile['kind'], string> = {
  code: 'var(--accent)',
  test: 'var(--ok)',
  config: 'var(--warn)',
  doc: 'var(--text-dim)',
  other: 'var(--text-faint)',
};

const STATUS_BADGE: Record<AgentRun['state'], { label: string; tone: Tone }> = {
  running: { label: 'قيد التنفيذ', tone: 'accent' },
  needs_approval: { label: 'بانتظار الموافقة', tone: 'warn' },
  completed: { label: 'مكتمل', tone: 'ok' },
  failed: { label: 'فشل', tone: 'err' },
};

function NodeIcon({ status }: { status: AgentNode['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={16} color="var(--ok)" />;
    case 'active':
      return <Loader2 size={16} color="var(--accent)" className="spin" />;
    case 'failed':
      return <CircleAlert size={16} color="var(--err)" />;
    default:
      return <Circle size={16} color="var(--text-faint)" />;
  }
}

function FileIcon({ kind }: { kind: WorkspaceFile['kind'] }) {
  const Icon = FILE_ICON[kind];
  return <Icon size={14} color={FILE_COLOR[kind]} />;
}

export interface AgentWorkspaceProps {
  run: AgentRun | null;
  activities: { id: string; kind: string; text: string; detail?: string; time: string }[];
  agentState: AgentStateModel;
  plan: AgentPlan;
}

export function AgentWorkspace({ run, activities, agentState, plan }: AgentWorkspaceProps) {
  if (!run) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-faint)' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <Wrench size={30} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>
            لا توجد مهمة نشطة
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
            أرسل هدفًا من المحادثة، أو اختر اقتراحًا جاهزًا، وسيظهر هنا
            تخطيط المهمة وتنفيذ الوكلاء والملفات الناتجة.
          </div>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[run.state];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 18 }}>
      <div className="glow" style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {/* header */}
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--bg-elev)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              مشروع <b style={{ color: 'var(--text-dim)' }}>{run.project}</b> · {run.id}
            </div>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                marginTop: 3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run.goal}
            </div>
          </div>
          <Pill tone={badge.tone}>{badge.label}</Pill>
        </div>

        <div className="agent-plan-panel">
          <div className="agent-panel-heading">
            <div><Workflow size={15} color="var(--accent)" /><strong>PLAN</strong></div>
            <Pill tone="neutral">{plan.state === 'available' ? 'متاح' : 'غير متاح'}</Pill>
          </div>
          {plan.steps.length > 0 ? (
            <div className="plan-steps">{plan.steps.map((step) => <div key={step.id}>{step.title}</div>)}</div>
          ) : (
            <div className="agent-panel-note">{plan.note}</div>
          )}
        </div>

        <div className="agent-content-grid">
          {/* steps */}
          <div style={{ background: 'var(--bg-elev)', padding: 14, borderLeft: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>
              ملخص التنفيذ
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {run.nodes.length > 0 ? run.nodes.map((n, i) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 6px' }}>
                  <NodeIcon status={n.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: n.status === 'pending' ? 'var(--text-faint)' : 'var(--text)',
                      }}
                    >
                      {n.label}
                    </div>
                    {n.tool && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                        {n.tool}
                      </div>
                    )}
                  </div>
                  {i < run.nodes.length - 1 && (
                    <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>↓</span>
                  )}
                </div>
              )) : (
                <div className="agent-panel-note">لا يعيد backend خطوات مفصّلة في عقد API الحالي؛ ستظهر هنا فقط المراحل المرسلة فعليًا.</div>
              )}
            </div>

            <div className="workspace-disclaimer">
              لا يوفّر عقد API الحالي بيانات موافقات أو تغييرات ملفات.
            </div>
          </div>

          {/* files */}
          <div style={{ padding: 14, borderLeft: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>
              الملفات
            </div>
            {run.files.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>بيانات الملفات غير متاحة من عقد التنفيذ الحالي.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {run.files.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 8,
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FileIcon kind={f.kind} />
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)', direction: 'ltr', textAlign: 'left' }}>
                      {f.path}
                    </span>
                    <span style={{ fontSize: 10, color: f.status === 'new' ? 'var(--ok)' : 'var(--text-faint)' }}>
                      {f.status === 'new' ? 'جديد' : 'معدّل'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 12,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <ShieldCheck size={14} color="var(--ok)" style={{ marginTop: 1 }} />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                تفاصيل الكتابة إلى الملفات غير متاحة في استجابة التنفيذ الحالية.
              </div>
            </div>
          </div>

          {/* activity */}
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>
              سجل التقدّم المرئي
            </div>
            <p className="activity-honesty-note">تحديثات الحالة والاتصال والاستجابة فقط؛ لا يعرض هذا السجل التفكير الداخلي.</p>
            <div className="activity-timeline" aria-live="polite" aria-label="سجل أحداث التنفيذ">
              <div className="execution-facts">
                <div><span>Agent state</span><strong>{agentState.state}</strong></div>
                <div><span>run_id</span><strong>{run.backendRunId ?? 'غير متاح'}</strong></div>
                <div><span>verdict</span><strong>{run.verdict ?? 'قيد الانتظار'}</strong></div>
                <div><span>evidence</span><strong>{run.evidenceCount ?? 'غير متاح'}</strong></div>
              </div>
              {activities.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: i === activities.length - 1 ? 'var(--accent)' : 'var(--text-faint)',
                        marginTop: 4,
                      }}
                    />
                    {i < activities.length - 1 && (
                      <span style={{ width: 1, flex: 1, background: 'var(--border)' }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: 12 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{a.text}</div>
                    {a.detail && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--mono)', direction: 'ltr', textAlign: 'left' }}>
                        {a.detail}
                      </div>
                    )}
                  </div>
                  <span style={{ marginRight: 'auto', fontSize: 10.5, color: 'var(--text-faint)' }}>{a.time}</span>
                </div>
              ))}
              {activities.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>بانتظار أول حدث…</div>
              )}
            </div>
            <div className="evidence-panel">
              <div className="evidence-heading"><ShieldCheck size={14} color="var(--ok)" /><strong>الأدلة الفعلية</strong></div>
              {run.evidence?.length ? (
                <div className="evidence-list">
                  {run.evidence.map((item, index) => (
                    <pre key={index}>{JSON.stringify(item, null, 2)}</pre>
                  ))}
                </div>
              ) : (
                <div className="agent-panel-note">لا توجد عناصر evidence متاحة لهذا التشغيل.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
