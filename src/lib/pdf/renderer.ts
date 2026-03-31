import { pdfjsLib } from '@/lib/pdf/pdfjs';
import { buildPageLayout, type PretextSegment } from '@/lib/pdf/pretext-text-layer';
import { pretextLineCache } from '@/lib/pdf/pretext-line-cache';
import { PretextTextRenderer } from '@/lib/pdf/pretext-text-renderer';

/**
 * Session-level thumbnail cache for rendered PDF pages.
 * Keyed by document fingerprint (name + size) and page number.
 * Snapshots are captured after each page render, so re-visiting a page
 * shows the cached image immediately while the fresh canvas paints on top.
 */
const pageThumbnailCache = new Map<string, string>();

function cacheKey(fingerprint: string, pageNum: number) {
  return `${fingerprint}:${pageNum}`;
}

function getCachedThumbnail(fingerprint: string, pageNum: number): string | undefined {
  return pageThumbnailCache.get(cacheKey(fingerprint, pageNum));
}

function setCachedThumbnail(fingerprint: string, pageNum: number, dataUrl: string): void {
  // Evict oldest 20% of entries when cache grows too large (batch LRU eviction).
  const MAX_SIZE = 500;
  const EVICT_BATCH = Math.max(10, Math.floor(MAX_SIZE * 0.2));
  if (pageThumbnailCache.size > MAX_SIZE) {
    const keysToEvict = Array.from(pageThumbnailCache.keys()).slice(0, EVICT_BATCH);
    keysToEvict.forEach((k) => pageThumbnailCache.delete(k));
  }
  pageThumbnailCache.set(cacheKey(fingerprint, pageNum), dataUrl);
}

/** Evict only entries from other documents (different fingerprint), preserving current session's cache. */
function evictOtherFingerprints(currentFingerprint: string): void {
  for (const key of pageThumbnailCache.keys()) {
    if (!key.startsWith(`${currentFingerprint}:`)) {
      pageThumbnailCache.delete(key);
    }
  }
}

// ─── Hidden DOM Text Layer (Canvas Text Layer Phase 2) ─────────────────────────────────

/**
 * Build a hidden DOM text layer from PretextPageLayout data.
 *
 * Structure: one <span> per (line × distinct-left-position) group.
 * ~20-200 spans/page vs pdfjs 500-1000.
 *
 * Strategy: group segments by their line + left position (5px tolerance on left).
 * Segments on the same line at similar X belong to the same group → one span.
 * Segments on the same line at very different X → different groups → different spans.
 *
 * This correctly handles:
 * - Single-column: one span per line (all segments at similar left → one group)
 * - Multi-column: one span per column per line (segments at distinct left → separate groups)
 * - detectColumns failure: grouping by position still works correctly
 * - PDFs where detectColumns mis-detects: grouping handles it naturally
 *
 * Each span is positioned at its group's left (segment's actual X from pdfjs data).
 * Spans are invisible (color: transparent from globals.css).
 *
 * CSS (.pdf-text-layer):
 * - visibility: hidden → invisible but present in DOM
 * - pointer-events: auto → allows native text selection even when hidden
 * Each child <span>: visibility: visible + color: transparent (globals.css)
 */
