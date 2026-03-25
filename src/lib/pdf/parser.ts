import { pdfjsLib } from '@/lib/pdf/pdfjs';
import { MAX_PAGE_COUNT, BATCH_PAGE_SIZE } from '@/constants/limits';

export interface PdfOutlineItem {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

export interface ChapterInfo {
  title: string;
  startPage: number;
  endPage: number;
  level: number;
}

/**
 * 检查页数限制，并返回 arrayBuffer 以便复用（避免二次解析）
 */
export async function checkPageLimit(file: File): Promise<{ pageCount: number; buffer: ArrayBuffer }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdfDoc.numPages;

  if (pageCount > MAX_PAGE_COUNT) {
    throw new Error(`PDF has ${pageCount} pages. Maximum supported is ${MAX_PAGE_COUNT} pages.`);
  }

  return { pageCount, buffer: arrayBuffer };
}

/**
 * 从 PDF 提取文本（支持大文档分批处理）
 * 如果传入 buffer 则复用之，不再重新解析
 */
export async function extractTextFromPDF(file: Blob, reuseBuffer?: ArrayBuffer): Promise<string> {
  const arrayBuffer = reuseBuffer ?? await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;

  let fullText = '';

  // 分批处理，避免阻塞UI
  for (let i = 1; i <= totalPages; i += BATCH_PAGE_SIZE) {
    const endPage = Math.min(i + BATCH_PAGE_SIZE - 1, totalPages);

    for (let pageNum = i; pageNum <= endPage; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    // 让出UI线程
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return fullText.trim();
}

/**
 * 从 PDF 提取指定页面范围的文本
 * 如果传入 reuseBuffer 则复用之（避免在 extractTextFromPageRanges 中重复解析）
 */
export async function extractTextFromPageRange(
  file: Blob,
  startPage: number,
  endPage: number,
  reuseBuffer?: ArrayBuffer
): Promise<string> {
  const arrayBuffer = reuseBuffer ?? await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;

  // Clamp to valid range
  const actualStart = Math.max(1, Math.min(startPage, totalPages));
  const actualEnd = Math.max(actualStart, Math.min(endPage, totalPages));

  if (actualStart > actualEnd) {
    return '';
  }

  let fullText = '';

  // 分批处理，避免阻塞UI
  for (let i = actualStart; i <= actualEnd; i += BATCH_PAGE_SIZE) {
    const batchEnd = Math.min(i + BATCH_PAGE_SIZE - 1, actualEnd);

    for (let pageNum = i; pageNum <= batchEnd; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    // 让出UI线程
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return fullText.trim();
}

/**
 * 从 PDF 提取多个页面范围的文本（支持多选章节）
 * 解析 PDF 一次，并行提取各章节
 * 如果传入 reuseBuffer 则复用（避免重复解析）
 */
export async function extractTextFromPageRanges(
  file: Blob,
  pageRanges: Array<{ startPage: number; endPage: number }>,
  reuseBuffer?: ArrayBuffer
): Promise<string> {
  const arrayBuffer = reuseBuffer ?? await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;

  // Sort by start page to maintain document order
  const sorted = [...pageRanges].sort((a, b) => a.startPage - b.startPage);

  const parts: string[] = [];
  for (const { startPage, endPage } of sorted) {
    const actualStart = Math.max(1, Math.min(startPage, totalPages));
    const actualEnd = Math.max(actualStart, Math.min(endPage, totalPages));
    if (actualStart > actualEnd) continue;
    let text = '';
    for (let pageNum = actualStart; pageNum <= actualEnd; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    parts.push(text.trim());
    // Yield to UI thread to avoid blocking
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return parts.filter(Boolean).join('\n\n');
}

/**
 * 根据当前页面找到对应的章节信息
 */
export function findChapterForPage(
  pageNumber: number,
  outline: PdfOutlineItem[]
): ChapterInfo | null {
  // Filter to items with valid page numbers, sorted by page
  const itemsWithPages = outline
    .filter((item): item is PdfOutlineItem & { pageNumber: number } =>
      typeof item.pageNumber === 'number' && item.pageNumber > 0
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (itemsWithPages.length === 0) {
    return null;
  }

  // Find the chapter where the page falls (largest pageNumber <= pageNumber)
  let matchedItem: (PdfOutlineItem & { pageNumber: number }) | null = null;
  for (const item of itemsWithPages) {
    if (item.pageNumber <= pageNumber) {
      matchedItem = item;
    } else {
      break; // items are sorted, no need to continue
    }
  }

  if (!matchedItem) {
    return null;
  }

  // Find the next chapter's start page to determine end page
  const matchedIndex = itemsWithPages.indexOf(matchedItem);
  const nextItem = itemsWithPages[matchedIndex + 1];
  const endPage = nextItem ? nextItem.pageNumber - 1 : 9999;

  return {
    title: matchedItem.title,
    startPage: matchedItem.pageNumber,
    endPage: Math.min(endPage, 9999),
    level: matchedItem.level,
  };
}

/**
 * 根据页面和 outline 构建完整章节列表（含结束页）
 */
export function buildChapterList(
  outline: PdfOutlineItem[],
  totalPages: number
): ChapterInfo[] {
  const itemsWithPages = outline
    .filter((item): item is PdfOutlineItem & { pageNumber: number } =>
      typeof item.pageNumber === 'number' && item.pageNumber > 0
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const chapters: ChapterInfo[] = [];

  for (let i = 0; i < itemsWithPages.length; i++) {
    const item = itemsWithPages[i];
    const nextItem = itemsWithPages[i + 1];
    const endPage = nextItem ? nextItem.pageNumber - 1 : totalPages;

    chapters.push({
      title: item.title,
      startPage: item.pageNumber,
      endPage: Math.min(endPage, totalPages),
      level: item.level,
    });
  }

  return chapters;
}
