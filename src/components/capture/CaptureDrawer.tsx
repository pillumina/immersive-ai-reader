import { useState, useMemo } from 'react';
import { CaptureItemComponent, type CaptureItem, type CaptureType } from './CaptureItem';

type FilterTab = 'all' | CaptureType;

interface CaptureDrawerProps {
  captures: CaptureItem[];
  isOpen: boolean;
  onClose: () => void;
  onJumpTo: (pageNumber: number) => void;
  onEditCapture?: (item: CaptureItem) => void;
  onDeleteCapture?: (id: string) => void;
  onSynthesize?: () => void;
  isSynthesizing?: boolean;
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

export function CaptureDrawer({
  captures,
  isOpen,
  onClose,
  onJumpTo,
  onEditCapture,
  onDeleteCapture,
  onSynthesize,
  isSynthesizing,
}: CaptureDrawerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const filtered = useMemo(() => {
    if (activeTab === 'all') return captures;
    return captures.filter((c) => c.type === activeTab);
  }, [captures, activeTab]);

  const grouped = useMemo(() => groupByDateTime(filtered), [filtered]);

  const noteCount = captures.filter((c) => c.type === 'note').length;
  const highlightCount = captures.filter((c) => c.type === 'highlight').length;
  const aiCount = captures.filter((c) => c.type === 'ai-response').length;
  const canSynthesize = captures.length >= 3;

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
        className={`fixed left-0 top-0 bottom-0 z-[8001] w-72 bg-white border-r border-[#e7e5e4]/60 shadow-[4px_0_24px_rgba(0,0,0,0.08)] flex flex-col transition-transform duration-200 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ willChange: 'transform', contain: 'layout style paint' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f5f5f4]">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-[13px] font-semibold text-[#1c1917]">捕获记录</span>
            <span className="text-[11px] text-[#a8a29e]">({captures.length})</span>
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[#a8a29e] hover:bg-[#f5f5f4] hover:text-[#78716c] transition-colors"
            onClick={onClose}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Synthesize button */}
        <div className="px-4 py-3 border-b border-[#f5f5f4]">
          {isSynthesizing ? (
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-400 text-white text-[12px] font-semibold py-2 px-4 opacity-70 cursor-not-allowed"
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
                  ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                  : 'bg-[#f5f5f4] text-[#a8a29e] cursor-not-allowed'
              }`}
              onClick={onSynthesize}
              title={canSynthesize ? `基于 ${captures.length} 条捕获` : '需要至少 3 条捕获'}
            >
              ✨ 一键合成
              {canSynthesize && <span className="ml-1 opacity-70">（{captures.length} 条）</span>}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#f5f5f4]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#f5f5f4] text-[#1c1917]'
                  : 'text-[#a8a29e] hover:bg-[#fafaf9]'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'note' && noteCount > 0 && <span className="ml-1 text-[10px]">{noteCount}</span>}
              {tab.key === 'highlight' && highlightCount > 0 && <span className="ml-1 text-[10px]">{highlightCount}</span>}
              {tab.key === 'ai-response' && aiCount > 0 && <span className="ml-1 text-[10px]">{aiCount}</span>}
            </button>
          ))}
        </div>

        {/* Capture list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-3">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-[12px] text-[#a8a29e] leading-relaxed">
                {activeTab === 'all'
                  ? '还没有任何捕获。\nFocus Mode 下选中文本即可开始。'
                  : `暂无${TABS.find((t) => t.key === activeTab)?.label}。`}
              </p>
            </div>
          )}

          {Array.from(grouped.entries()).map(([dateTime, items]) => {
            const [date, time] = dateTime.split(' ');
            return (
              <div key={dateTime} className="flex flex-col gap-1">
                <div className="text-[10px] font-medium text-[#a8a29e] px-1 sticky top-0 bg-white py-0.5">
                  {date} <span className="text-[#d6d3d1]">{time}</span>
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
}