function buildHiddenTextLayer(
  container: HTMLElement,
  layout: import('@/lib/pdf/pretext-text-layer').PretextPageLayout,
): void {
  const TOLERANCE = 5; // px tolerance for grouping segments by left position

  for (const line of layout.lines) {
    if (!line.text.trim()) continue;

    // Greedy clustering by position: sort segments by left, then group
    // consecutive segments whose gap is ≤ TOLERANCE px.
    // Two segments are in the same group if curr.left - last.right ≤ TOLERANCE.
    // This naturally separates columns: left col (~40) vs right col (~325)
    // are separated by a >TOLERANCE gap, creating distinct groups.
    const sorted = [...line.segments]
      .filter((s) => s.text.trim())
      .sort((a, b) => a.left - b.left);
    if (sorted.length === 0) continue;
    const groups: Array<{ left: number; segs: PretextSegment[] }> = [{
      left: sorted[0].left,
      segs: [sorted[0]],
    }];
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const last = groups[groups.length - 1].segs[groups[groups.length - 1].segs.length - 1];
      if (curr.left - (last.left + last.width) <= TOLERANCE) {
        groups[groups.length - 1].segs.push(curr);
      } else {
        groups.push({ left: curr.left, segs: [curr] });
      }
    }

    for (const { left, segs } of groups) {
      const span = document.createElement('span');
      span.style.position = 'absolute';
      span.style.top = `${line.top}px`;
      span.style.left = `${left}px`;
      span.style.height = `${line.height}px`;
      span.style.whiteSpace = 'pre';
      span.style.lineHeight = `${line.height}px`;
      span.textContent = segs.map((s) => s.text).join(' ');
      container.appendChild(span);
    }
  }
}

// ─── PDF Document Parsing Cache ─────────────────────────────────────────────────

/** Cache entry for a parsed PDF document and its raw data. */
interface PdfDocCacheEntry {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  arrayBuffer: ArrayBuffer;
}

/**
 * Session-level cache for parsed PDF documents.
 * Keyed by document fingerprint (name + size).
 * Allows rapid re-renders (zoom changes) without re-parsing the PDF.
 *
 * Uses in-flight promise map to coalesce concurrent parse requests for the same document.
 */
const pdfDocCache = new Map<string, PdfDocCacheEntry>();
const pdfParsePromises = new Map<string, Promise<PdfDocCacheEntry>>();

/**
 * Get a cached PDF document or parse it if not cached.
 * Coalesces concurrent requests for the same fingerprint into a single parse operation.
 */
async function getOrParsePdfDoc(
  file: File,
  fingerprint: string
): Promise<{ pdfDoc: pdfjsLib.PDFDocumentProxy; arrayBuffer: ArrayBuffer }> {
  // Return cached entry if available
  const cached = pdfDocCache.get(fingerprint);
  if (cached) {
    console.log('[pdfDocCache] HIT:', fingerprint);
    return cached;
  }

  // Check if a parse is already in-flight for this fingerprint
  const inFlight = pdfParsePromises.get(fingerprint);
  if (inFlight) {
    console.log('[pdfDocCache] WAIT (in-flight):', fingerprint);
    return inFlight;
  }

  console.log('[pdfDocCache] PARSE:', fingerprint);

  // Parse and cache
  const parsePromise = (async () => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const entry: PdfDocCacheEntry = { pdfDoc, arrayBuffer };
    pdfDocCache.set(fingerprint, entry);
    pdfParsePromises.delete(fingerprint);

    // Evict old entries if cache grows too large (keep max 10 documents)
    if (pdfDocCache.size > 10) {
      const oldestKey = pdfDocCache.keys().next().value;
      if (oldestKey) {
        console.log('[pdfDocCache] EVICT:', oldestKey);
        pdfDocCache.delete(oldestKey);
      }
    }

    return entry;
  })();

  pdfParsePromises.set(fingerprint, parsePromise);
  return parsePromise;
}

