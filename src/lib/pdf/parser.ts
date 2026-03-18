import { pdfjsLib } from '@/lib/pdf/pdfjs';
import { MAX_PAGE_COUNT, BATCH_PAGE_SIZE } from '@/constants/limits';

/**
 * 检查页数限制
 */
export async function checkPageLimit(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdfDoc.numPages;

  if (pageCount > MAX_PAGE_COUNT) {
    throw new Error(`PDF has ${pageCount} pages. Maximum supported is ${MAX_PAGE_COUNT} pages.`);
  }

  return pageCount;
}

/**
 * 从 PDF 提取文本（支持大文档分批处理）
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
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
