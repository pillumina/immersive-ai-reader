import * as pdfjsLib from 'pdfjs-dist';

/**
 * 渲染单个 PDF 页面到 canvas
 */
export async function renderPDFPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<void> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get canvas context');

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
}

/**
 * 渲染所有 PDF 页面（返回 canvas 数组）
 */
export async function renderAllPages(
  file: File,
  scale: number = 1.5
): Promise<HTMLCanvasElement[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;

  const canvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const canvas = document.createElement('canvas');
    await renderPDFPage(pdfDoc, i, canvas, scale);
    canvases.push(canvas);
  }

  return canvases;
}