export interface PdfOutlineItem {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

export interface RenderPdfResult {
  totalPages: number;
  outline: PdfOutlineItem[];
  cleanup?: () => void;
}

interface RenderOptions {
  scale?: number;
  /** User zoom level (e.g. 1.0 = 100%, 1.5 = 150%). Effective scale = scale * zoomLevel.
   *  When provided, PDF pages are rendered at higher resolution for crisp display. */
  zoomLevel?: number;
  shouldCancel?: () => boolean;
  /** Number of pages to render eagerly on first load (default 5). Remaining pages
   *  are left as skeleton divs and rendered lazily on scroll. */
  initialPageCount?: number;
  /** ID of the scroll container element (needed for virtual-scroll page eviction). */
  scrollContainerId?: string;
  /** Called after each lazy batch of pages finishes rendering into the DOM.
   *  Allows the caller (e.g. useCanvasRendering) to re-apply highlights. */
  onBatchRendered?: () => void;
}

async function resolveOutlinePageNumber(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  dest: unknown
): Promise<number | null> {
  if (!dest) return null;

  let explicitDest: unknown = dest;
  if (typeof dest === 'string') {
    explicitDest = await pdfDoc.getDestination(dest);
  }
  if (!Array.isArray(explicitDest) || !explicitDest[0]) {
    return null;
  }

  const first = explicitDest[0] as unknown;
  if (typeof first === 'number') {
    return first + 1;
  }

  try {
    const pageIndex = await pdfDoc.getPageIndex(first as never);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

async function extractOutline(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const rawOutline = await pdfDoc.getOutline();
  if (!rawOutline) return [];

  const outline: PdfOutlineItem[] = [];
  let id = 0;

  const walk = async (items: any[], level: number): Promise<void> => {
    for (const item of items) {
      const pageNumber = await resolveOutlinePageNumber(pdfDoc, item.dest);
      outline.push({
        id: `outline-${id++}`,
        title: item.title || 'Untitled',
        pageNumber,
        level,
      });
      if (item.items?.length) {
        await walk(item.items, level + 1);
      }
    }
  };

  await walk(rawOutline as any[], 0);
  return outline;
}

function buildFallbackOutline(totalPages: number): PdfOutlineItem[] {
  // Keep fallback concise for very large documents.
  const step = totalPages <= 60 ? 1 : 5;
  const outline: PdfOutlineItem[] = [];
  let id = 0;
  for (let page = 1; page <= totalPages; page += step) {
    outline.push({
      id: `fallback-outline-${id++}`,
      title: step === 1 ? `Page ${page}` : `Pages ${page}-${Math.min(page + step - 1, totalPages)}`,
      pageNumber: page,
      level: 0,
    });
  }
  if (outline.length > 0 && outline[outline.length - 1].pageNumber !== totalPages) {
    outline.push({
      id: `fallback-outline-${id++}`,
      title: `Page ${totalPages}`,
      pageNumber: totalPages,
      level: 0,
    });
  }
  return outline;
}

/**
 * Create a skeleton placeholder for a PDF page to show immediately while rendering.
 */
function createSkeletonElement(pageNum: number, width: number, height: number): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'pdf-page-skeleton';
  skeleton.dataset.pageNumber = String(pageNum);
  skeleton.style.width = `${width}px`;
  skeleton.style.height = `${height}px`;
  skeleton.innerHTML = `
    <div class="pdf-page-skeleton-inner">
      <div class="pdf-page-skeleton-shimmer"></div>
    </div>
  `;
  return skeleton;
}

/**
 * Create a fingerprint for a PDF file to use as cache key.
 * Uses name + size as a stable, fast identifier for the current session.
 */
export function fingerprintFile(file: File): string {
  return `${file.name}@${file.size}`;
}

/**
 * Create the actual rendered page element.
 *
 * If a `fingerprint` is provided, this function first checks the session
 * thumbnail cache. A cached image is shown immediately while the full canvas
 * renders on top, giving instant feedback when re-visiting pages.
 */
export async function renderSinglePage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
  dpr: number,
  fingerprint?: string
): Promise<HTMLElement> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const pageEl = document.createElement('div');
  pageEl.className = 'pdf-page';
  pageEl.dataset.pageNumber = String(pageNum);
  pageEl.style.width = `${viewport.width}px`;
  pageEl.style.height = `${viewport.height}px`;

  // Show cached thumbnail immediately if available (instant feedback on re-visit).
  if (fingerprint) {
    const cached = getCachedThumbnail(fingerprint, pageNum);
    if (cached) {
      const cachedPreview = document.createElement('img');
      cachedPreview.src = cached;
      cachedPreview.className = 'pdf-page-cached-preview';
      cachedPreview.style.cssText = [
        'position:absolute;inset:0;width:100%;height:100%;',
        'object-fit:cover;border-radius:inherit;pointer-events:none;',
        'transition:opacity 0.2s ease;',
      ].join('');
      cachedPreview.dataset.cached = 'true';
      pageEl.appendChild(cachedPreview);
    }
  }

