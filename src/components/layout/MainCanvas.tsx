import { ZoomIn, ZoomOut, Loader } from 'lucide-react';
import { DragEvent, MouseEvent, WheelEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PdfOutlineItem } from '@/lib/pdf/renderer';

interface MainCanvasProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomByFactor: (factor: number) => void;
  hasDocument: boolean;
  isLoading?: boolean;
  currentPage: number;
  totalPages: number;
  outline: PdfOutlineItem[];
  onJumpToPage: (page: number) => void;
  onHighlightSelection: () => void;
  onAddNoteSelection: () => void;
  onExplainSelection: () => void;
  onDropAICard: (payload: { messageId: string; content: string; pageHint?: number }, clientX: number, clientY: number) => void;
  documentId?: string;
  onToggleFocusMode: () => void;
  isFocusMode: boolean;
  comparePageSignal?: number | null;
  comparePaneCommand?: {
    page: number;
    openSplit?: boolean;
    reason?: 'evidence' | 'reference' | 'compare';
    nonce: number;
  } | null;
}

export function MainCanvas({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomByFactor,
  hasDocument,
  isLoading,
  currentPage,
  totalPages,
  outline,
  onJumpToPage,
  onHighlightSelection,
  onAddNoteSelection,
  onExplainSelection,
  onDropAICard,
  documentId,
  onToggleFocusMode,
  isFocusMode,
  comparePageSignal,
  comparePaneCommand,
}: MainCanvasProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isAICardDragOver, setIsAICardDragOver] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [comparePage, setComparePage] = useState(1);
  const [compareFollowCitation, setCompareFollowCitation] = useState(true);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePageInput, setComparePageInput] = useState('1');
  const [compareTocOpen, setCompareTocOpen] = useState(false);
  const [compareTocQuery, setCompareTocQuery] = useState('');
  const [compareHistory, setCompareHistory] = useState<number[]>([]);
  const [compareHistoryIndex, setCompareHistoryIndex] = useState(-1);
  const [splitReason, setSplitReason] = useState<'evidence' | 'reference' | 'compare'>('compare');

  const splitStateStorageKey = documentId
    ? `main_canvas_split_state:${documentId}`
    : 'main_canvas_split_state:global';

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    if (!tocOpen) {
      setTocQuery('');
    }
  }, [tocOpen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(splitStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        splitMode?: boolean;
        comparePage?: number;
        compareFollowCitation?: boolean;
        compareZoom?: number;
        compareHistory?: number[];
        compareHistoryIndex?: number;
      };
      setSplitMode(!!parsed.splitMode);
      if (typeof parsed.comparePage === 'number' && parsed.comparePage > 0) {
        setComparePage(parsed.comparePage);
        setComparePageInput(String(parsed.comparePage));
      }
      setCompareFollowCitation(parsed.compareFollowCitation !== false);
      if (typeof parsed.compareZoom === 'number' && parsed.compareZoom > 0) {
        setCompareZoom(parsed.compareZoom);
      }
      if (Array.isArray(parsed.compareHistory)) {
        const sanitized = parsed.compareHistory
          .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0)
          .map((p) => Math.round(p));
        setCompareHistory(sanitized);
      }
      if (typeof parsed.compareHistoryIndex === 'number' && Number.isFinite(parsed.compareHistoryIndex)) {
        setCompareHistoryIndex(Math.max(-1, Math.round(parsed.compareHistoryIndex)));
      }
    } catch {
      // ignore malformed state
    }
  }, [splitStateStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        splitStateStorageKey,
        JSON.stringify({
          splitMode,
          comparePage,
          compareFollowCitation,
          compareZoom,
          compareHistory,
          compareHistoryIndex,
        })
      );
    } catch {
      // ignore persist failure
    }
  }, [splitStateStorageKey, splitMode, comparePage, compareFollowCitation, compareZoom, compareHistory, compareHistoryIndex]);

  useEffect(() => {
    if (totalPages <= 0) return;
    setComparePage((prev) => {
      const next = Math.min(Math.max(prev || currentPage, 1), totalPages);
      return next;
    });
  }, [totalPages, currentPage]);

  useEffect(() => {
    setComparePageInput(String(comparePage));
  }, [comparePage]);

  useEffect(() => {
    if (!compareTocOpen) {
      setCompareTocQuery('');
    }
  }, [compareTocOpen]);

  useEffect(() => {
    if (compareHistory.length === 0 && compareHistoryIndex !== -1) {
      setCompareHistoryIndex(-1);
      return;
    }
    if (compareHistory.length > 0 && compareHistoryIndex >= compareHistory.length) {
      setCompareHistoryIndex(compareHistory.length - 1);
    }
  }, [compareHistory, compareHistoryIndex]);

  useEffect(() => {
    if (!splitMode || comparePage <= 0) return;
    if (compareHistory.length > 0) return;
    setCompareHistory([comparePage]);
    setCompareHistoryIndex(0);
  }, [splitMode, comparePage, compareHistory.length]);

  const navigateComparePage = (target: number, options?: { recordHistory?: boolean }) => {
    const clamped = Math.min(Math.max(Math.round(target), 1), totalPages || 1);
    setComparePage(clamped);
    setComparePageInput(String(clamped));
    if (options?.recordHistory === false) return;
    setCompareHistory((prev) => {
      const maxLen = 30;
      const head = compareHistoryIndex >= 0 ? prev.slice(0, compareHistoryIndex + 1) : prev.slice();
      if (head[head.length - 1] === clamped) {
        setCompareHistoryIndex(head.length - 1);
        return head;
      }
      const next = [...head, clamped].slice(-maxLen);
      setCompareHistoryIndex(next.length - 1);
      return next;
    });
  };

  useEffect(() => {
    if (!splitMode || !compareFollowCitation) return;
    if (!comparePageSignal || comparePageSignal <= 0) return;
    setSplitReason('evidence');
    navigateComparePage(comparePageSignal);
  }, [splitMode, compareFollowCitation, comparePageSignal]);

  useEffect(() => {
    if (!comparePaneCommand) return;
    if (comparePaneCommand.openSplit) {
      setSplitMode(true);
    }
    if (comparePaneCommand.reason) {
      setSplitReason(comparePaneCommand.reason);
    }
    if (comparePaneCommand.page > 0) {
      navigateComparePage(comparePaneCommand.page);
    }
  }, [comparePaneCommand]);

  useEffect(() => {
    if (!splitMode || !hasDocument || totalPages <= 0) return;
    const sourceContainer = globalThis.document?.getElementById('pdf-pages-container');
    const targetContainer = globalThis.document?.getElementById('pdf-compare-container');
    if (!(sourceContainer instanceof HTMLElement) || !(targetContainer instanceof HTMLElement)) return;
    targetContainer.innerHTML = '';
    const targetPageEl = sourceContainer.querySelector<HTMLElement>(`.pdf-page[data-page-number="${comparePage}"]`);
    if (!targetPageEl) return;
    const clone = targetPageEl.cloneNode(true) as HTMLElement;
    clone.classList.add('pdf-compare-page');
    clone.style.transform = `scale(${compareZoom})`;
    clone.style.transformOrigin = 'top left';
    clone.style.width = `${targetPageEl.offsetWidth}px`;
    // Keep compare pane visual-only to avoid selection/drag conflict.
    clone.querySelectorAll<HTMLElement>('.pdf-note-card, .pdf-highlight, .pdf-text-layer').forEach((node) => {
      node.style.pointerEvents = 'none';
    });
    const stage = globalThis.document.createElement('div');
    stage.className = 'pdf-compare-stage';
    stage.style.width = `${targetPageEl.offsetWidth * compareZoom}px`;
    stage.style.height = `${targetPageEl.offsetHeight * compareZoom}px`;
    stage.appendChild(clone);
    targetContainer.appendChild(stage);
  }, [splitMode, comparePage, hasDocument, totalPages, currentPage, compareZoom]);

  const handleComparePageSubmit = () => {
    const parsed = Number(comparePageInput);
    if (!Number.isFinite(parsed)) return;
    navigateComparePage(parsed);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onZoomByFactor(event.deltaY < 0 ? 1.08 : 1 / 1.08);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const hasAiCard = Array.from(event.dataTransfer.types).includes('application/x-ai-card');
    if (!hasAiCard) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsAICardDragOver(true);
  };

  const handleDragLeave = () => {
    setIsAICardDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData('application/x-ai-card');
    setIsAICardDragOver(false);
    if (!raw) return;
    event.preventDefault();
    try {
      const parsed = JSON.parse(raw) as { messageId?: string; content?: string; pageHint?: number };
      if (!parsed.messageId || !parsed.content) return;
      onDropAICard(
        { messageId: parsed.messageId, content: parsed.content, pageHint: parsed.pageHint },
        event.clientX,
        event.clientY
      );
    } catch {
      // ignore malformed payload
    }
  };

  const filteredOutline = outline.filter((item) => {
    if (!tocQuery.trim()) return true;
    return item.title.toLowerCase().includes(tocQuery.trim().toLowerCase());
  });
  const activeOutlineId = (() => {
    const candidates = outline.filter((item) => typeof item.pageNumber === 'number' && (item.pageNumber || 0) <= currentPage);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1].id;
  })();
  const compareActiveOutlineId = (() => {
    const candidates = outline.filter((item) => typeof item.pageNumber === 'number' && (item.pageNumber || 0) <= comparePage);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1].id;
  })();
  const filteredCompareOutline = outline.filter((item) => {
    if (!compareTocQuery.trim()) return true;
    return item.title.toLowerCase().includes(compareTocQuery.trim().toLowerCase());
  });

  return (
    <main className="flex-1 flex flex-col bg-[#EEF2F7] relative">
      <div className="h-12 border-b border-[#E3E8F0] bg-white/95 backdrop-blur flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onZoomIn}>
            <ZoomIn size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={onZoomOut}>
            <ZoomOut size={16} />
          </Button>
          <span className="text-sm text-gray-600 ml-2">{Math.round(zoomLevel * 100)}%</span>
          {totalPages > 0 && (
            <span className="text-sm text-gray-600 ml-3">
              Page {currentPage} / {totalPages}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isFocusMode ? 'primary' : 'secondary'} size="sm" onClick={onToggleFocusMode}>
            {isFocusMode ? 'Exit Focus' : 'Focus'}
          </Button>
          <Button
            variant={splitMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setSplitMode((v) => {
                if (!v) setSplitReason('compare');
                return !v;
              });
            }}
            title="Open reference pane for side-by-side reading"
          >
            {splitMode ? 'Close Reference' : 'Reference Pane'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onHighlightSelection}>
            Highlight
          </Button>
          <span className="text-xs text-gray-500">Ctrl/Cmd + Wheel to zoom</span>
          {hasDocument && totalPages > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setTocOpen((v) => !v)}>
              {tocOpen ? 'Hide TOC' : 'Show TOC'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          id="pdf-scroll-container"
          className={`flex-1 overflow-auto p-4 ${isAICardDragOver ? 'ai-card-drop-active' : ''}`}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {hasDocument ? (
            <div className="relative">
              <div id="pdf-pages-container" className="pdf-pages-container" />
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70">
                  <Loader className="animate-spin" size={48} />
                  <p className="text-gray-600">Processing PDF...</p>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader className="animate-spin" size={48} />
              <p className="text-gray-600">Processing PDF...</p>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-400">Upload a PDF to get started</p>
            </div>
          )}
        </div>

        {splitMode && hasDocument && totalPages > 0 && (
          <aside className="relative w-[38%] min-w-[320px] border-l border-[#E3E8F0] bg-[#F8FAFC] flex flex-col">
            <div className="border-b border-[#E3E8F0] bg-white/90">
              {/* Row 1: Task context */}
              <div className="flex h-8 items-center justify-between px-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${
                    splitReason === 'evidence'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : splitReason === 'reference'
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-slate-50 text-slate-600 border border-slate-200'
                  }`}>
                    {splitReason === 'evidence' ? 'Evidence Check' : splitReason === 'reference' ? 'AI Reference' : 'Compare'}
                  </span>
                  <span className="text-[11px] text-[#64748B]">page {comparePage} / {totalPages}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-[10px] ${compareFollowCitation ? 'bg-[#E42313]/10 text-[#E42313]' : 'text-[#94A3B8] hover:text-[#475569]'}`}
                    onClick={() => setCompareFollowCitation((v) => !v)}
                    title={compareFollowCitation ? 'Auto-follow citation clicks' : 'Manual navigation only'}
                  >
                    {compareFollowCitation ? 'Auto-follow' : 'Manual'}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-[#94A3B8] hover:text-[#475569]"
                    onClick={() => setSplitMode(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              {/* Row 2: Navigation controls */}
              <div className="flex h-8 items-center gap-1 border-t border-[#EEF2F7] px-3">
                <button type="button" className="ref-pane-btn" onClick={() => {
                  if (compareHistoryIndex <= 0) return;
                  const prevIdx = compareHistoryIndex - 1;
                  setCompareHistoryIndex(prevIdx);
                  navigateComparePage(compareHistory[prevIdx], { recordHistory: false });
                }} disabled={compareHistoryIndex <= 0} title="Back">←</button>
                <button type="button" className="ref-pane-btn" onClick={() => {
                  if (compareHistoryIndex < 0 || compareHistoryIndex >= compareHistory.length - 1) return;
                  const nextIdx = compareHistoryIndex + 1;
                  setCompareHistoryIndex(nextIdx);
                  navigateComparePage(compareHistory[nextIdx], { recordHistory: false });
                }} disabled={compareHistoryIndex < 0 || compareHistoryIndex >= compareHistory.length - 1} title="Forward">→</button>
                <span className="mx-0.5 text-[#D9DEE8]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(comparePage - 1)} disabled={comparePage <= 1}>Prev</button>
                <input
                  value={comparePageInput}
                  onChange={(e) => setComparePageInput(e.target.value)}
                  onBlur={handleComparePageSubmit}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleComparePageSubmit(); }}
                  className="h-6 w-12 rounded border border-[#D9DEE8] px-1.5 text-center text-[11px] text-[#334155] outline-none focus:border-[#E42313]"
                />
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(comparePage + 1)} disabled={comparePage >= totalPages}>Next</button>
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(currentPage)}>Sync</button>
                <span className="mx-0.5 text-[#D9DEE8]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}>−</button>
                <span className="min-w-[32px] text-center text-[10px] text-[#64748B]">{Math.round(compareZoom * 100)}%</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}>+</button>
                <span className="mx-0.5 text-[#D9DEE8]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareTocOpen((v) => !v)}>
                  {compareTocOpen ? 'Hide TOC' : 'TOC'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div id="pdf-compare-container" className="pdf-compare-container" />
            </div>
            {compareTocOpen && (
              <aside className="absolute right-0 top-11 bottom-0 w-[260px] border-l border-[#E5EAF3] bg-white/98 backdrop-blur z-10 overflow-auto">
                <div className="sticky top-0 border-b border-[#EEF2F7] bg-white px-3 py-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[#334155]">Compare TOC</h4>
                    <button
                      className="text-[11px] text-[#64748B] hover:text-[#0F172A]"
                      onClick={() => setCompareTocOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <input
                    value={compareTocQuery}
                    onChange={(e) => setCompareTocQuery(e.target.value)}
                    className="mt-2 w-full rounded-md border border-[#D9DEE8] px-2 py-1 text-[11px] text-[#334155] outline-none focus:border-[#E42313]"
                    placeholder="Search in TOC..."
                  />
                </div>
                <div className="p-2">
                  {filteredCompareOutline.length === 0 && (
                    <p className="px-2 py-3 text-[11px] text-[#94A3B8]">No matched entries</p>
                  )}
                  {filteredCompareOutline.map((item) => (
                    <button
                      key={`compare-${item.id}`}
                      className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                        item.id === compareActiveOutlineId ? 'bg-[#F3E8FF] text-[#6B21A8]' : 'hover:bg-[#F8FAFC] text-[#334155]'
                      }`}
                      style={{ paddingLeft: `${8 + item.level * 12}px` }}
                      disabled={!item.pageNumber}
                      onClick={() => {
                        if (item.pageNumber) {
                          navigateComparePage(item.pageNumber);
                        }
                      }}
                    >
                      <span>{item.title}</span>
                      {item.pageNumber && <span className="ml-1 text-[10px] text-[#94A3B8]">p.{item.pageNumber}</span>}
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </aside>
        )}
      </div>

      {tocOpen && hasDocument && totalPages > 0 && (
        <aside className="absolute right-0 top-12 bottom-0 w-[300px] bg-white border-l border-[#E8E8E8] shadow-xl z-20 overflow-auto">
          <div className="sticky top-0 bg-white border-b border-[#E8E8E8] px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Table of Contents</h3>
            <button className="text-xs text-gray-500 hover:text-black" onClick={() => setTocOpen(false)}>
              Close
            </button>
          </div>
          <div className="p-2 border-b border-[#EEF2F7]">
            <input
              value={tocQuery}
              onChange={(e) => setTocQuery(e.target.value)}
              className="w-full rounded-lg border border-[#D9DEE8] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#E42313]/20 focus:border-[#E42313]"
              placeholder="Search TOC..."
            />
          </div>
          <div className="p-2">
            {filteredOutline.length === 0 && (
              <p className="px-2 py-3 text-xs text-gray-400">No matched entries</p>
            )}
            {filteredOutline.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors ${
                  item.id === activeOutlineId
                    ? 'bg-[#fff1f0] text-[#C62314]'
                    : 'hover:bg-gray-50'
                }`}
                style={{ paddingLeft: `${8 + item.level * 14}px` }}
                disabled={!item.pageNumber}
                onClick={() => {
                  if (item.pageNumber) {
                    onJumpToPage(item.pageNumber);
                  }
                }}
              >
                <span className="text-gray-800">{item.title}</span>
                {item.pageNumber && <span className="text-xs text-gray-500 ml-2">p.{item.pageNumber}</span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {!tocOpen && hasDocument && totalPages > 0 && (
        <button
          type="button"
          className="absolute right-6 bottom-6 z-20 rounded-full border border-[#D9DEE8] bg-white/95 px-4 py-2 text-xs font-medium text-[#334155] shadow-lg backdrop-blur hover:bg-white"
          onClick={() => setTocOpen(true)}
          title="Open Table of Contents"
        >
          TOC · p{currentPage}
        </button>
      )}

      {contextMenu && (
        <div
          className="fixed z-30 bg-white border border-gray-200 shadow-lg rounded p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {hasDocument && totalPages > 0 && (
            <button
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
              onClick={() => {
                setTocOpen(true);
                setContextMenu(null);
              }}
            >
              Open TOC Sidebar
            </button>
          )}
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
            onClick={() => {
              onHighlightSelection();
              setContextMenu(null);
            }}
          >
            Highlight Selection
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
            onClick={() => {
              onAddNoteSelection();
              setContextMenu(null);
            }}
          >
            Add Note from Selection
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
            onClick={() => {
              onExplainSelection();
              setContextMenu(null);
            }}
          >
            Explain Selection with AI
          </button>
        </div>
      )}
    </main>
  );
}
