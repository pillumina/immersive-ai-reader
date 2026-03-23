import { ZoomIn, ZoomOut, X, StickyNote, MessageCircleQuestion, Highlighter, Copy } from 'lucide-react';
import { DragEvent, MouseEvent, WheelEvent, PointerEvent, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { PdfOutlineItem } from '@/lib/pdf/renderer';
import { aiCardDragState } from '@/components/layout/AIPanel';
import { pdfjsLib } from '@/lib/pdf/pdfjs';

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
  onAddNoteSelection: (position?: { x: number; y: number }, targetPageNumber?: number) => void;
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
  onSplitModeChange?: (active: boolean) => void;
  pdfFileBlob?: Blob | null;
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
  onSplitModeChange,
  pdfFileBlob,
}: MainCanvasProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetPageNumber?: number } | null>(null);
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
  const [textHandle, setTextHandle] = useState<{ x: number; y: number; page?: number; text: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResultPage, setSearchResultPage] = useState<number | null>(null);

  // Monitor text selection to show floating drag handle
  useEffect(() => {
    const update = () => {
      const sel = globalThis.getSelection?.();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setTextHandle(null);
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setTextHandle(null);
          return;
        }
        // Find page element
        const pageEl = range.commonAncestorContainer instanceof Node
          ? (range.commonAncestorContainer as Node).ownerDocument
              ?.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
              ?.closest('.pdf-page') as HTMLElement | null
          : null;
        const page = pageEl ? Number(pageEl.dataset.pageNumber || '0') || undefined : undefined;
        const selectedText = sel.toString().trim();
        // Position toolbar centered above the selection, offset upward
        const toolbarX = Math.max(8, rect.left + rect.width / 2);
        const toolbarY = Math.max(8, rect.top - 44); // above selection
        setTextHandle({ x: toolbarX, y: toolbarY, page, text: selectedText });
      } catch {
        setTextHandle(null);
      }
    };
    globalThis.addEventListener('mouseup', update);
    return () => globalThis.removeEventListener('mouseup', update);
  }, []);

  // Cmd/Ctrl+F — toggle search bar.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTyping = (el: EventTarget | null): boolean => {
        if (!(el instanceof HTMLElement)) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || el.isContentEditable;
      };
      if (isTyping(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        if (!searchOpen) setSearchQuery('');
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // Escape dismisses the text selection toolbar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && textHandle) {
        globalThis.getSelection?.()?.removeAllRanges();
        setTextHandle(null);
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [textHandle]);

  // Search PDF text across all pages.
  const searchInPDF = useCallback(async (query: string, fileBlob: Blob, total: number) => {
    if (!query.trim()) { setSearchResultPage(null); return; }
    setSearchLoading(true);
    try {
      const file = fileBlob instanceof File ? fileBlob : new File([fileBlob], 'doc.pdf', { type: 'application/pdf' });
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const q = query.toLowerCase();
      for (let i = 1; i <= Math.min(total, pdfDoc.numPages); i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        if (pageText.toLowerCase().includes(q)) {
          setSearchResultPage(i);
          onJumpToPage(i);
          setSearchLoading(false);
          return;
        }
      }
      setSearchResultPage(0); // no match
    } catch { /* silent */ }
    setSearchLoading(false);
  }, [onJumpToPage]);

  // Notify parent when split mode changes so it can adjust layout (e.g. hide AI panel).
  useEffect(() => {
    onSplitModeChange?.(splitMode);
  }, [splitMode, onSplitModeChange]);

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

  // Follow main view scroll: sync reference pane to the current page the user is viewing.
  useEffect(() => {
    if (!splitMode || !compareFollowCitation) return;
    if (currentPage <= 0 || currentPage === comparePage) return;
    navigateComparePage(currentPage);
  }, [splitMode, compareFollowCitation, currentPage]);

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

    // cloneNode does NOT copy canvas pixel data — manually redraw each canvas.
    const srcCanvases = targetPageEl.querySelectorAll<HTMLCanvasElement>('canvas');
    const dstCanvases = clone.querySelectorAll<HTMLCanvasElement>('canvas');
    srcCanvases.forEach((srcCanvas, i) => {
      const dstCanvas = dstCanvases[i];
      if (!dstCanvas) return;
      dstCanvas.width = srcCanvas.width;
      dstCanvas.height = srcCanvas.height;
      const ctx = dstCanvas.getContext('2d');
      if (ctx) ctx.drawImage(srcCanvas, 0, 0);
    });

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

  // Listen for custom ai-card-drop events dispatched by AIPanel pointer events
  useEffect(() => {
    const handler = (e: Event) => {
      setIsAICardDragOver(false);
      const ce = e as CustomEvent<{ payload: { messageId: string; content: string; pageHint?: number }; clientX: number; clientY: number }>;
      onDropAICard(ce.detail.payload, ce.detail.clientX, ce.detail.clientY);
    };
    globalThis.document?.addEventListener('ai-card-drop', handler);
    return () => globalThis.document?.removeEventListener('ai-card-drop', handler);
  }, [onDropAICard]);

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
    // Find which PDF page the right-click was over (before context menu renders)
    const target = globalThis.document
      ?.elementFromPoint(event.clientX, event.clientY)
      ?.closest('.pdf-page') as HTMLElement | null;
    const targetPageNumber = target ? Number(target.dataset.pageNumber || '0') || undefined : undefined;
    setContextMenu({ x: event.clientX, y: event.clientY, targetPageNumber });
  };

  // Pointer-based drag feedback
  const handlePointerEnter = (_e: PointerEvent<HTMLDivElement>) => {
    if (aiCardDragState.isDragging) setIsAICardDragOver(true);
  };
  const handlePointerLeave = () => {
    if (aiCardDragState.isDragging) setIsAICardDragOver(false);
  };

  // Fallback for browser dev (HTML5 DnD still works there)
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsAICardDragOver(true);
  };
  const handleDragLeave = () => {
    setIsAICardDragOver(false);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsAICardDragOver(false);
    // Only accept AI cards (have messageId); note cards go to AIPanel instead
    const rawPayload = aiCardDragState.payload;
    const isAICard = rawPayload !== null && rawPayload.type === 'ai';
    let payload: { messageId: string; content: string; pageHint?: number } | null =
      isAICard ? { messageId: rawPayload.messageId, content: rawPayload.content, pageHint: rawPayload.pageHint } : null;
    if (!payload) {
      let raw = event.dataTransfer.getData('application/x-ai-card');
      if (!raw) {
        const plain = event.dataTransfer.getData('text/plain');
        if (plain.startsWith('__AICARD__')) raw = plain.slice('__AICARD__'.length);
      }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.messageId && parsed.content) payload = parsed;
        } catch { /* ignore */ }
      }
    }
    if (payload) {
      onDropAICard(
        { messageId: payload.messageId, content: payload.content, pageHint: payload.pageHint },
        event.clientX,
        event.clientY
      );
      aiCardDragState.payload = null;
    }
  };

  // Canvas card drag handlers

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
    <main className="flex-1 min-w-0 overflow-hidden flex flex-col bg-[#fafaf9] relative">
      {/* Toolbar – glassmorphism + compact spacing */}
      <div className="h-11 border-b border-[#e7e5e4]/60 bg-white/80 backdrop-blur-xl flex items-center justify-between px-3 gap-2 select-none">
        <div className="flex items-center gap-1.5">
          <button type="button" className="toolbar-icon-btn" onClick={onZoomOut} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <span className="min-w-[38px] text-center text-[12px] font-medium tabular-nums text-[#78716c]">{Math.round(zoomLevel * 100)}%</span>
          <button type="button" className="toolbar-icon-btn" onClick={onZoomIn} title="Zoom in">
            <ZoomIn size={15} />
          </button>
          {totalPages > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-[#e7e5e4]" />
              <span className="text-[12px] tabular-nums text-[#78716c]">
                {currentPage}<span className="mx-0.5 text-[#e7e5e4]">/</span>{totalPages}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant={isFocusMode ? 'primary' : 'secondary'} size="sm" onClick={onToggleFocusMode} className="!h-7 !px-2.5 !text-[11px]">
            {isFocusMode ? 'Exit Focus' : 'Focus'}
          </Button>
          <Button
            variant={splitMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              if (!hasDocument || totalPages <= 0) return;
              setSplitMode((v) => {
                if (!v) setSplitReason('compare');
                return !v;
              });
            }}
            disabled={!hasDocument || totalPages <= 0}
            title={hasDocument && totalPages > 0 ? 'Open reference pane for side-by-side reading' : 'Load a document first'}
            className="!h-7 !px-2.5 !text-[11px]"
          >
            {splitMode ? 'Close Ref' : 'Reference'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onHighlightSelection} disabled={!hasDocument} className="!h-7 !px-2.5 !text-[11px]">
            Highlight
          </Button>
          {hasDocument && totalPages > 0 && (
            <button
              type="button"
              className="toolbar-icon-btn"
              onClick={() => setTocOpen((v) => !v)}
              title="Open Table of Contents"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          )}
          {searchOpen && (
            <div className="flex items-center gap-1 border border-[#e7e5e4] rounded-lg px-2 py-1 bg-white shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Trigger search with the current PDF blob — we need it from props
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                  if (e.key === 'Enter') {
                    if (pdfFileBlob) void searchInPDF(searchQuery, pdfFileBlob, totalPages);
                  }
                }}
                placeholder="Search…"
                className="border-none outline-none text-[12px] text-[#444] bg-transparent w-36 placeholder:text-[#c4bdb9]"
              />
              {searchLoading ? (
                <span className="text-[10px] text-[#a8a29e]">…</span>
              ) : searchResultPage ? (
                <span className="text-[10px] text-[#0d9488] font-medium">p.{searchResultPage}</span>
              ) : searchQuery && !searchLoading ? (
                <span className="text-[10px] text-[#a8a29e]">no match</span>
              ) : null}
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="text-[#a8a29e] hover:text-[#78716c] transition-colors leading-none"
              >
                ×
              </button>
            </div>
          )}
          {!searchOpen && hasDocument && (
            <button
              type="button"
              className="toolbar-icon-btn"
              onClick={() => setSearchOpen(true)}
              title="Search (Ctrl+F)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex overflow-hidden">
        <div
          id="pdf-scroll-container"
          className={`flex-1 min-w-0 overflow-auto p-4 ${isAICardDragOver ? 'ai-card-drop-active' : ''}`}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {hasDocument ? (
            <div className="relative">
              {/* Reading progress + stats */}
              {totalPages > 0 && (
                <>
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] text-[#a8a29e] tabular-nums">
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <span
                      className="text-[10px] text-[#a8a29e] cursor-pointer hover:text-[#78716c] transition-colors"
                      onClick={(e) => {
                        const bar = (e.currentTarget.parentElement?.nextElementSibling as HTMLElement | null);
                        if (!bar) return;
                        const rect = bar.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        onJumpToPage(Math.max(1, Math.round(ratio * totalPages)));
                      }}
                      title="点击进度条跳转页面"
                    >
                      {Math.round((currentPage / totalPages) * 100)}%
                    </span>
                  </div>
                  <div
                    title={`第 ${currentPage} / ${totalPages} 页 — 点击跳转`}
                    className="sticky top-0 z-10 h-[3px] bg-[#e7e5e4] rounded-full overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      onJumpToPage(Math.max(1, Math.round(ratio * totalPages)));
                    }}
                  >
                    <div
                      className="h-full bg-[#0d9488] rounded-full transition-all duration-200"
                      style={{ width: `${(currentPage / totalPages) * 100}%` }}
                    />
                  </div>
                </>
              )}
              <div id="pdf-pages-container" className="pdf-pages-container" />
              {isLoading && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 shadow-md border border-[#e7e5e4] backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#c2410c] animate-pulse" />
                  <p className="text-[11px] text-[#78716c] font-medium whitespace-nowrap">Rendering…</p>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 animate-in fade-in">
              <div className="loading-pulse" />
              <p className="text-[13px] text-[#78716c] font-medium">Processing PDF…</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#fafaf9] to-[#e7e5e4] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <p className="text-[13px] text-[#a8a29e]">Upload a PDF to get started</p>
            </div>
          )}
        </div>

        {splitMode && hasDocument && totalPages > 0 && (
          <aside className="relative w-[45%] min-w-[340px] max-w-[55%] border-l border-[#e7e5e4] bg-[#fafaf9] flex flex-col">
            <div className="border-b border-[#e7e5e4] bg-white/90">
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
                  <span className="text-[11px] text-[#78716c]">page {comparePage} / {totalPages}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${compareFollowCitation ? 'bg-[#c2410c]/10 text-[#c2410c]' : 'text-[#a8a29e] hover:text-[#78716c]'}`}
                    onClick={() => setCompareFollowCitation((v) => !v)}
                    title={compareFollowCitation ? 'Auto-follow: syncs with main view scroll & citation clicks' : 'Manual navigation only'}
                  >
                    {compareFollowCitation ? 'Auto-follow' : 'Manual'}
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e7e5e4] bg-white text-[#78716c] transition-all hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] active:scale-95"
                    onClick={() => setSplitMode(false)}
                    title="Close reference pane (back to AI chat)"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
              {/* Row 2: Navigation controls */}
              <div className="flex h-8 items-center gap-1 border-t border-[#fafaf9] px-3">
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
                <span className="mx-0.5 text-[#e7e5e4]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(comparePage - 1)} disabled={comparePage <= 1}>Prev</button>
                <input
                  value={comparePageInput}
                  onChange={(e) => setComparePageInput(e.target.value)}
                  onBlur={handleComparePageSubmit}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleComparePageSubmit(); }}
                  className="h-6 w-12 rounded border border-[#e7e5e4] px-1.5 text-center text-[11px] text-[#78716c] outline-none focus:border-[#c2410c]"
                />
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(comparePage + 1)} disabled={comparePage >= totalPages}>Next</button>
                <button type="button" className="ref-pane-btn" onClick={() => navigateComparePage(currentPage)}>Sync</button>
                <span className="mx-0.5 text-[#e7e5e4]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}>−</button>
                <span className="min-w-[32px] text-center text-[10px] text-[#78716c]">{Math.round(compareZoom * 100)}%</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}>+</button>
                <span className="mx-0.5 text-[#e7e5e4]">|</span>
                <button type="button" className="ref-pane-btn" onClick={() => setCompareTocOpen((v) => !v)}>
                  {compareTocOpen ? 'Hide TOC' : 'TOC'}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div id="pdf-compare-container" className="pdf-compare-container" />
            </div>
            {compareTocOpen && (
              <aside className="absolute right-0 top-11 bottom-0 w-[260px] border-l border-[#e7e5e4] bg-white/98 backdrop-blur z-10 overflow-auto">
                <div className="sticky top-0 border-b border-[#fafaf9] bg-white px-3 py-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[#78716c]">Compare TOC</h4>
                    <button
                      className="text-[11px] text-[#78716c] hover:text-[#1c1917]"
                      onClick={() => setCompareTocOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <input
                    value={compareTocQuery}
                    onChange={(e) => setCompareTocQuery(e.target.value)}
                    className="mt-2 w-full rounded-md border border-[#e7e5e4] px-2 py-1 text-[11px] text-[#78716c] outline-none focus:border-[#c2410c]"
                    placeholder="Search in TOC..."
                  />
                </div>
                <div className="p-2">
                  {filteredCompareOutline.length === 0 && (
                    <p className="px-2 py-3 text-[11px] text-[#a8a29e]">No matched entries</p>
                  )}
                  {filteredCompareOutline.map((item) => (
                    <button
                      key={`compare-${item.id}`}
                      className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${
                        item.id === compareActiveOutlineId ? 'bg-[#f5f3ff] text-[#7c3aed]' : 'hover:bg-[#fafaf9] text-[#78716c]'
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
                      {item.pageNumber && <span className="ml-1 text-[10px] text-[#a8a29e]">p.{item.pageNumber}</span>}
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </aside>
        )}
      </div>

      {tocOpen && hasDocument && totalPages > 0 && (
        <aside className="absolute right-0 top-11 bottom-0 w-[280px] bg-white/[0.97] border-l border-[#e7e5e4]/60 shadow-2xl backdrop-blur-xl z-20 flex flex-col animate-in slide-in-from-right">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#fafaf9]">
            <h3 className="text-[13px] font-semibold text-[#1c1917]">Contents</h3>
            <button className="text-[11px] text-[#a8a29e] hover:text-[#78716c] transition-colors" onClick={() => setTocOpen(false)}>
              Close
            </button>
          </div>
          <div className="px-3 pt-2 pb-1.5">
            <input
              value={tocQuery}
              onChange={(e) => setTocQuery(e.target.value)}
              className="w-full rounded-lg border border-[#e7e5e4] bg-[#fafaf9] px-2.5 py-1.5 text-[12px] text-[#78716c] outline-none focus:border-[#c2410c] focus:ring-2 focus:ring-[#c2410c]/10 transition-all placeholder:text-[#a8a29e]"
              placeholder="Search…"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {filteredOutline.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-[#a8a29e]">No matching entries</p>
            )}
            {filteredOutline.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left rounded-lg px-2 py-1.5 text-[12px] leading-snug transition-all duration-100 ${
                  item.id === activeOutlineId
                    ? 'bg-[#FEF2F2] text-[#c2410c] font-medium'
                    : 'text-[#78716c] hover:bg-[#fafaf9]'
                }`}
                style={{ paddingLeft: `${8 + item.level * 12}px` }}
                disabled={!item.pageNumber}
                onClick={() => { if (item.pageNumber) onJumpToPage(item.pageNumber); }}
              >
                <span>{item.title}</span>
                {item.pageNumber && <span className="ml-1.5 text-[10px] tabular-nums text-[#a8a29e]">p{item.pageNumber}</span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {!tocOpen && hasDocument && totalPages > 0 && (
        <button
          type="button"
          className="absolute right-5 bottom-5 z-20 flex items-center gap-1.5 rounded-full border border-[#e7e5e4] bg-white/90 px-3.5 py-2 text-[11px] font-medium text-[#78716c] shadow-lg backdrop-blur-lg transition-all duration-200 hover:bg-white hover:shadow-xl hover:scale-[1.03] active:scale-[0.97]"
          onClick={() => setTocOpen(true)}
          title="Open Table of Contents"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          p{currentPage}
        </button>
      )}

      {/* Context toolbar for selected text — iOS/Mac-style inline action bar */}
      {textHandle && (
        <>
          {/* Invisible backdrop to catch outside clicks */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => { setTextHandle(null); globalThis.getSelection?.()?.removeAllRanges(); }}
            onMouseDown={(e) => {
              // Don't dismiss if clicking inside the toolbar itself
              if ((e.target as HTMLElement).closest('[data-text-toolbar]')) return;
              setTextHandle(null);
              globalThis.getSelection?.()?.removeAllRanges();
            }}
          />
          {/* Toolbar */}
          <div
            data-text-toolbar
            className="text-action-toolbar fixed z-40 flex items-center gap-0.5 rounded-xl border border-[#e7e5e4]/80 bg-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08)] px-1 py-1 backdrop-blur-md"
            style={{ left: textHandle.x, top: textHandle.y, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="text-action-btn"
              title="Highlight"
              onClick={() => {
                globalThis.getSelection?.()?.removeAllRanges();
                setTextHandle(null);
                onHighlightSelection();
              }}
            >
              <span className="text-action-icon"><Highlighter size={14} /></span>
              <span className="text-action-label">Highlight</span>
            </button>

            <div className="text-action-divider" />

            <button
              type="button"
              className="text-action-btn"
              title="Add Note"
              onClick={() => {
                globalThis.getSelection?.()?.removeAllRanges();
                setTextHandle(null);
                onAddNoteSelection();
              }}
            >
              <span className="text-action-icon"><StickyNote size={14} /></span>
              <span className="text-action-label">Note</span>
            </button>

            <div className="text-action-divider" />

            <button
              type="button"
              className="text-action-btn text-action-btn--ai"
              title="Ask AI about selected text"
              onClick={() => {
                globalThis.getSelection?.()?.removeAllRanges();
                setTextHandle(null);
                onExplainSelection();
              }}
            >
              <span className="text-action-icon"><MessageCircleQuestion size={14} /></span>
              <span className="text-action-label">Ask AI</span>
            </button>

            <div className="text-action-divider" />

            <button
              type="button"
              className="text-action-btn"
              title="Copy selected text"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(textHandle.text);
                } catch { /* ignore */ }
                globalThis.getSelection?.()?.removeAllRanges();
                setTextHandle(null);
              }}
            >
              <span className="text-action-icon"><Copy size={14} /></span>
              <span className="text-action-label">Copy</span>
            </button>
          </div>
        </>
      )}

      {contextMenu && (
        <div
          className="ctx-menu fixed z-30"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {hasDocument && totalPages > 0 && (
            <button className="ctx-menu-item" onClick={() => { setTocOpen(true); setContextMenu(null); }}>
              Open TOC
            </button>
          )}
          <button className="ctx-menu-item" onClick={() => { onHighlightSelection(); setContextMenu(null); }}>
            Highlight
          </button>
          <button className="ctx-menu-item" onClick={() => { setContextMenu(null); onAddNoteSelection(contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined, contextMenu?.targetPageNumber); }}>
            Add Note
          </button>
          <button className="ctx-menu-item" onClick={() => { onExplainSelection(); setContextMenu(null); }}>
            Explain with AI
          </button>
          <button className="ctx-menu-item" onClick={() => {
            const sel = globalThis.getSelection?.();
            const text = sel?.toString().trim() ?? '';
            const page = contextMenu?.targetPageNumber;
            if (text) {
              globalThis.document?.dispatchEvent(new CustomEvent('text-attachment-drop', {
                detail: { content: text, page },
                bubbles: true,
              }));
            }
            setContextMenu(null);
          }}>
            Attach to AI Panel
          </button>
        </div>
      )}
    </main>
  );
}