  // Canvas layer
  const canvas = document.createElement('canvas');
  canvas.className = 'pdf-page-canvas';
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Cache the rendered canvas for future instant display.
  // Downscale to max 200px dimension to avoid memory-intensive data URLs on high-DPI screens.
  if (fingerprint) {
    try {
      const maxDim = 200;
      const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1);
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
      thumbCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        setCachedThumbnail(fingerprint, pageNum, thumbCanvas.toDataURL('image/jpeg', 0.7));
      }
    } catch {
      // Storage errors are non-fatal.
    }
  }

  // Fade out cached preview once fresh canvas is ready.
  const cachedPreview = pageEl.querySelector<HTMLImageElement>('[data-cached]');
  if (cachedPreview) {
    cachedPreview.style.opacity = '0';
  }

  // Text layer (render asynchronously after canvas is done)
  const textLayerEl = document.createElement('div');
  textLayerEl.className = 'pdf-text-layer';
  textLayerEl.style.width = `${viewport.width}px`;
  textLayerEl.style.height = `${viewport.height}px`;

  // Selection background canvas: sits above text layer (z-index 3), draws orange
  // selection highlight as the user drags. pointer-events: none so clicks pass through.
  const selCanvas = document.createElement('canvas');
  selCanvas.className = 'pdf-selection-canvas';
  selCanvas.width = Math.floor(viewport.width * dpr);
  selCanvas.height = Math.floor(viewport.height * dpr);
  selCanvas.style.cssText =
    `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;` +
    `pointer-events:none;z-index:3;`;
  const selCtx = selCanvas.getContext('2d')!;
  selCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  pageEl.appendChild(canvas);
  pageEl.appendChild(textLayerEl);
  pageEl.appendChild(selCanvas);

  // Build hidden text layer (DOM) + cache Pretext layout after canvas render.
  // The text layer container is appended below (before highlights) and styled via CSS.
  page.getTextContent().then((textContent) => {
    if (fingerprint) {
      try {
        const layout = buildPageLayout(
          textContent.items as Array<{ str: string; dir: string; width: number; height: number; transform: [number, number, number, number, number, number]; fontName: string; hasEOL: boolean }>,
          viewport.width,
          viewport.height,
          pageNum,
          scale,
        );
        pretextLineCache.set(fingerprint, layout);

        // Build hidden DOM text layer: one <span> per line (~50-100 vs pdfjs 500-1000).
        // visibility: hidden on container + visibility: visible on spans (via CSS)
        // keeps native text selection working while hiding the visual layer.
        buildHiddenTextLayer(textLayerEl, layout);

        // Add transparent canvas overlay for future text-level hit testing extension.
        // globalAlpha=0: draws nothing. PDF canvas already renders visible text.
        const renderer = new PretextTextRenderer(pageEl, viewport.width, viewport.height);
        renderer.renderLayout(layout);
      } catch {
        // Non-fatal: text layer stays empty, selection/highlight fall back to getClientRects()
      }
    }
  });

  return pageEl;
}

/**
 * Render PDF pages into a DOM container with progressive virtual scrolling.
 * Only initialPageCount pages are rendered eagerly; the rest stay as skeleton
 * divs and are rendered lazily via renderSinglePage when they enter the viewport.
 * Pages that scroll far out of the visible range are evicted back to skeletons
 * to keep the live DOM node count bounded (virtual scrolling).
 */
