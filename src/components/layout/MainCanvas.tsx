import { ZoomIn, ZoomOut, X } from 'lucide-react';
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
  onAddNoteSelection: (clickX?: number, clickY?: number) => void;
  onOpenNotesManager?: () => void;
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
  onOpenNotesManager,
  onExplainSelection,
  onDropAICard,
  documentId,
  onToggleFocusMode,
  isFocusMode,
  comparePageSignal,
  comparePaneCommand,
  onSplitModeChange,
}: MainCanvasProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [tocQuery, setTocQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isAICardDragOver, setIsAICardDragOver] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [comparePage, setComparePage] = useState(1);
  const [compareFollowCitation, setCompareFollowCitation] = useState(true);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePageInput, setComparePageInput] = useState('1');
  const [compareTocOpen, setCompareTocOpen] = useState(false);
  const [compareTocQuery, setCompareTocQuery] = useState('');
  const [compareHistory, setCompareHistory] = useState<number[]>([]);
  const [compareHistoryIndex, setCompareHistoryIndex] = useState(-1);
  const [splitReason, setSplitReason] = useState<'evidence' | 'reference' | 'compare'>('compare');

  // Canvas mode state
  const [canvasCards, setCanvasCards] = useState<Array<{
    id: string;
    kind: 'note' | 'ai-card';
    content: string;
    selectedText?: string;
    messageId?: string;
    pageNumber: number;
    x: number;
    y: number;
    annotationId: string;
  }>>([]);

  const [draggingCanvasCard, setDraggingCanvasCard] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);

  const canvasStateStorageKey = documentId
    ? `main_canvas_cards:${documentId}`
    : 'main_canvas_cards:global';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(canvasStateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCanvasCards(parsed.filter((c: any) =>
          c && typeof c.id === 'string' && typeof c.x === 'number' && typeof c.y === 'number'
        ));
      }
    } catch {
      // ignore malformed state
    }
  }, [canvasStateStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(canvasStateStorageKey, JSON.stringify(canvasCards));
    } catch {
      // ignore persist failure
    }
  }, [canvasStateStorageKey, canvasCards]);

  // Notify parent when split mode changes so it can adjust layout (e.g. hide AI panel).
  useEffect(() => {
    onSplitModeChange?.(splitMode || canvasMode);
  }, [splitMode, canvasMode, onSplitModeChange]);

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
    const types = Array.from(event.dataTransfer.types);
    const hasAiCard = types.includes('application/x-ai-card') || types.includes('text/plain');
    if (!hasAiCard) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsAICardDragOver(true);
  };

  const handleDragLeave = () => {
    setIsAICardDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    let raw = event.dataTransfer.getData('application/x-ai-card');
    if (!raw) {
      const plain = event.dataTransfer.getData('text/plain');
      if (plain.startsWith('__AICARD__')) raw = plain.slice('__AICARD__'.length);
    }
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

  // Canvas card drag handlers
  const handleCanvasCardPointerDown = (e: React.PointerEvent, cardId: string) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setDraggingCanvasCard(cardId);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    target.setPointerCapture(e.pointerId);
  };

  const handleCanvasCardPointerMove = (e: React.PointerEvent) => {
    if (!draggingCanvasCard) return;
    const canvasEl = globalThis.document?.getElementById('canvas-drop-zone');
    if (!(canvasEl instanceof HTMLElement)) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    const x = e.clientX - canvasRect.left - dragOffset.x;
    const y = e.clientY - canvasRect.top - dragOffset.y;
    setCanvasCards((prev) =>
      prev.map((c) => (c.id === draggingCanvasCard ? { ...c, x: Math.max(0, x), y: Math.max(0, y) } : c))
    );
  };

  const handleCanvasCardPointerUp = () => {
    setDraggingCanvasCard(null);
  };

  const handleRemoveCanvasCard = (cardId: string) => {
    setCanvasCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    const hasAiCard = types.includes('application/x-ai-card') || types.includes('text/plain');
    if (!hasAiCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsCanvasDragOver(true);
  };

  const handleCanvasDragLeave = () => {
    setIsCanvasDragOver(false);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragOver(false);
    const canvasEl = globalThis.document?.getElementById('canvas-drop-zone');
    if (!(canvasEl instanceof HTMLElement)) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    const dropX = e.clientX - canvasRect.left;
    const dropY = e.clientY - canvasRect.top;

    // Try to parse AI card
    let raw = e.dataTransfer.getData('application/x-ai-card');
    if (!raw) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain.startsWith('__AICARD__')) raw = plain.slice('__AICARD__'.length);
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { messageId?: string; content?: string; pageHint?: number };
        if (parsed.messageId && parsed.content) {
          const cardId = `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setCanvasCards((prev) => [
            ...prev,
            {
              id: cardId,
              kind: 'ai-card',
              content: parsed.content!,
              messageId: parsed.messageId,
              pageNumber: parsed.pageHint || currentPage || 1,
              x: dropX - 80,
              y: dropY - 40,
              annotationId: '',
            },
          ]);
          return;
        }
      } catch {
        // ignore malformed payload
      }
    }

    // Try to parse note card
    const noteRaw = e.dataTransfer.getData('application/x-note-card');
    if (noteRaw) {
      try {
        const parsed = JSON.parse(noteRaw) as {
          id?: string; annotationId?: string; content?: string; selectedText?: string; pageNumber?: number;
        };
        if (parsed.annotationId && parsed.content) {
          const cardId = `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setCanvasCards((prev) => [
            ...prev,
            {
              id: cardId,
              kind: 'note',
              content: parsed.content!,
              selectedText: parsed.selectedText,
              pageNumber: parsed.pageNumber || currentPage || 1,
              x: dropX - 80,
              y: dropY - 40,
              annotationId: parsed.annotationId!,
            },
          ]);
        }
      } catch {
        // ignore malformed payload
      }
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
    <main className="flex-1 min-w-0 overflow-hidden flex flex-col bg-[#EEF2F7] relative">
      {/* Toolbar – glassmorphism + compact spacing */}
      <div className="h-11 border-b border-[#E3E8F0]/60 bg-white/80 backdrop-blur-xl flex items-center justify-between px-3 gap-2 select-none">
        <div className="flex items-center gap-1.5">
          <button type="button" className="toolbar-icon-btn" onClick={onZoomOut} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <span className="min-w-[38px] text-center text-[12px] font-medium tabular-nums text-[#475569]">{Math.round(zoomLevel * 100)}%</span>
          <button type="button" className="toolbar-icon-btn" onClick={onZoomIn} title="Zoom in">
            <ZoomIn size={15} />
          </button>
          {totalPages > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-[#E3E8F0]" />
              <span className="text-[12px] tabular-nums text-[#64748B]">
                {currentPage}<span className="mx-0.5 text-[#CBD5E1]">/</span>{totalPages}
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
              if (canvasMode) setCanvasMode(false);
            }}
            disabled={!hasDocument || totalPages <= 0}
            title={hasDocument && totalPages > 0 ? 'Open reference pane for side-by-side reading' : 'Load a document first'}
            className="!h-7 !px-2.5 !text-[11px]"
          >
            {splitMode ? 'Close Ref' : 'Reference'}
          </Button>
          <Button
            variant={canvasMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setCanvasMode((v) => !v);
              if (!canvasMode) setSplitMode(false);
            }}
            disabled={!hasDocument}
            title={hasDocument ? 'Open thinking canvas for free-form note layout' : 'Load a document first'}
            className="!h-7 !px-2.5 !text-[11px]"
          >
            {canvasMode ? 'Close Canvas' : 'Canvas'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onHighlightSelection} disabled={!hasDocument} className="!h-7 !px-2.5 !text-[11px]">
            Highlight
          </Button>
          {hasDocument && (
            <Button variant="secondary" size="sm" onClick={onOpenNotesManager} className="!h-7 !px-2.5 !text-[11px]">
              Notes
            </Button>
          )}
          {hasDocument && totalPages > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setTocOpen((v) => !v)} className="!h-7 !px-2.5 !text-[11px]">
              {tocOpen ? 'Hide TOC' : 'TOC'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex overflow-hidden">
        <div
          id="pdf-scroll-container"
          className={`flex-1 min-w-0 overflow-auto p-4 ${isAICardDragOver ? 'ai-card-drop-active' : ''}`}
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
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 shadow-md border border-[#E3E8F0] backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#E42313] animate-pulse" />
                  <p className="text-[11px] text-[#475569] font-medium whitespace-nowrap">Rendering…</p>
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 animate-in fade-in">
              <div className="loading-pulse" />
              <p className="text-[13px] text-[#475569] font-medium">Processing PDF…</p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <p className="text-[13px] text-[#94A3B8]">Upload a PDF to get started</p>
            </div>
          )}
        </div>

        {canvasMode && hasDocument && (
          <aside className="relative w-[45%] min-w-[340px] max-w-[55%] border-l border-[#E3E8F0] bg-[#FAFAF9] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b border-[#E3E8F0] bg-white/90 px-3 h-8 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#6B21A8] bg-[#FAF5FF] border border-[#E9D5FF] px-2 py-0.5 rounded-full">
                  Canvas
                </span>
                <span className="text-[11px] text-[#94A3B8]">{canvasCards.length} card{canvasCards.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#CBD5E1]">drag cards freely</span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E3E8F0] bg-white text-[#64748B] transition-all hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] active:scale-95"
                  onClick={() => setCanvasMode(false)}
                  title="Close canvas"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Canvas Drop Zone */}
            <div
              id="canvas-drop-zone"
              className={`flex-1 overflow-auto relative ${isCanvasDragOver ? 'bg-[#FAF5FF]' : ''} transition-colors duration-150`}
              style={{
                backgroundImage: 'radial-gradient(circle, #D1D5DB 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0',
              }}
              onDragOver={handleCanvasDragOver}
              onDragLeave={handleCanvasDragLeave}
              onDrop={handleCanvasDrop}
              onPointerMove={handleCanvasCardPointerMove}
              onPointerUp={handleCanvasCardPointerUp}
            >
              {canvasCards.length === 0 && !isCanvasDragOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] flex items-center justify-center mb-3">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  </div>
                  <p className="text-[12px] text-[#A78BFA] font-medium mb-1">Drop cards here</p>
                  <p className="text-[11px] text-[#C4B5FD]">Drag AI cards or notes to organize</p>
                </div>
              )}

              {isCanvasDragOver && (
                <div className="absolute inset-3 border-2 border-dashed border-[#A78BFA] rounded-2xl bg-[#FAF5FF]/60 flex items-center justify-center z-10 pointer-events-none">
                  <span className="text-[13px] text-[#7C3AED] font-medium">Drop to add to canvas</span>
                </div>
              )}

              {canvasCards.map((card) => (
                <div
                  key={card.id}
                  className={`absolute select-none ${card.kind === 'ai-card' ? 'pdf-ai-card' : 'pdf-note-card'} ${
                    draggingCanvasCard === card.id ? 'opacity-50 cursor-grabbing' : 'cursor-grab'
                  }`}
                  style={{ left: card.x, top: card.y }}
                  onPointerDown={(e) => handleCanvasCardPointerDown(e, card.id)}
                >
                  {card.kind === 'ai-card' && (
                    <div className="pdf-ai-card-header">AI Card · p{card.pageNumber}</div>
                  )}
                  {card.kind === 'note' && (
                    <div className="text-[10px] font-semibold text-sky-700 mb-1">Note · p{card.pageNumber}</div>
                  )}
                  <div className="note-card-display text-[11px]">{card.content}</div>
                  {card.selectedText && (
                    <div className="mt-1.5 pl-2 border-l-2 border-sky-200 text-[10px] text-slate-500 italic line-clamp-2">
                      {card.selectedText}
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    <button
                      type="button"
                      className="text-[10px] text-[#94A3B8] hover:text-[#7C3AED] transition-colors"
                      onClick={() => {
                        if (card.kind === 'ai-card' && card.annotationId) {
                          onJumpToPage(card.pageNumber);
                        }
                      }}
                      title="Go to source page"
                    >
                      → p{card.pageNumber}
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-[10px] text-[#94A3B8] hover:text-red-500 transition-colors"
                      onClick={() => handleRemoveCanvasCard(card.id)}
                      title="Remove from canvas"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
        {splitMode && hasDocument && totalPages > 0 && (
          <aside className="relative w-[45%] min-w-[340px] max-w-[55%] border-l border-[#E3E8F0] bg-[#F8FAFC] flex flex-col">
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
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={`rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${compareFollowCitation ? 'bg-[#E42313]/10 text-[#E42313]' : 'text-[#94A3B8] hover:text-[#475569]'}`}
                    onClick={() => setCompareFollowCitation((v) => !v)}
                    title={compareFollowCitation ? 'Auto-follow: syncs with main view scroll & citation clicks' : 'Manual navigation only'}
                  >
                    {compareFollowCitation ? 'Auto-follow' : 'Manual'}
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E3E8F0] bg-white text-[#64748B] transition-all hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] active:scale-95"
                    onClick={() => setSplitMode(false)}
                    title="Close reference pane (back to AI chat)"
                  >
                    <X size={15} />
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
        <aside className="absolute right-0 top-11 bottom-0 w-[280px] bg-white/[0.97] border-l border-[#E3E8F0]/60 shadow-2xl backdrop-blur-xl z-20 flex flex-col animate-in slide-in-from-right">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEF2F7]">
            <h3 className="text-[13px] font-semibold text-[#1E293B]">Contents</h3>
            <button className="text-[11px] text-[#94A3B8] hover:text-[#334155] transition-colors" onClick={() => setTocOpen(false)}>
              Close
            </button>
          </div>
          <div className="px-3 pt-2 pb-1.5">
            <input
              value={tocQuery}
              onChange={(e) => setTocQuery(e.target.value)}
              className="w-full rounded-lg border border-[#E3E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-[12px] text-[#334155] outline-none focus:border-[#E42313] focus:ring-2 focus:ring-[#E42313]/10 transition-all placeholder:text-[#94A3B8]"
              placeholder="Search…"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {filteredOutline.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-[#94A3B8]">No matching entries</p>
            )}
            {filteredOutline.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left rounded-lg px-2 py-1.5 text-[12px] leading-snug transition-all duration-100 ${
                  item.id === activeOutlineId
                    ? 'bg-[#FEF2F2] text-[#C62314] font-medium'
                    : 'text-[#475569] hover:bg-[#F8FAFC]'
                }`}
                style={{ paddingLeft: `${8 + item.level * 12}px` }}
                disabled={!item.pageNumber}
                onClick={() => { if (item.pageNumber) onJumpToPage(item.pageNumber); }}
              >
                <span>{item.title}</span>
                {item.pageNumber && <span className="ml-1.5 text-[10px] tabular-nums text-[#94A3B8]">p{item.pageNumber}</span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {!tocOpen && hasDocument && totalPages > 0 && (
        <button
          type="button"
          className="absolute right-5 bottom-5 z-20 flex items-center gap-1.5 rounded-full border border-[#E3E8F0] bg-white/90 px-3.5 py-2 text-[11px] font-medium text-[#475569] shadow-lg backdrop-blur-lg transition-all duration-200 hover:bg-white hover:shadow-xl hover:scale-[1.03] active:scale-[0.97]"
          onClick={() => setTocOpen(true)}
          title="Open Table of Contents"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          p{currentPage}
        </button>
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
          <button className="ctx-menu-item" onClick={() => { onAddNoteSelection(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
            Add Note
          </button>
          <button className="ctx-menu-item" onClick={() => { onExplainSelection(); setContextMenu(null); }}>
            Explain with AI
          </button>
        </div>
      )}
    </main>
  );
}
