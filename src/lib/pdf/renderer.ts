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
 * Render all PDF pages into a DOM container with selectable text layers.
 */
export async function renderPagesToContainer(
  file: File,
  container: HTMLElement,
  options: RenderOptions = {}
): Promise<RenderPdfResult> {
  const { scale = 1.5, shouldCancel } = options;
  console.log('renderPagesToContainer called:', file.name, 'scale:', scale);

  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);

  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;
  console.log('PDF loaded, total pages:', totalPages);

  container.innerHTML = '';
  const dpr = Math.min(globalThis.window?.devicePixelRatio || 1, 2);
  const extractedOutline = await extractOutline(pdfDoc);
  const hasNavigableOutline = extractedOutline.some((item) => typeof item.pageNumber === 'number' && item.pageNumber > 0);
  const outline = hasNavigableOutline ? extractedOutline : buildFallbackOutline(totalPages);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (shouldCancel?.()) {
      throw new Error('PDF rendering cancelled');
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    pageEl.dataset.pageNumber = String(pageNum);
    pageEl.style.width = `${viewport.width}px`;
    pageEl.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const textLayerEl = document.createElement('div');
    textLayerEl.className = 'pdf-text-layer';
    textLayerEl.style.width = `${viewport.width}px`;
    textLayerEl.style.height = `${viewport.height}px`;

    const textContent = await page.getTextContent();
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerEl,
      viewport,
    });
    await textLayer.render();

    pageEl.appendChild(canvas);
    pageEl.appendChild(textLayerEl);
    container.appendChild(pageEl);

    console.log(`Page ${pageNum} rendered: ${viewport.width}x${viewport.height}`);
  }

  return { totalPages, outline };
}