interface LazyRenderState {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  scale: number;
  dpr: number;
  shouldCancel: () => boolean;
  fingerprint: string;
  renderedPages: Set<number>;
  pendingPages: Set<number>;
  renderQueue: number[];
  isProcessing: boolean;
  observer: IntersectionObserver | null;
  rootMargin: string;
  /** How many pages to render per scroll-triggered batch. */
  LAZY_BATCH: number;
  /** The highest page number currently rendered or in-flight.
   *  Used to keep the queue focused near the visible front. */
  maxLoadedPage: number;
  /** Track skeleton page numbers that have been enqueued to avoid repeated querySelectorAll calls. */
  knownSkeletonPages: Set<number>;
  /** Scroll container element — needed for viewport-aware page eviction. */
  scrollContainer: HTMLElement | null;
  /** Pages that have been evicted back to skeletons (to restore on scroll-back). */
  evictedPages: Set<number>;
  /** Current visible page range [min, max] — updated on scroll. */
  visibleRange: [number, number];
  /** Throttle scroll handler. */
  scrollRafId: number | null;
  /** Cleanup for scroll listener. */
  scrollCleanup: (() => void) | null;
  /** Callback fired after each lazy batch finishes rendering into the DOM. */
  onBatchRendered?: () => void;
}

function createLazyState(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  scale: number,
  dpr: number,
  shouldCancel: () => boolean,
  fingerprint: string,
  scrollContainer: HTMLElement | null,
  onBatchRendered?: () => void,
): LazyRenderState {
  return {
    pdfDoc,
    scale,
    dpr,
    shouldCancel,
    fingerprint,
    renderedPages: new Set(),
    pendingPages: new Set(),
    renderQueue: [],
    isProcessing: false,
    observer: null,
    rootMargin: '400px 0px', // pre-render 400px before viewport
    LAZY_BATCH: 5,
    maxLoadedPage: 0,
    knownSkeletonPages: new Set(),
    scrollContainer,
    evictedPages: new Set(),
    visibleRange: [1, 5],
    scrollRafId: null,
    scrollCleanup: null,
    onBatchRendered,
  };
}

/** Number of pages outside the visible range before a page gets evicted. */
const EVICT_BEYOND_PAGES = 30;

function enqueueLazyPages(
  container: HTMLElement,
  state: LazyRenderState
): void {
  if (state.shouldCancel()) return;

  // Only enqueue pages that are near the visible front (within LOOKAHEAD of
  // the highest page currently rendered or pending). This prevents the queue
  // from flooding with far-away pages and keeps render budget focused.
  const LOOKAHEAD = 2;
  const cutoff = state.maxLoadedPage + LOOKAHEAD;

  // Find skeleton pages we haven't enqueued yet by querying once for new skeletons.
  // We track enqueued pages in knownSkeletonPages to avoid repeated DOM queries.
  const unknownSkeletons = container.querySelectorAll<HTMLElement>(
    '.pdf-page-skeleton[data-page-number]'
  );
  for (const skeleton of unknownSkeletons) {
    const pageNum = Number(skeleton.dataset.pageNumber);
    if (!state.knownSkeletonPages.has(pageNum)) {
      state.knownSkeletonPages.add(pageNum);
      if (pageNum <= cutoff && !state.renderedPages.has(pageNum) && !state.pendingPages.has(pageNum)) {
        state.renderQueue.push(pageNum);
        state.pendingPages.add(pageNum);
      }
    }
  }

  if (!state.isProcessing) {
    processRenderQueue(container, state);
  }
}

