import { pdfjsLib } from '@/lib/pdf/pdfjs';

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

  pageEl.appendChild(canvas);
  pageEl.appendChild(textLayerEl);

  // Render text layer asynchronously (doesn't block page display)
  page.getTextContent().then((textContent) => {
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerEl,
      viewport,
    });
    textLayer.render().catch(() => {
      // Silently ignore text layer errors - page is already visible
    });
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
  let minPage = totalPages;
  let maxPage = 1;
  const containerRect = sc.getBoundingClientRect();
  for (const p of pages) {
    const num = Number(p.dataset.pageNumber ?? p.dataset['pageNumber'] ?? 0);
    if (!num) continue;
    const rect = p.getBoundingClientRect();
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

  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);

  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;
  console.log('PDF loaded, total pages:', totalPages);

  // Clear container before rendering at new scale
  container.textContent = '';
  const dpr = Math.min(globalThis.window?.devicePixelRatio || 1, 2);

  // Compute fingerprint for thumbnail cache and evict entries from other documents.
  const fingerprint = fingerprintFile(file);
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
