import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Cpu, Sparkles, User } from 'lucide-react';
import type { ChatMessage } from '../domain';
import { SUGGESTIONS } from '../mock';
import { Logo } from './Logo';
import { Pill } from './Pill';

export interface ChatProps {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onSuggest: (prompt: string) => void;
  routeNote: string | null;
}

function Msg({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser ? 'var(--bg-raised)' : 'var(--accent-bg)',
          border: '1px solid var(--border)',
        }}
      >
        {isUser ? <User size={15} color="var(--text-dim)" /> : <Bot size={15} color="var(--accent)" />}
      </div>
      <div style={{ maxWidth: 'min(640px, 82%)' }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            marginBottom: 3,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexDirection: isUser ? 'row-reverse' : 'row',
          }}
        >
          <span>{isUser ? 'أنت' : 'Celia'}</span>
          <span>{m.time}</span>
        </div>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            background: isUser ? 'var(--accent-bg)' : 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13.5,
            lineHeight: 1.75,
          }}
        >
          {m.content === '…' ? (
            <span style={{ color: 'var(--text-faint)' }}>يفكّر…</span>
          ) : (
            m.content
          )}
        </div>
        {m.meta && (
          <div style={{ marginTop: 5, padding: isUser ? '0 0 0 0' : '0 2px' }}>
            <Pill tone="accent" dot={false}>
              <Cpu size={11} style={{ verticalAlign: -2 }} />
              {m.meta}
            </Pill>
          </div>
        )}
      </div>
    </div>
  );
}

export function Chat({ messages, busy, onSend, onSuggest, routeNote }: ChatProps) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    onSend(t);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-layout" style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div
        className="chat-main"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          maxWidth: 820,
          margin: '0 auto',
          padding: '0 16px',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 2px' }}>
          {isEmpty ? (
            <div style={{ textAlign: 'center', paddingTop: '9vh' }}>
              <div style={{ display: 'inline-flex', marginBottom: 14 }}>
                <Logo size={44} />
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                ماذا تريد أن تنجز اليوم؟
              </h1>
              <p style={{ color: 'var(--text-dim)', fontSize: 13.5, marginTop: 8, lineHeight: 1.7 }}>
                أرسل هدفك إلى خدمة التنفيذ الحالية، وتابع الحالة والنتيجة والأدلة المتاحة.
                <br />
                تفاصيل خطوات backend تظهر فقط عندما يعيدها عقد الخدمة.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'center',
                  marginTop: 22,
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => onSuggest(s.prompt)}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--bg-raised)',
                      color: 'var(--text-dim)',
                      borderRadius: 999,
                      padding: '7px 13px',
                      fontSize: 12.5,
                      transition: 'all .12s',
                    }}
                  >
                    <Sparkles size={12} style={{ verticalAlign: -2, marginLeft: 6, color: 'var(--accent)' }} />
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {messages.map((m) => (
                <Msg key={m.id} m={m} />
              ))}
              {busy && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12 }}>
                  <span className="dot-pulse" style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
                  Celia تعمل على المهمة…
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div style={{ paddingBottom: 16 }}>
          <div
            className="glow"
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '10px 12px',
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="صف ما تريد إنجازه… (مثال: ابنِ صفحة تسجيل المستخدمين)"
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                background: 'transparent',
                border: 0,
                outline: 'none',
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.6,
                maxHeight: 140,
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={submit}
              disabled={busy || !text.trim()}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: 0,
                background: busy || !text.trim() ? 'var(--bg-hover)' : 'var(--accent)',
                color: busy || !text.trim() ? 'var(--text-faint)' : '#0a0c10',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .12s',
              }}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 11, marginTop: 8 }}>
            طلبك يذهب إلى خدمة التنفيذ المضبوطة لهذا التطبيق؛ لا نفترض توافر حصة مجانية لمزوّد خارجي.
          </div>
        </div>
      </div>

      {/* شريط سياق النموذج */}
      <div
        className="chat-context"
        style={{
          width: 236,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>مسار الطلب</div>
        <div
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>واجهة التنفيذ</div>
          <Pill tone="accent">POST /run</Pill>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>ملاحظة توجيه محلية (للعرض فقط)</div>
          <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--text)' }}>
            {routeNote ?? 'تظهر بعد إدخال الهدف'}
          </div>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            هذا الاقتراح لا يحدد مزوّد التنفيذ ولا يثبت توفره أو حصته؛ خدمة API هي التي تعيد نتيجة الطلب.
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.7 }}>
          لا يوجد تبديل تلقائي لمزوّد النماذج في مسار الواجهة الحالي.
        </div>
      </div>
    </div>
  );
}