function processRenderQueue(
  container: HTMLElement,
  state: LazyRenderState
): void {
  if (state.shouldCancel() || state.renderQueue.length === 0) {
    state.isProcessing = false;
    return;
  }
  state.isProcessing = true;

  const batch = state.renderQueue.splice(0, state.LAZY_BATCH);

  Promise.allSettled(
    batch.map((pageNum) =>
      renderSinglePage(state.pdfDoc, pageNum, state.scale, state.dpr, state.fingerprint).catch((err) => {
        console.error(`[lazy] Page ${pageNum} render error:`, err);
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page pdf-page-error';
        placeholder.dataset.pageNumber = String(pageNum);
        placeholder.textContent = `Page ${pageNum} failed to render`;
        return placeholder;
      })
    )
  ).then((results) => {
    let newMaxLoaded = state.maxLoadedPage;
    results.forEach((result, i) => {
      const pageNum = batch[i];
      state.pendingPages.delete(pageNum);
      if (result.status === 'fulfilled') {
        state.renderedPages.add(pageNum);
        if (pageNum > newMaxLoaded) newMaxLoaded = pageNum;
        const skeleton = container.querySelector<HTMLElement>(
          `.pdf-page-skeleton[data-page-number="${pageNum}"]`
        );
        if (skeleton) skeleton.replaceWith(result.value);
      }
    });
    state.maxLoadedPage = newMaxLoaded;
    // Notify caller so it can re-apply highlights on newly rendered pages.
    state.onBatchRendered?.();
    // Keep processing if more queued and not cancelled
    if (!state.shouldCancel()) {
      processRenderQueue(container, state);
    } else {
      state.isProcessing = false;
    }
  });
}

/**
 * Replace a rendered page element with a skeleton placeholder.
 * Used during virtual-scroll eviction when pages scroll out of range.
 */
function evictPageToSkeleton(container: HTMLElement, pageNum: number, skeletonWidth: number, skeletonHeight: number): void {
  const pageEl = container.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNum}"]`);
  if (!pageEl) return;
  const skeleton = createSkeletonElement(pageNum, skeletonWidth, skeletonHeight);
  pageEl.replaceWith(skeleton);
}

/** Estimate the visible page range based on scroll position and page heights. */
function updateVisibleRange(state: LazyRenderState, totalPages: number): void {
  const sc = state.scrollContainer;
  if (!sc) return;
  const viewportHeight = sc.clientHeight;

  // Binary search for first and last page visible in viewport.
  // We approximate using cumulative height (assumes uniform page height).
  const pages = sc.querySelectorAll<HTMLElement>('.pdf-page, .pdf-page-skeleton');
  if (pages.length === 0) return;

  // Find first visible page by checking each page's offsetTop relative to scrollTop.
  // Split into two passes: read all rects first, then process. This prevents
  // layout thrashing — the browser can coalesce all getBoundingClientRect calls
  // into a single layout pass rather than recalculating after each read.
  let minPage = totalPages;
  let maxPage = 1;
  const containerRect = sc.getBoundingClientRect();
  // Pass 1: batch-read all page rects
  const pageRects: Array<{ num: number; rect: DOMRect }> = [];
  for (const p of pages) {
    const num = Number(p.dataset.pageNumber ?? p.dataset['pageNumber'] ?? 0);
    if (!num) continue;
    pageRects.push({ num, rect: p.getBoundingClientRect() });
  }
  // Pass 2: process without any layout reads
  for (const { num, rect } of pageRects) {
    const relTop = rect.top - containerRect.top;
    const relBottom = rect.bottom - containerRect.top;
    // Visible if any part is within viewport (with 1 viewport buffer)
    if (relBottom >= -viewportHeight && relTop <= viewportHeight * 2) {
      if (num < minPage) minPage = num;
      if (num > maxPage) maxPage = num;
    }
  }

  // Expand the range slightly so we don't evict pages that are barely outside.
  state.visibleRange = [
    Math.max(1, minPage - 5),
    Math.min(totalPages, maxPage + 5),
  ];
}

/**
 * Evict rendered pages that are far from the visible range to keep DOM lean.
 * Bounded to evicting at most 5 pages per call to avoid stuttering.
 */
