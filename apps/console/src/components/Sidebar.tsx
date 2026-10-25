import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Boxes,
  FolderKanban,
  Home,
  KeyRound,
  ListChecks,
  MessageSquare,
  Play,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { Logo } from './Logo';
import { Pill } from './Pill';
import type { View } from '../App';

export interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  runs: number;
}

interface Item {
  id: View;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const SECTION_WORK: Item[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'workspace', label: 'مساحة العمل', icon: Boxes },
  { id: 'tasks', label: 'المهام', icon: ListChecks },
  { id: 'projects', label: 'المشاريع', icon: FolderKanban },
  { id: 'files', label: 'الملفات', icon: TerminalSquare },
  { id: 'chat', label: 'المحادثة', icon: MessageSquare },
  { id: 'agents', label: 'الوكلاء', icon: Bot },
];

const SECTION_SYSTEM: Item[] = [
  { id: 'providers', label: 'مزوّدو الذكاء', icon: Sparkles, hint: 'اختياري' },
  { id: 'keys', label: 'مفاتيح API', icon: KeyRound },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export function Sidebar({ view, setView, runs }: SidebarProps) {
  const ItemRow = ({ item }: { item: Item }) => {
    const Icon = item.icon;
    const active = view === item.id;
    return (
      <button
        onClick={() => setView(item.id)}
        title={item.label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '8px 10px',
          borderRadius: 10,
          border: 0,
          background: active ? 'var(--accent-bg)' : 'transparent',
          color: active ? 'var(--text)' : 'var(--text-dim)',
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          textAlign: 'right',
          transition: 'background .12s',
        }}
      >
        <Icon size={16} style={{ color: active ? 'var(--accent)' : 'var(--text-faint)' }} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.hint && <Pill tone="accent" dot={false}>{item.hint}</Pill>}
        {item.id === 'tasks' && runs > 0 && (
          <span
            style={{
              background: 'var(--accent)',
              color: '#0a0c10',
              fontSize: 10,
              fontWeight: 700,
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 5px',
            }}
          >
            {runs}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 224,
        flexShrink: 0,
        background: 'var(--bg-elev)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 10px',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 8px 14px',
        }}
      >
        <Logo />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>Canyou</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>مساحة العمل الذكية</div>
        </div>
      </div>

      <button
        onClick={() => setView('chat')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '2px 2px 10px',
          padding: '9px 10px',
          borderRadius: 10,
          border: '1px solid var(--accent)',
          background: 'linear-gradient(120deg, rgba(124,140,255,.22), rgba(34,211,238,.14))',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Play size={16} color="var(--accent)" />
        مهمة جديدة
      </button>

      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-faint)',
          padding: '6px 10px',
          letterSpacing: 0.4,
        }}
      >
        العمل
      </div>
      {SECTION_WORK.map((i) => (
        <ItemRow key={i.id} item={i} />
      ))}

      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-faint)',
          padding: '12px 10px 6px',
          letterSpacing: 0.4,
        }}
      >
        النظام
      </div>
      {SECTION_SYSTEM.map((i) => (
        <ItemRow key={i.id} item={i} />
      ))}

      <div style={{ flex: 1 }} />

      <div
        style={{
          borderTop: '1px solid var(--border)',
          marginTop: 8,
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ padding: '0 8px', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          <Search size={12} style={{ verticalAlign: -2, marginLeft: 4 }} />
          قريبًا: بحث شامل داخل مساحة العمل
        </div>
        <Pill tone="ok">نواة AOK · صحّة جيدة</Pill>
      </div>
    </aside>
  );
}
