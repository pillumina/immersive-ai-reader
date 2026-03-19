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
 * Create the actual rendered page element.
 */
async function createPageElement(
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

  // Text layer (render in background after canvas is done)
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
 * Render PDF pages into a DOM container with progressive loading.
 * Pages are rendered in parallel batches for performance, with skeletons shown immediately.
 */
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

  // Show skeleton placeholders immediately
  for (let i = 1; i <= totalPages; i++) {
    container.appendChild(createSkeletonElement(i, skeletonWidth, skeletonHeight));
  }

  // Render pages in parallel batches (2 pages at a time)
  const BATCH_SIZE = 2;
  const renderedPages = new Map<number, HTMLElement>();

  for (let batchStart = 0; batchStart < totalPages; batchStart += BATCH_SIZE) {
    if (shouldCancel?.()) {
      throw new Error('PDF rendering cancelled');
    }

    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalPages);
    const batchPromises: Promise<HTMLElement>[] = [];

    for (let pageNum = batchStart + 1; pageNum <= batchEnd; pageNum++) {
      batchPromises.push(
        createPageElement(pdfDoc, pageNum, scale, dpr).catch((err) => {
          console.error(`Page ${pageNum} render error:`, err);
          // Return a placeholder on error
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
      const pageNum = batchStart + i + 1;
      renderedPages.set(pageNum, pageEl);

      // Replace skeleton with actual page
      const skeleton = container.querySelector<HTMLElement>(
        `.pdf-page-skeleton[data-page-number="${pageNum}"]`
      );
      if (skeleton) {
        skeleton.replaceWith(pageEl);
      }
    });

    console.log(`Rendered pages ${batchStart + 1}-${batchEnd} / ${totalPages}`);
  }

  // Wait for outline extraction
  const outline = await outlinePromise;

  return { totalPages, outline };
}