function evictFarPages(state: LazyRenderState, totalPages: number, skeletonWidth: number, skeletonHeight: number): void {
  if (state.evictedPages.size > totalPages * 0.5) return; // safety: don't evict more than half
  const [minVis, maxVis] = state.visibleRange;
  const container = state.scrollContainer?.parentElement ?? null;
  if (!container) return;
  let evicted = 0;
  const MAX_EVICT_PER_CALL = 5;
  for (const pageNum of state.renderedPages) {
    if (evicted >= MAX_EVICT_PER_CALL) break;
    if (pageNum < minVis - EVICT_BEYOND_PAGES || pageNum > maxVis + EVICT_BEYOND_PAGES) {
      if (!state.evictedPages.has(pageNum)) {
        evictPageToSkeleton(container, pageNum, skeletonWidth, skeletonHeight);
        state.evictedPages.add(pageNum);
        state.renderedPages.delete(pageNum);
        evicted++;
      }
    }
  }
}
function setupLazyRendering(
  container: HTMLElement,
  state: LazyRenderState,
): () => void {
  // Seed the queue with all unrendered skeletons
  enqueueLazyPages(container, state);

  const observer = new IntersectionObserver(
    (entries) => {
      if (state.isProcessing || state.shouldCancel()) return;
      let needsEnqueue = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          needsEnqueue = true;
        }
      }
      if (needsEnqueue) enqueueLazyPages(container, state);
    },
    { rootMargin: state.rootMargin }
  );

  const skeletons = container.querySelectorAll<HTMLElement>(
    '.pdf-page-skeleton[data-page-number]'
  );
  for (const skeleton of skeletons) {
    observer.observe(skeleton);
  }

  state.observer = observer;
  return () => observer.disconnect();
}

