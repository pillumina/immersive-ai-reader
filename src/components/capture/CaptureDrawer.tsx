import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { CaptureItemComponent, type CaptureItem, type CaptureType } from './CaptureItem';
import { focusCommands, type FocusSession } from '@/lib/tauri/commands';

type FilterTab = 'all' | CaptureType | 'sessions';

interface CaptureDrawerProps {
  captures: CaptureItem[];
  isOpen: boolean;
  onClose: () => void;
  onJumpTo: (pageNumber: number) => void;
  onEditCapture?: (item: CaptureItem) => void;
  onDeleteCapture?: (id: string) => void;
  onSynthesize?: () => void;
  isSynthesizing?: boolean;
  documentId?: string;
  onResumeSession?: (session: FocusSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  totalPages?: number;
}

function groupByDateTime(items: CaptureItem[]): Map<string, CaptureItem[]> {
  const groups = new Map<string, CaptureItem[]>();
  for (const item of items) {
    const date = (() => {
      try {
        return new Date(item.capturedAt).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      } catch {
        return '未知日期';
      }
    })();
    const time = (() => {
      try {
        return new Date(item.capturedAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      } catch {
        return '';
      }
    })();
    const key = `${date} ${time}`;
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, item]);
  }
  return groups;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'note', label: '笔记' },
  { key: 'highlight', label: '高亮' },
  { key: 'ai-response', label: 'AI' },
];

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatDateTime(isoStr: string): { date: string; time: string } {
  try {
    const d = new Date(isoStr);
    return {
      date: d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
      time: d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  } catch {
    return { date: '—', time: '' };
  }
}

function SessionCard({
  session,
  totalPages,
  onResume,
  onDelete,
  isCurrentSession,
}: {
  session: FocusSession;
  totalPages?: number;
  onResume: (session: FocusSession) => void;
  onDelete: (sessionId: string) => void;
  isCurrentSession: boolean;
}) {
  const { date, time } = formatDateTime(session.entered_at);
  const progress = Math.round(session.max_read_percentage);
  const totalCap = session.highlights_count + session.notes_count + session.ai_responses_count;

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isCurrentSession ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-bg-subtle)] bg-[var(--color-bg-raised)] hover:border-[var(--color-border)]'}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{date}</span>
          <span className="text-[var(--color-text-muted)]">{time}</span>
          {isCurrentSession && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)] text-[10px] font-medium">当前</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(session.session_id)}
          className="flex items-center justify-center w-6 h-6 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] transition-colors"
          title="删除会话"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
        {/* Duration */}
        {session.duration_minutes != null && (
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatDuration(session.duration_minutes)}
          </span>
        )}
        {/* Page */}
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          p.{session.last_page}{totalPages != null ? `/${totalPages}` : ''}
        </span>
        {/* Progress */}
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          {progress}%
        </span>
        {/* Captures */}
        {totalCap > 0 && (
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {totalCap}
          </span>
        )}
      </div>

      {/* Capture detail dots */}
      {(session.highlights_count > 0 || session.notes_count > 0 || session.ai_responses_count > 0) && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
          {session.highlights_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-accent)]" />
              {session.highlights_count}
            </span>
          )}
          {session.notes_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-ai)]" />
              {session.notes_count}
            </span>
          )}
          {session.ai_responses_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-success)]" />
              {session.ai_responses_count}
            </span>
          )}
        </div>
      )}

      {/* Resume button */}
      {!isCurrentSession && (
        <button
          type="button"
          onClick={() => onResume(session)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          继续阅读
        </button>
      )}
    </div>
  );
}

