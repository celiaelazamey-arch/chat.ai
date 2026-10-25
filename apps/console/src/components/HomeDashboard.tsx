import {
  ArrowLeft,
  ArrowUpLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  FileOutput,
  FolderKanban,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { AgentRun } from '../domain';
import { Pill, type Tone } from './Pill';

export interface HomeDashboardProps {
  runs: number;
  lastRun: AgentRun | null;
  onNewTask: () => void;
  onOpenTasks: () => void;
  onOpenProjects: () => void;
}

const RUN_STATE: Record<AgentRun['state'], { label: string; tone: Tone }> = {
  running: { label: 'قيد التنفيذ', tone: 'accent' },
  needs_approval: { label: 'بانتظار الموافقة', tone: 'warn' },
  completed: { label: 'اكتمل', tone: 'ok' },
  failed: { label: 'تعذّر', tone: 'err' },
};

export function HomeDashboard({ runs, lastRun, onNewTask, onOpenTasks, onOpenProjects }: HomeDashboardProps) {
  const lastState = lastRun ? RUN_STATE[lastRun.state] : null;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Pill tone="neutral">
            <Sparkles size={12} style={{ verticalAlign: -2 }} />
            لا نفترض حصصًا مجانية · التكاملات الخارجية اختيارية
          </Pill>
          <p className="dashboard-kicker">مساحة عمل Celia</p>
          <h1>من الفكرة إلى نتيجة<br className="hero-break" /> يمكن مراجعتها.</h1>
          <p className="dashboard-intro">
            اكتب هدفك، أرسل طلب التنفيذ، وتابع الحالة والنتيجة والأدلة التي يعيدها النظام —
            ولا نعرض خطوات backend إلا إذا أعادها عقد الخدمة.
          </p>
          <div className="dashboard-actions">
            <button className="dashboard-action accent" onClick={onNewTask}>
              <Plus size={16} /> ابدأ مهمة جديدة <ArrowUpLeft size={15} />
            </button>
            <button className="dashboard-action" onClick={onOpenTasks}>
              <ListChecks size={15} /> سجل المهام
            </button>
          </div>
        </div>
        <div className="dashboard-visual" aria-hidden="true">
          <div className="visual-ring ring-one" />
          <div className="visual-ring ring-two" />
          <div className="visual-core"><Bot size={36} /></div>
          <span className="visual-spark spark-one"><Sparkles size={14} /></span>
          <span className="visual-spark spark-two"><Zap size={13} /></span>
        </div>
        <div className="hero-footnote"><span /> الحصص المجانية لمزوّدي الخارج غير مضمونة؛ تحقّق من إعداداتك</div>
      </section>

      <section className="dashboard-overview" aria-label="نظرة عامة">
        <div className="dashboard-section-heading">
          <div>
            <span className="section-eyebrow">نظرة عامة</span>
            <h2>مساحة عملك، في لمحة</h2>
          </div>
          <button className="text-button" onClick={onOpenProjects}>المشروع <ArrowLeft size={14} /></button>
        </div>

        <div className="dashboard-grid">
          <div className="metric-card metric-featured">
            <span className="metric-icon accent"><ListChecks size={18} /></span>
            <span className="metric-label">طلبات أُرسلت في هذه الجلسة</span>
            <strong>{runs}</strong>
            <span className="metric-footnote">عداد الجلسة الحالية فقط</span>
          </div>
          <div className="metric-card metric-note-card">
            <span className="metric-icon ok"><FileOutput size={18} /></span>
            <span className="metric-label">النتائج والأدلة</span>
            <strong>{lastRun?.evidenceCount ?? '—'}</strong>
            <span className="metric-footnote">{lastRun ? 'عناصر الدليل من آخر استجابة' : 'تظهر هنا بعد أول استجابة'}</span>
          </div>
          <button className="metric-card metric-project-card" onClick={onOpenProjects}>
            <span className="metric-icon violet"><FolderKanban size={18} /></span>
            <span className="metric-label">المشروع النشط</span>
            <strong dir="ltr">celiaelazamey-arch/chat.ai</strong>
            <span className="metric-footnote">افتح مساحات المشروع المتاحة <ArrowLeft size={12} /></span>
          </button>
        </div>

        <div className="dashboard-lower-grid">
          <section className="surface-card recent-card">
            <div className="card-heading">
              <div>
                <span className="section-eyebrow">آخر تحديث</span>
                <h3>آخر طلب تنفيذ</h3>
              </div>
              <span className={`recent-indicator ${lastRun?.state ?? 'idle'}`}>
                {lastRun ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
              </span>
            </div>
            {lastRun ? (
              <button className="recent-run" onClick={onOpenTasks}>
                <span className="recent-run-copy">
                  <strong>{lastRun.goal}</strong>
                  <small>{lastRun.backendRunId ? `run · ${lastRun.backendRunId}` : 'لا يتوفر معرّف backend بعد'}</small>
                </span>
                {lastState && <Pill tone={lastState.tone}>{lastState.label}</Pill>}
                <ArrowLeft className="recent-arrow" size={15} />
              </button>
            ) : (
              <div className="recent-empty">
                <div className="empty-mark"><Bot size={19} /></div>
                <div><strong>لا توجد طلبات في هذه الجلسة</strong><span>ابدأ بطلب صغير، وستظهر هنا الحالة والنتيجة الفعلية.</span></div>
                <button className="empty-action" onClick={onNewTask}>ابدأ <ArrowLeft size={13} /></button>
              </div>
            )}
            <div className="recent-note"><ShieldCheck size={14} /> يعرض السجل أحداث الواجهة ونتائج API فقط؛ تفاصيل خطوات backend تظهر عندما يوفّرها العقد.</div>
          </section>

          <section className="surface-card workflow-card">
            <div className="card-heading">
              <div><span className="section-eyebrow">كيف يعمل</span><h3>مسار واضح، بلا ادّعاءات</h3></div>
              <Sparkles size={18} color="var(--accent)" />
            </div>
            <div className="workflow-list">
              <div className="workflow-step"><span>١</span><div><strong>أرسل هدفك</strong><small>من المحادثة أو اقتراح جاهز</small></div></div>
              <div className="workflow-step"><span>٢</span><div><strong>تابع استجابة الخدمة</strong><small>الحالة، المعرّفات، ونتيجة التنفيذ</small></div></div>
              <div className="workflow-step"><span>٣</span><div><strong>راجع الأدلة</strong><small>المتاح منها في استجابة الـAPI</small></div></div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