export async function renderPagesToContainer(
  file: File,
  container: HTMLElement,
  options: RenderOptions = {}
): Promise<RenderPdfResult> {
  const { scale = 1.25, zoomLevel = 1, shouldCancel } = options;
  // Effective scale combines base scale and user zoom level for crisp rendering
  const effectiveScale = scale * zoomLevel;
  console.log('renderPagesToContainer called:', file.name, 'scale:', scale, 'zoomLevel:', zoomLevel, 'effectiveScale:', effectiveScale);

  // Compute fingerprint first (needed for cache lookup)
  const fingerprint = fingerprintFile(file);

  // Get cached PDF doc or parse if not cached
  const { pdfDoc, arrayBuffer } = await getOrParsePdfDoc(file, fingerprint);
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);
  const totalPages = pdfDoc.numPages;
  console.log('PDF loaded, total pages:', totalPages);

  // Clear container before rendering at new scale
  container.textContent = '';
  const dpr = Math.min(globalThis.window?.devicePixelRatio || 1, 2);

  // Evict thumbnail cache entries from other documents.
  evictOtherFingerprints(fingerprint);

  // Extract outline (non-blocking, happens while pages render)
  const outlinePromise = extractOutline(pdfDoc).then((extracted) => {
    const hasNavigable = extracted.some(
      (item) => typeof item.pageNumber === 'number' && item.pageNumber > 0
    );
    return hasNavigable ? extracted : buildFallbackOutline(totalPages);
  });

  // Get first page dimensions for skeleton sizing (using effectiveScale for correct dimensions at zoom)
  const firstPage = await pdfDoc.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: effectiveScale });
  const skeletonWidth = firstViewport.width;
  const skeletonHeight = firstViewport.height;

  // Show skeleton placeholders for ALL pages immediately.
  // Only initialPageCount pages will be rendered eagerly; the rest are
  // rendered lazily via renderSinglePage when they scroll into view.
  const initialCount = options.initialPageCount ?? 5;
  for (let i = 1; i <= totalPages; i++) {
    container.appendChild(createSkeletonElement(i, skeletonWidth, skeletonHeight));
  }

  // Render the first batch eagerly (batch of 4 for faster first paint).
  // Remaining pages are left as skeleton divs and rendered on scroll.
  const initialBatchEnd = Math.min(initialCount, totalPages);

  if (initialBatchEnd > 0) {
    const batchPromises: Promise<HTMLElement>[] = [];
    for (let pageNum = 1; pageNum <= initialBatchEnd; pageNum++) {
      batchPromises.push(
        renderSinglePage(pdfDoc, pageNum, effectiveScale, dpr, fingerprint).catch((err) => {
          console.error(`Page ${pageNum} render error:`, err);
          const placeholder = document.createElement('div');
          placeholder.className = 'pdf-page pdf-page-error';
          placeholder.dataset.pageNumber = String(pageNum);
          placeholder.style.width = `${skeletonWidth}px`;
          placeholder.style.height = `${skeletonHeight}px`;
          placeholder.textContent = `Page ${pageNum} failed to render`;
          return placeholder;
        })
      );
    }

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((pageEl, i) => {
      const pageNum = i + 1;
      // Replace skeleton with actual page
      const skeleton = container.querySelector<HTMLElement>(
        `.pdf-page-skeleton[data-page-number="${pageNum}"]`
      );
      if (skeleton) skeleton.replaceWith(pageEl);
    });
    console.log(`Rendered initial pages 1-${initialBatchEnd} / ${totalPages}`);
  }

  // Set up lazy rendering for remaining pages
  // Get scroll container element for virtual-scroll eviction
  const scrollContainer = options.scrollContainerId
    ? (document.getElementById(options.scrollContainerId) ?? null)
    : null;
  const lazyState = createLazyState(pdfDoc, effectiveScale, dpr, shouldCancel ?? (() => false), fingerprint, scrollContainer, options.onBatchRendered);
  // Mark initial pages as already rendered and update maxLoadedPage
  lazyState.maxLoadedPage = initialBatchEnd;
  for (let i = 1; i <= initialBatchEnd; i++) {
    lazyState.renderedPages.add(i);
  }
  // setupLazyRendering returns an observer cleanup; chain it with our own cancel logic.
  const lazyObsCleanup = setupLazyRendering(container, lazyState);

  // Virtual-scroll eviction: evict far-from-viewport rendered pages back to skeletons.
  // This keeps the live DOM node count bounded regardless of document size.
  if (scrollContainer) {
    const scrollHandler = () => {
      if (lazyState.shouldCancel() || lazyState.isProcessing) return;
      if (lazyState.scrollRafId !== null) return;
      lazyState.scrollRafId = requestAnimationFrame(() => {
        lazyState.scrollRafId = null;
        updateVisibleRange(lazyState, totalPages);
        evictFarPages(lazyState, totalPages, skeletonWidth, skeletonHeight);
      });
    };
    scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });
    lazyState.scrollCleanup = () => scrollContainer.removeEventListener('scroll', scrollHandler);
  }

  // Predictive preload: immediately queue the next LAZY_BATCH pages after initial
  // render completes, without waiting for scroll/IntersectionObserver.
  // This hides the latency of pages 6–10 so they tend to be ready on arrival.
  if (totalPages > initialBatchEnd) {
    for (let pageNum = initialBatchEnd + 1; pageNum <= Math.min(initialBatchEnd + lazyState.LAZY_BATCH, totalPages); pageNum++) {
      if (!lazyState.renderedPages.has(pageNum) && !lazyState.pendingPages.has(pageNum)) {
        lazyState.renderQueue.push(pageNum);
        lazyState.pendingPages.add(pageNum);
      }
    }
    processRenderQueue(container, lazyState);
  }

  // Wait for outline extraction
  const outline = await outlinePromise;

  // Return cleanup function so callers can properly teardown
  const cleanupLazy = () => {
    lazyState.shouldCancel = () => true;
    lazyObsCleanup(); // disconnect IntersectionObserver
    if (lazyState.observer) {
      lazyState.observer.disconnect();
      lazyState.observer = null;
    }
    if (lazyState.scrollCleanup) {
      lazyState.scrollCleanup();
      lazyState.scrollCleanup = null;
    }
    if (lazyState.scrollRafId !== null) {
      cancelAnimationFrame(lazyState.scrollRafId);
      lazyState.scrollRafId = null;
    }
  };
  return { totalPages, outline, cleanup: cleanupLazy };
}