export const CaptureDrawer = memo(function CaptureDrawer({
  captures,
  isOpen,
  onClose,
  onJumpTo,
  onEditCapture,
  onDeleteCapture,
  onSynthesize,
  isSynthesizing,
  documentId,
  onResumeSession,
  onDeleteSession,
  totalPages,
}: CaptureDrawerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load sessions when tab changes
  const loadSessions = useCallback(async () => {
    if (!documentId) return;
    setSessionsLoading(true);
    try {
      const data = await focusCommands.getAllSessions(documentId);
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setSessionsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      void loadSessions();
    }
  }, [activeTab, loadSessions]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return captures;
    return captures.filter((c) => c.type === activeTab);
  }, [captures, activeTab]);

  const grouped = useMemo(() => groupByDateTime(filtered), [filtered]);

  const noteCount = captures.filter((c) => c.type === 'note').length;
  const highlightCount = captures.filter((c) => c.type === 'highlight').length;
  const aiCount = captures.filter((c) => c.type === 'ai-response').length;
  const canSynthesize = captures.length >= 3;
  const isSessionsTab = activeTab === 'sessions';

  const handleDeleteSession = async (sessionId: string) => {
    if (!onDeleteSession) return;
    try {
      await focusCommands.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      onDeleteSession(sessionId);
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const handleResumeSession = (session: FocusSession) => {
    setCurrentSessionId(session.session_id);
    if (onResumeSession) {
      onResumeSession(session);
    } else {
      onJumpTo(session.last_page);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[8000] bg-black/10"
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-[8001] w-72 bg-[var(--color-bg-raised)] border-r border-[var(--color-border)]/60 shadow-[4px_0_24px_rgba(28,25,23,0.08)] flex flex-col transition-transform duration-200 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ willChange: 'transform', contain: 'layout style paint' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-bg-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-[13px] font-semibold text-[var(--color-text)]">捕获记录</span>
            {!isSessionsTab && (
              <span className="text-[11px] text-[var(--color-text-muted)]">({captures.length})</span>
            )}
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
            onClick={onClose}
            title="关闭"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Synthesize button (hidden on sessions tab) */}
        {!isSessionsTab && (
          <div className="px-4 py-3 border-b border-[var(--color-bg-subtle)]">
            {isSynthesizing ? (
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)]/40 text-white text-[12px] font-semibold py-2 px-4 opacity-70 cursor-not-allowed"
              >
                <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                AI 合成中…
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSynthesize}
                className={`w-full rounded-xl text-[12px] font-semibold py-2 px-4 transition-all ${
                  canSynthesize
                    ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-sm'
                    : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] cursor-not-allowed'
                }`}
                onClick={onSynthesize}
                title={canSynthesize ? `基于 ${captures.length} 条捕获` : '需要至少 3 条捕获'}
              >
                ✨ 一键合成
                {canSynthesize && <span className="ml-1 opacity-70">（{captures.length} 条）</span>}
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-bg-subtle)]">
          {!isSessionsTab && TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[var(--color-bg-hover)] text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'note' && noteCount > 0 && <span className="ml-1 text-[10px]">{noteCount}</span>}
              {tab.key === 'highlight' && highlightCount > 0 && <span className="ml-1 text-[10px]">{highlightCount}</span>}
              {tab.key === 'ai-response' && aiCount > 0 && <span className="ml-1 text-[10px]">{aiCount}</span>}
            </button>
          ))}
          {/* Sessions tab */}
          <button
            type="button"
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors flex items-center gap-1 ${
              isSessionsTab
                ? 'bg-[var(--color-bg-hover)] text-[var(--color-text)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'
            }`}
            onClick={() => setActiveTab('sessions')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>会话</span>
            {sessions.length > 0 && (
              <span className="ml-1 text-[10px]">{sessions.length}</span>
            )}
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-3">

          {/* ── Sessions tab ── */}
          {isSessionsTab && (
            <>
              {!documentId ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="text-3xl mb-3">📖</div>
                  <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                    打开文档后查看阅读历史。
                  </p>
                </div>
              ) : sessionsLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] animate-spin mb-3" />
                  <p className="text-[12px] text-[var(--color-text-muted)]">加载中…</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="text-3xl mb-3">📭</div>
                  <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                    还没有任何阅读会话。
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-[var(--color-text-muted)] px-1">
                    共 {sessions.length} 个会话
                  </p>
                  {sessions.map((session) => (
                    <SessionCard
                      key={session.session_id}
                      session={session}
                      totalPages={totalPages}
                      onResume={handleResumeSession}
                      onDelete={handleDeleteSession}
                      isCurrentSession={session.session_id === currentSessionId}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Capture tabs ── */}
          {!isSessionsTab && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
                {activeTab === 'all'
                  ? '还没有任何捕获。\nFocus Mode 下选中文本即可开始。'
                  : `暂无${TABS.find((t) => t.key === activeTab)?.label}。`}
              </p>
            </div>
          )}

          {!isSessionsTab && Array.from(grouped.entries()).map(([dateTime, items]) => {
            const [date, time] = dateTime.split(' ');
            return (
              <div key={dateTime} className="flex flex-col gap-1">
                <div className="text-[10px] font-medium text-[var(--color-text-muted)] px-1 sticky top-0 bg-[var(--color-bg-raised)] py-0.5">
                  {date} <span className="text-[var(--color-text-muted)]">{time}</span>
                </div>
                {items.map((item) => (
                  <CaptureItemComponent
                    key={item.id}
                    item={item}
                    onJumpTo={onJumpTo}
                    onEdit={onEditCapture}
                    onDelete={onDeleteCapture}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
});
