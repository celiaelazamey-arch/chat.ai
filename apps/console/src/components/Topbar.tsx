import { Bell, Command, GitBranch, ShieldCheck } from 'lucide-react';
import { Pill } from './Pill';
import type { View } from '../App';

export interface TopbarProps {
  view: View;
  project: string;
}

const TITLES: Record<View, string> = {
  home: 'الرئيسية',
  workspace: 'مساحة العمل',
  chat: 'المحادثة',
  tasks: 'المهام',
  files: 'الملفات',
  agents: 'الوكلاء',
  projects: 'المشاريع',
  providers: 'مزوّدو الذكاء',
  keys: 'مفاتيح API',
  settings: 'الإعدادات',
};

export function Topbar({ view, project }: TopbarProps) {
  return (
    <header
      className="app-topbar"
      style={{
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,12,16,.6)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>{TITLES[view]}</div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-faint)',
          fontSize: 12,
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '2px 8px',
        }}
      >
        <GitBranch size={12} />
        {project}
      </span>

      <div style={{ flex: 1 }} />

      <Pill tone="ok">
        <ShieldCheck size={12} style={{ verticalAlign: -2 }} />
        مناعة فعّالة
      </Pill>
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-dim)',
          padding: '5px 9px',
          fontSize: 12,
        }}
      >
        <Command size={12} />
        ⌘K
      </button>
      <Bell size={16} color="var(--text-dim)" style={{ cursor: 'pointer' }} />
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: '#0a0c10',
        }}
      >
        C
      </div>
    </header>
  );
}
