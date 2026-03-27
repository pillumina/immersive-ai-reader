import { ZoomIn, ZoomOut, X, StickyNote, MessageCircleQuestion, Highlighter, Copy } from 'lucide-react';
import { DragEvent, MouseEvent, WheelEvent, PointerEvent, useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  onAddNoteSelection: (
    position?: { x: number; y: number },
    targetPageNumber?: number,
    capturedText?: string,
    capturedRange?: { left: number; top: number; width: number; height: number; pageNumber: number }
  ) => void;
  onExplainSelection: () => void;
  onDropAICard: (payload: { messageId: string; content: string; pageHint?: number }, clientX: number, clientY: number) => void;
  documentId?: string;
  onToggleFocusMode: () => void;
  isFocusMode: boolean;
  /** Called when L1 "+" bubble is clicked — opens L2 AI popover */
  onOpenL2Popover?: (position: { x: number; y: number }, text: string, page?: number) => void;
  comparePageSignal?: number | null;
  comparePaneCommand?: {
    page: number;
    openSplit?: boolean;
    reason?: 'evidence' | 'reference' | 'compare';
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
  onOpenL2Popover,
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

  // L1 bubble state (Focus Mode auto-highlight + "+" button)
  type L1Bubble = { x: number; y: number; text: string; page?: number };
  const [l1Bubble, setL1Bubble] = useState<L1Bubble | null>(null);
  const l1BubbleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textHandleRef = useRef<{ x: number; y: number; page?: number; text: string } | null>(null);
  const compareStageRef = useRef<HTMLElement | null>(null);
  const [, forceTextToolbarUpdate] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResultPages, setSearchResultPages] = useState<number[]>([]);
  const [searchCurrentIndex, setSearchCurrentIndex] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);

  /** Per-page search match positions (in CSS px, relative to page container top-left) */
  type SearchMatchPos = { x: number; y: number; width: number; height: number };
  const [searchMatches, setSearchMatches] = useState<Map<number, SearchMatchPos[]>>(new Map());

  /** Remove all search highlight overlays from a page */
  const clearSearchHighlightsOnPage = (pageNumber: number) => {
    const containerEl = globalThis.document?.getElementById('pdf-pages-container');
    if (!containerEl) return;
    containerEl.querySelectorAll(`.pdf-search-highlight[data-page="${pageNumber}"]`).forEach((el) => el.remove());
  };

  /** Render search highlight overlays for all matches on a given page.
   *  `currentIdx` is passed explicitly (not read from state) to avoid stale closure. */
  const renderSearchHighlightsOnPage = useCallback((
    pageNumber: number,
    matches: SearchMatchPos[],
    pageMatchesOffset: number,
    totalPageMatches: number,
    currentIdx: number
  ) => {
    const containerEl = globalThis.document?.getElementById('pdf-pages-container');
    const scrollEl = globalThis.document?.getElementById('pdf-scroll-container');
    if (!containerEl || !scrollEl) return;

    // Remove old highlights on this page first
    clearSearchHighlightsOnPage(pageNumber);

    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;

    // The text layer sits on top of the canvas, same dimensions
    const textLayerEl = pageEl.querySelector<HTMLElement>('.pdf-text-layer');
    if (!textLayerEl) return;

    matches.forEach((match, localIdx) => {
      const isCurrent = pageMatchesOffset + localIdx === currentIdx;
      const hl = globalThis.document!.createElement('div');
      hl.className = `pdf-search-highlight${isCurrent ? ' is-current' : ''}`;
      hl.dataset.page = String(pageNumber);
      hl.style.cssText = [
        'position:absolute',
        `left:${match.x}px`,
        `top:${match.y}px`,
        `width:${match.width}px`,
        `height:${match.height}px`,
        'pointer-events:none',
        'z-index:4',
        'border-radius:2px',
        isCurrent
          ? 'background:rgba(234,179,8,0.45);box-shadow:0 0 0 2px rgba(234,179,8,0.7)'
          : 'background:rgba(234,179,8,0.25)',
      ].join(';');
      textLayerEl.appendChild(hl);
    });

    // Scroll the active match into view
    if (pageMatchesOffset + totalPageMatches > currentIdx) {
      const currentHl = pageEl.querySelector<HTMLElement>('.pdf-search-highlight.is-current');
      if (currentHl) {
        currentHl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [clearSearchHighlightsOnPage]);

  /** Clear all search highlights from all pages */
  const clearAllSearchHighlights = () => {
    const containerEl = globalThis.document?.getElementById('pdf-pages-container');
    if (!containerEl) return;
    containerEl.querySelectorAll('.pdf-search-highlight').forEach((el) => el.remove());
  };

  // Monitor text selection to show the L1 "+" bubble in Focus Mode.
  // Uses pointerdown/mouseup/pointerup to detect selection vs. click gestures.
  useEffect(() => {
    if (!isFocusMode) return;

    let pointerDownAt: { x: number; y: number } | null = null;
    let isDragging = false;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownAt = { x: e.clientX, y: e.clientY };
      isDragging = false;
      // Dismiss bubble on any pointer press (unless it's a selection drag)
      if (l1BubbleHideTimerRef.current) { clearTimeout(l1BubbleHideTimerRef.current); l1BubbleHideTimerRef.current = null; }
      setL1Bubble(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerDownAt) {
        const dx = e.clientX - pointerDownAt.x;
        const dy = e.clientY - pointerDownAt.y;
        if (dx * dx + dy * dy > 25) isDragging = true; // moved > 5px
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        const sel = globalThis.getSelection?.();
        if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const pageEl = range.commonAncestorContainer instanceof Node
              ? (range.commonAncestorContainer as Node).ownerDocument
                  ?.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
                  ?.closest('.pdf-page') as HTMLElement | null
              : null;
            if (pageEl) {
              const page = Number(pageEl.dataset.pageNumber || '0') || undefined;
              const bubbleX = rect.right + 8;
              const bubbleY = rect.top + rect.height / 2;
              setL1Bubble({ x: bubbleX, y: bubbleY, text: sel.toString().trim(), page });
              l1BubbleHideTimerRef.current = setTimeout(() => setL1Bubble(null), 3000);
            }
          }
        }
      }
      pointerDownAt = null;
      isDragging = false;
    };

    const onPointerUp = () => {
      pointerDownAt = null;
      isDragging = false;
    };

    const doc = globalThis.document as Document | null;
    if (!doc) return;

    const target = doc as unknown as EventTarget;
    target.addEventListener('pointerdown', onPointerDown as unknown as EventListener, { passive: true });
    target.addEventListener('pointermove', onPointerMove as unknown as EventListener, { passive: true });
    doc.addEventListener('mouseup', onMouseUp);
    target.addEventListener('pointerup', onPointerUp as unknown as EventListener);

    return () => {
      target.removeEventListener('pointerdown', onPointerDown as unknown as EventListener);
      target.removeEventListener('pointermove', onPointerMove as unknown as EventListener);
      doc.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('pointerup', onPointerUp as unknown as EventListener);
      if (l1BubbleHideTimerRef.current) { clearTimeout(l1BubbleHideTimerRef.current); l1BubbleHideTimerRef.current = null; }
    };
  }, [isFocusMode]);

  // Hide L1 bubble on scroll in Focus Mode.
  useEffect(() => {
    if (!isFocusMode) return;
    const scrollContainer = globalThis.document?.getElementById('pdf-scroll-container');
    if (!scrollContainer) return;
    const handler = () => {
      if (l1BubbleHideTimerRef.current) { clearTimeout(l1BubbleHideTimerRef.current); l1BubbleHideTimerRef.current = null; }
      setL1Bubble(null);
    };
    scrollContainer.addEventListener('scroll', handler, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handler);
  }, [isFocusMode]);

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
        setSearchOpen((prev) => {
          if (!prev) setSearchQuery(''); // clear query when opening
          else { setSearchResultPages([]); setSearchMatches(new Map()); clearAllSearchHighlights(); }
          return !prev;
        });
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, []);

  // Escape dismisses the text selection toolbar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && textHandleRef.current) {
        globalThis.getSelection?.()?.removeAllRanges();
        textHandleRef.current = null;
        forceTextToolbarUpdate((n) => n + 1);
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, []);

  // Search PDF text across all pages, collect all matches.
  // Processes pages in batches of 20, yielding to the main thread between batches
  // to keep the UI responsive on large documents.
  const searchInPDF = useCallback(async (query: string, fileBlob: Blob, total: number) => {
    if (!query.trim()) { setSearchResultPages([]); return; }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const file = fileBlob instanceof File ? fileBlob : new File([fileBlob], 'doc.pdf', { type: 'application/pdf' });
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const q = query.toLowerCase();
      const pageMatchesMap = new Map<number, SearchMatchPos[]>();
      const BATCH_SIZE = 20;
      const maxPage = Math.min(total, pdfDoc.numPages);
      for (let batchStart = 1; batchStart <= maxPage; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, maxPage);
        for (let i = batchStart; i <= batchEnd; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const pageMatchPos: SearchMatchPos[] = [];
          // Use PDF.js findText for precise per-match bounding boxes
          // normalizeViewportCoords: converts PDF coords → CSS pixels automatically
          const textItems = await page.getTextContent();
          for (const item of textItems.items as any[]) {
            const itemText = item.str || '';
            const itemTextLower = itemText.toLowerCase();
            // Only highlight if query is a whole word, full item text, or item starts with query
            const wordBoundaryRegex = new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`, 'i');
            if (itemTextLower === q || wordBoundaryRegex.test(itemText) || itemTextLower.startsWith(q)) {
              const tx = item.transform[4] ?? 0;
              const ty = item.transform[5] ?? 0;
              const scale = viewport.scale;
              const cssX = tx * scale;
              // PDF y origin is bottom-left; browser y origin is top-left
              const cssY = (viewport.height - ty) * scale;
              // Use canvas measureText for accurate width (item.width is unreliable in PDF.js 4.x)
              const measWidth = (() => {
                try {
                  const c = globalThis.document?.createElement('canvas');
                  if (!c) return 0;
                  const ctx2d = c.getContext('2d');
                  if (!ctx2d) return 0;
                  // fontSize in PDF pts → multiply by scale to get CSS px
                  const cssFontSize = (item.fontSize ?? 12) * scale;
                  ctx2d.font = `${cssFontSize}px ${item.fontName ?? 'sans-serif'}`;
                  return ctx2d.measureText(itemText).width;
                } catch { return 0; }
              })();
              const itemH = Math.max((item.height ?? 12) * scale, 8);
              pageMatchPos.push({
                x: cssX,
                y: cssY - itemH,
                width: Math.max(measWidth, itemText.length * 5),
                height: itemH,
              });
            }
          }
          if (pageMatchPos.length > 0) {
            pageMatchesMap.set(i, pageMatchPos);
          }
        }
        // Yield to main thread between batches so UI stays responsive
        if (batchEnd < maxPage) {
          await new Promise<void>((resolve) => { globalThis.setTimeout(resolve, 0); });
        }
      }
      setSearchMatches(pageMatchesMap);
      const orderedPages = Array.from(pageMatchesMap.keys()).sort((a, b) => a - b);
      setSearchResultPages(orderedPages);
      setSearchCurrentIndex(0);
      if (orderedPages.length > 0) {
        onJumpToPage(orderedPages[0]);
        setTimeout(() => {
          const matches = pageMatchesMap.get(orderedPages[0]) || [];
          renderSearchHighlightsOnPage(orderedPages[0], matches, 0, matches.length, 0);
        }, 150);
      }
    } catch { /* silent */ }
    setSearchLoading(false);
  }, [onJumpToPage]);

  const goToPrevSearchResult = useCallback(() => {
    if (searchResultPages.length === 0) return;
    const newIndex = searchCurrentIndex > 0 ? searchCurrentIndex - 1 : searchResultPages.length - 1;
    setSearchCurrentIndex(newIndex);
    onJumpToPage(searchResultPages[newIndex]);
    setTimeout(() => {
      const pageNum = searchResultPages[newIndex];
      const matches = searchMatches.get(pageNum) || [];
      let pageOffset = 0;
      for (const p of searchResultPages) {
        if (p === pageNum) break;
        pageOffset += (searchMatches.get(p) || []).length;
      }
      clearAllSearchHighlights();
      renderSearchHighlightsOnPage(pageNum, matches, pageOffset, matches.length, newIndex);
    }, 150);
  }, [searchResultPages, searchCurrentIndex, searchMatches, onJumpToPage, renderSearchHighlightsOnPage]);

  const goToNextSearchResult = useCallback(() => {
    if (searchResultPages.length === 0) return;
    const newIndex = searchCurrentIndex < searchResultPages.length - 1 ? searchCurrentIndex + 1 : 0;
    setSearchCurrentIndex(newIndex);
    onJumpToPage(searchResultPages[newIndex]);
    setTimeout(() => {
      const pageNum = searchResultPages[newIndex];
      const matches = searchMatches.get(pageNum) || [];
      let pageOffset = 0;
      for (const p of searchResultPages) {
        if (p === pageNum) break;
        pageOffset += (searchMatches.get(p) || []).length;
      }
      clearAllSearchHighlights();
      renderSearchHighlightsOnPage(pageNum, matches, pageOffset, matches.length, newIndex);
    }, 150);
  }, [searchResultPages, searchCurrentIndex, searchMatches, onJumpToPage, renderSearchHighlightsOnPage]);

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

  const navigateComparePage = useCallback((target: number, options?: { recordHistory?: boolean }) => {
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
  }, [totalPages, compareHistoryIndex]);

  useEffect(() => {
    if (!splitMode || !compareFollowCitation) return;
    if (!comparePageSignal || comparePageSignal <= 0) return;
    setSplitReason('evidence');
    navigateComparePage(comparePageSignal);
  }, [splitMode, compareFollowCitation, comparePageSignal, navigateComparePage]);

  // Follow main view scroll: sync reference pane to the current page the user is viewing.
  useEffect(() => {
    if (!splitMode || !compareFollowCitation) return;
    if (currentPage <= 0 || currentPage === comparePage) return;
    navigateComparePage(currentPage);
  }, [splitMode, compareFollowCitation, currentPage, comparePage, navigateComparePage]);

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
  }, [comparePaneCommand, navigateComparePage]);

  useEffect(() => {
    if (!splitMode || !hasDocument || totalPages <= 0) {
      // Clean up previous stage if exists
      if (compareStageRef.current?.parentElement) {
        compareStageRef.current.parentElement.removeChild(compareStageRef.current);
        compareStageRef.current = null;
      }
      return;
    }
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
    compareStageRef.current = stage;

    return () => {
      if (stage.parentElement) {
        stage.parentElement.removeChild(stage);
      }
      compareStageRef.current = null;
    };
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

  const filteredOutline = useMemo(() => {
    if (!tocQuery.trim()) return outline;
    const q = tocQuery.trim().toLowerCase();
    return outline.filter((item) => item.title.toLowerCase().includes(q));
  }, [outline, tocQuery]);

  const activeOutlineId = useMemo(() => {
    const candidates = outline.filter((item) => typeof item.pageNumber === 'number' && (item.pageNumber || 0) <= currentPage);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1].id;
  }, [outline, currentPage]);

  const compareActiveOutlineId = useMemo(() => {
    const candidates = outline.filter((item) => typeof item.pageNumber === 'number' && (item.pageNumber || 0) <= comparePage);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1].id;
  }, [outline, comparePage]);

  const filteredCompareOutline = useMemo(() => {
    if (!compareTocQuery.trim()) return outline;
    const q = compareTocQuery.trim().toLowerCase();
    return outline.filter((item) => item.title.toLowerCase().includes(q));
  }, [outline, compareTocQuery]);

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
            <div className="flex items-center gap-1 border border-[#e7e5e4] rounded-lg px-2 py-1 bg-white shadow-sm min-w-[220px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  clearAllSearchHighlights();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResultPages([]); setSearchMatches(new Map()); clearAllSearchHighlights(); }
                  if (e.key === 'Enter') {
                    if (!pdfFileBlob) { setSearchError('请重新打开文档（从文件）以启用搜索'); return; }
                    if (!searchQuery.trim()) { setSearchError(null); return; }
                    setSearchError(null);
                    void searchInPDF(searchQuery, pdfFileBlob, totalPages);
                  }
                  if (e.key === 'F3' || (e.key === 'ArrowDown' && searchResultPages.length > 0)) {
                    e.preventDefault();
                    void goToNextSearchResult();
                  }
                  if (e.key === 'ArrowUp' && searchResultPages.length > 0) {
                    e.preventDefault();
                    void goToPrevSearchResult();
                  }
                }}
                placeholder="Search…"
                className="border-none outline-none text-[12px] text-[#444] bg-transparent w-24 placeholder:text-[#c4bdb9]"
              />
              {searchLoading ? (
                <span className="text-[10px] text-[#a8a29e]">…</span>
              ) : searchError ? (
                <span className="text-[10px] text-[#ef4444]">error</span>
              ) : searchResultPages.length > 0 ? (
                <span className="text-[10px] text-[#0d9488] font-medium whitespace-nowrap">
                  {searchCurrentIndex + 1}/{searchResultPages.length}
                </span>
              ) : searchQuery && !searchLoading ? (
                <span className="text-[10px] text-[#a8a29e]">no match</span>
              ) : null}
              {searchResultPages.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void goToPrevSearchResult()}
                    title="Previous (↑)"
                    className="text-[#a8a29e] hover:text-[#0d9488] transition-colors leading-none px-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void goToNextSearchResult()}
                    title="Next (↓)"
                    className="text-[#a8a29e] hover:text-[#0d9488] transition-colors leading-none px-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResultPages([]); }}
                className="text-[#a8a29e] hover:text-[#78716c] transition-colors leading-none ml-auto"
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

      {/* Reading progress stats — outside scroll container so it stays visible while scrolling */}
      {hasDocument && totalPages > 0 && (
        <div className="flex items-center justify-between mb-1 px-1 flex-shrink-0">
          <span className="text-[10px] text-[#a8a29e] tabular-nums">
            第 {currentPage} / {totalPages} 页
          </span>
          <span
            className="text-[10px] text-[#a8a29e] cursor-pointer hover:text-[#78716c] transition-colors"
            onClick={(e) => {
              const scrollEl = globalThis.document?.getElementById('pdf-scroll-container');
              if (!scrollEl) return;
              const scrollRect = scrollEl.getBoundingClientRect();
              const barWidth = scrollRect.width - 32;
              const offsetX = e.clientX - scrollRect.left - 16;
              const ratio = Math.max(0, Math.min(1, offsetX / barWidth));
              onJumpToPage(Math.max(1, Math.round(ratio * totalPages)));
            }}
            title="点击进度条跳转页面"
          >
            {Math.round((currentPage / totalPages) * 100)}%
          </span>
        </div>
      )}

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
          style={{ willChange: 'scroll-position' }}
        >
          {hasDocument ? (
            <div className="relative">
              {/* Visual progress bar — thin indicator */}
              {totalPages > 0 && (
                <div
                  className="mx-1 mb-2 h-[3px] bg-[#e7e5e4] rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const scrollEl = globalThis.document?.getElementById('pdf-scroll-container');
                    if (!scrollEl) return;
                    const scrollRect = scrollEl.getBoundingClientRect();
                    const barWidth = scrollRect.width - 32;
                    const offsetX = e.clientX - scrollRect.left - 16;
                    const ratio = Math.max(0, Math.min(1, offsetX / barWidth));
                    onJumpToPage(Math.max(1, Math.round(ratio * totalPages)));
                  }}
                  title={`第 ${currentPage} / ${totalPages} 页 — 点击跳转`}
                >
                  <div
                    className="h-full bg-[#0d9488] rounded-full transition-all duration-200"
                    style={{ width: `${(currentPage / totalPages) * 100}%` }}
                  />
                </div>
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
          className="absolute right-5 bottom-5 z-20 flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-raised)]/90 px-3.5 py-2 text-[11px] font-medium text-[var(--color-text-secondary)] shadow-lg backdrop-blur-lg transition-all duration-200 hover:bg-[var(--color-bg-raised)] hover:shadow-xl hover:scale-[1.03] active:scale-[0.97]"
          onClick={() => setTocOpen(true)}
          title="Open Table of Contents"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          p{currentPage}
        </button>
      )}

      {/* L1 "+" bubble in Focus Mode — replaces the full toolbar */}
      {isFocusMode && l1Bubble && (
        <button
          type="button"
          className="l1-bubble fixed z-50 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)]/80 bg-[var(--color-bg-raised)]/95 shadow-[0_2px_12px_rgba(28,25,23,0.15)] backdrop-blur-md transition-all duration-150 hover:scale-110 hover:bg-[var(--color-accent-subtle)] hover:border-[var(--color-accent-border)] active:scale-95"
          style={{ left: l1Bubble.x, top: l1Bubble.y, transform: 'translateY(-50%)' }}
          onClick={(e) => {
            e.stopPropagation();
            // Dismiss bubble and open L2 popover — capture values before clearing state
            const pos = { x: l1Bubble.x, y: l1Bubble.y };
            const text = l1Bubble.text;
            const page = l1Bubble.page;
            if (l1BubbleHideTimerRef.current) { clearTimeout(l1BubbleHideTimerRef.current); l1BubbleHideTimerRef.current = null; }
            setL1Bubble(null);
            onOpenL2Popover?.(pos, text, page);
          }}
          title="Open capture options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-accent)]">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Context toolbar for selected text — iOS/Mac-style inline action bar (NOT in Focus Mode) */}
      {!isFocusMode && textHandleRef.current && textHandleRef.current.text?.trim() && (
        <>
          {/* Invisible backdrop to catch outside clicks */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => { textHandleRef.current = null; forceTextToolbarUpdate((n) => n + 1); globalThis.getSelection?.()?.removeAllRanges(); }}
            onMouseDown={(e) => {
              // Don't dismiss if clicking inside the toolbar itself
              if ((e.target as HTMLElement).closest('[data-text-toolbar]')) return;
              textHandleRef.current = null;
              forceTextToolbarUpdate((n) => n + 1);
              globalThis.getSelection?.()?.removeAllRanges();
            }}
          />
          {/* Toolbar */}
          <div
            data-text-toolbar
            className="text-action-toolbar fixed z-40 flex items-center gap-0.5 rounded-xl border border-[#e7e5e4]/80 bg-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08)] px-1 py-1 backdrop-blur-md"
            style={{ left: textHandleRef.current.x, top: textHandleRef.current.y, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="text-action-btn"
              title="Highlight"
              onClick={() => {
                globalThis.getSelection?.()?.removeAllRanges();
                textHandleRef.current = null;
        forceTextToolbarUpdate((n) => n + 1);
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
                // Capture selection range before clearing it — needed for anchored note connector.
                const sel = globalThis.getSelection?.();
                const capturedText = (sel && !sel.isCollapsed) ? sel.toString().trim() : undefined;
                let capturedRange: { left: number; top: number; width: number; height: number; pageNumber: number } | undefined;
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  const range = sel.getRangeAt(0);
                  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
                  if (rects.length > 0) {
                    const rect = rects[0];
                    const pageEl = globalThis.document?.elementFromPoint(rect.left + 1, rect.top + 1)
                      ?.closest('.pdf-page') as HTMLElement | null;
                    capturedRange = {
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                      pageNumber: pageEl ? Number(pageEl.dataset.pageNumber || '1') : 1,
                    };
                  }
                }
                sel?.removeAllRanges();
                textHandleRef.current = null;
                forceTextToolbarUpdate((n) => n + 1);
                onAddNoteSelection(undefined, undefined, capturedText, capturedRange);
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
                textHandleRef.current = null;
        forceTextToolbarUpdate((n) => n + 1);
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
                  await navigator.clipboard.writeText(textHandleRef.current?.text || '');
                } catch { /* ignore */ }
                globalThis.getSelection?.()?.removeAllRanges();
                textHandleRef.current = null;
        forceTextToolbarUpdate((n) => n + 1);
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
          <button className="ctx-menu-item" onClick={() => {
            const sel = globalThis.getSelection?.();
            const capturedText = (sel && !sel.isCollapsed) ? sel.toString().trim() : undefined;
            let capturedRange: { left: number; top: number; width: number; height: number; pageNumber: number } | undefined;
            if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
              const range = sel.getRangeAt(0);
              const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
              if (rects.length > 0) {
                const rect = rects[0];
                const pageEl = globalThis.document?.elementFromPoint(rect.left + 1, rect.top + 1)
                  ?.closest('.pdf-page') as HTMLElement | null;
                capturedRange = {
                  left: rect.left, top: rect.top, width: rect.width, height: rect.height,
                  pageNumber: pageEl ? Number(pageEl.dataset.pageNumber || '1') : 1,
                };
              }
            }
            setContextMenu(null);
            onAddNoteSelection(contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined, contextMenu?.targetPageNumber, capturedText, capturedRange);
          }}>
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
