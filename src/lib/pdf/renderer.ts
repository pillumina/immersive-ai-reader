import { pdfjsLib } from '@/lib/pdf/pdfjs';

export interface PdfOutlineItem {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

export interface RenderPdfResult {
  totalPages: number;
  outline: PdfOutlineItem[];
}

interface RenderOptions {
  scale?: number;
  shouldCancel?: () => boolean;
  /** Number of pages to render eagerly on first load (default 5). Remaining pages
   *  are left as skeleton divs and rendered lazily on scroll. */
  initialPageCount?: number;
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
 * Create the actual rendered page element (can be called for lazy rendering).
 */
export async function renderSinglePage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
  dpr: number
): Promise<HTMLElement> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const pageEl = document.createElement('div');
  pageEl.className = 'pdf-page';
  pageEl.dataset.pageNumber = String(pageNum);
  pageEl.style.width = `${viewport.width}px`;
  pageEl.style.height = `${viewport.height}px`;

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
 */
interface LazyRenderState {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  scale: number;
  dpr: number;
  shouldCancel: () => boolean;
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
}

function createLazyState(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  scale: number,
  dpr: number,
  shouldCancel: () => boolean
): LazyRenderState {
  return {
    pdfDoc,
    scale,
    dpr,
    shouldCancel,
    renderedPages: new Set(),
    pendingPages: new Set(),
    renderQueue: [],
    isProcessing: false,
    observer: null,
    rootMargin: '400px 0px', // pre-render 400px before viewport
    LAZY_BATCH: 5,
    maxLoadedPage: 0,
  };
}

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
  const skeletons = container.querySelectorAll<HTMLElement>(
    '.pdf-page-skeleton[data-page-number]'
  );
  for (const skeleton of skeletons) {
    const pageNum = Number(skeleton.dataset.pageNumber);
    if (pageNum > cutoff) continue;
    if (!state.renderedPages.has(pageNum) && !state.pendingPages.has(pageNum)) {
      state.renderQueue.push(pageNum);
      state.pendingPages.add(pageNum);
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
      renderSinglePage(state.pdfDoc, pageNum, state.scale, state.dpr).catch((err) => {
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
    // Keep processing if more queued and not cancelled
    if (!state.shouldCancel()) {
      processRenderQueue(container, state);
    } else {
      state.isProcessing = false;
    }
  });
}

/**
 * Set up lazy rendering via IntersectionObserver for skeleton pages.
 * Returns a cleanup function.
 */
function setupLazyRendering(
  container: HTMLElement,
  state: LazyRenderState
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
  const { scale = 1.25, shouldCancel } = options;
  console.log('renderPagesToContainer called:', file.name, 'scale:', scale);

  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);

  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;
  console.log('PDF loaded, total pages:', totalPages);

  container.innerHTML = '';
  const dpr = Math.min(globalThis.window?.devicePixelRatio || 1, 2);

  // Extract outline (non-blocking, happens while pages render)
  const outlinePromise = extractOutline(pdfDoc).then((extracted) => {
    const hasNavigable = extracted.some(
      (item) => typeof item.pageNumber === 'number' && item.pageNumber > 0
    );
    return hasNavigable ? extracted : buildFallbackOutline(totalPages);
  });

  // Get first page dimensions for skeleton sizing
  const firstPage = await pdfDoc.getPage(1);
  const firstViewport = firstPage.getViewport({ scale });
  const skeletonWidth = firstViewport.width;
  const skeletonHeight = firstViewport.height;

  // Show skeleton placeholders for ALL pages immediately.
  // Only initialPageCount pages will be rendered eagerly; the rest are
  // rendered lazily via renderSinglePage when they scroll into view.
  const initialCount = options.initialPageCount ?? 5;
  for (let i = 1; i <= totalPages; i++) {
    container.appendChild(createSkeletonElement(i, skeletonWidth, skeletonHeight));
  }

  // Render the first batch eagerly (BATCH_SIZE=4 for faster first paint).
  // Remaining pages are left as skeleton divs and rendered on scroll.
  const initialBatchEnd = Math.min(initialCount, totalPages);

  if (initialBatchEnd > 0) {
    const batchPromises: Promise<HTMLElement>[] = [];
    for (let pageNum = 1; pageNum <= initialBatchEnd; pageNum++) {
      batchPromises.push(
        renderSinglePage(pdfDoc, pageNum, scale, dpr).catch((err) => {
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
  const lazyState = createLazyState(pdfDoc, scale, dpr, shouldCancel ?? (() => false));
  // Mark initial pages as already rendered and update maxLoadedPage
  lazyState.maxLoadedPage = initialBatchEnd;
  for (let i = 1; i <= initialBatchEnd; i++) {
    lazyState.renderedPages.add(i);
  }
  const cleanupLazy = setupLazyRendering(container, lazyState);

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

  // Expose cleanup on container for callers that need to teardown
  (container as any).__lazyCleanup = cleanupLazy;

  return { totalPages, outline };
}
