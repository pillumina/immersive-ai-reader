import { useEffect, useRef, useState } from 'react';
import { annotationCommands } from '@/lib/tauri';
import { PdfOutlineItem, renderPagesToContainer } from '@/lib/pdf/renderer';
import { PDFDocument } from '@/types/document';

export function useCanvasRendering(
  scrollContainerId: string,
  containerId: string,
  pdfDocument: PDFDocument | null,
  zoomLevel: number
) {
  const renderJobIdRef = useRef(0);
  const latestZoomRef = useRef(zoomLevel);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const NOTE_PREFIX = '__NOTE__|';

  const clearHighlights = () => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    containerEl.querySelectorAll('.pdf-highlight').forEach((el) => el.remove());
  };

  const renderHighlight = (
    pageNumber: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;
    const highlight = document.createElement('div');
    highlight.className = 'pdf-highlight';
    highlight.style.left = `${x}px`;
    highlight.style.top = `${y}px`;
    highlight.style.width = `${width}px`;
    highlight.style.height = `${height}px`;
    highlight.style.backgroundColor = color;
    pageEl.appendChild(highlight);
  };

  const renderNoteCard = (pageNumber: number, x: number, y: number, content: string) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;

    const card = document.createElement('div');
    card.className = 'pdf-note-card';
    card.style.left = `${Math.max(x + 8, 8)}px`;
    card.style.top = `${Math.max(y + 8, 8)}px`;
    card.textContent = content;
    pageEl.appendChild(card);
  };

  const loadStoredHighlights = async (documentId: string) => {
    clearHighlights();
    const annotations = await annotationCommands.getByDocument(documentId);
    annotations
      .filter((a) => a.annotation_type === 'highlight')
      .forEach((a) => {
        const textValue = typeof a.text === 'string' ? a.text : '';
        const isNote = textValue.startsWith(NOTE_PREFIX);
        const noteRaw = isNote ? textValue.slice(NOTE_PREFIX.length) : '';
        const noteContent = isNote ? noteRaw.split('\n\n')[0] : '';

        renderHighlight(
          Number(a.page_number),
          Number(a.position_x),
          Number(a.position_y),
          Number(a.position_width),
          Number(a.position_height),
          a.color || (isNote ? 'rgba(14, 165, 233, 0.25)' : 'rgba(255, 235, 59, 0.35)')
        );
        if (isNote && noteContent) {
          renderNoteCard(
            Number(a.page_number),
            Number(a.position_x),
            Number(a.position_y),
            noteContent
          );
        }
      });
  };

  useEffect(() => {
    latestZoomRef.current = zoomLevel;
    const containerEl = globalThis.document?.getElementById(containerId) as HTMLElement | null;
    if (!containerEl) return;
    // Chromium WebView supports css zoom and keeps layout/scroll consistent.
    containerEl.style.zoom = String(zoomLevel);
  }, [containerId, zoomLevel]);

  // Render pages when document changes.
  useEffect(() => {
    if (!pdfDocument) return;
    renderJobIdRef.current += 1;
    const jobId = renderJobIdRef.current;

    const renderDocument = async () => {
      setIsRendering(true);
      setRenderError(null);

      try {
        let containerEl = globalThis.document?.getElementById(containerId);
        if (!(containerEl instanceof HTMLElement)) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          containerEl = globalThis.document?.getElementById(containerId);
        }
        if (!(containerEl instanceof HTMLElement)) {
          throw new Error(`Container element not found: ${containerId}`);
        }

        console.log('PDF container element:', containerEl);

        console.log('Document:', pdfDocument);
        console.log('File blob type:', typeof pdfDocument.fileBlob, pdfDocument.fileBlob instanceof File);

        // Render all pages
        if (!pdfDocument.fileBlob) {
          throw new Error('当前文档未包含本地文件内容，请重新上传 PDF');
        }

        const file = pdfDocument.fileBlob instanceof File
          ? pdfDocument.fileBlob
          : new File([pdfDocument.fileBlob], pdfDocument.fileName, { type: 'application/pdf' });

        console.log('File to render:', file.name, file.size, file.type);
        console.log('Zoom level:', latestZoomRef.current);

        const result = await Promise.race([
          renderPagesToContainer(file, containerEl, {
            scale: 1.5,
            shouldCancel: () => jobId !== renderJobIdRef.current,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('PDF rendering timeout')), 30000)
          ),
        ]);
        if (jobId !== renderJobIdRef.current) return;

        setTotalPages(result.totalPages);
        setCurrentPage(1);
        setOutline(result.outline);
        console.log('Rendered pages count:', result.totalPages);

        await loadStoredHighlights(pdfDocument.id);
      } catch (error) {
        if (jobId !== renderJobIdRef.current) return;
        if (error instanceof Error && error.message === 'PDF rendering cancelled') return;
        console.error('Render error:', error);
        const message = error instanceof Error ? error.message : 'Failed to render PDF';
        setRenderError(message);
      } finally {
        if (jobId === renderJobIdRef.current) {
          setIsRendering(false);
        }
      }
    };

    renderDocument();
  }, [containerId, pdfDocument]);

  const highlightSelection = async (color = 'rgba(255, 235, 59, 0.35)') => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const selection = globalThis.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      throw new Error('请先选中文本');
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) {
      throw new Error('选中文本为空');
    }

    const clientRects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 1 && rect.height > 1
    );
    if (clientRects.length === 0) {
      throw new Error('未找到可高亮的文本区域');
    }

    let count = 0;
    for (const rect of clientRects) {
      const target = globalThis.document
        ?.elementFromPoint(rect.left + 1, rect.top + 1)
        ?.closest('.pdf-page') as HTMLElement | null;
      if (!target) continue;
      const pageNumber = Number(target.dataset.pageNumber || '0');
      if (!pageNumber) continue;
      const pageRect = target.getBoundingClientRect();
      const x = Math.max(rect.left - pageRect.left, 0);
      const y = Math.max(rect.top - pageRect.top, 0);
      const width = Math.min(rect.width, pageRect.width - x);
      const height = Math.min(rect.height, pageRect.height - y);
      if (width <= 1 || height <= 1) continue;

      await annotationCommands.create({
        document_id: pdfDocument.id,
        page_number: pageNumber,
        annotation_type: 'highlight',
        color,
        position_x: x,
        position_y: y,
        position_width: width,
        position_height: height,
        text,
      });

      renderHighlight(pageNumber, x, y, width, height, color);
      count += 1;
    }

    selection.removeAllRanges();
    if (count === 0) {
      throw new Error('未能识别可高亮区域');
    }
    return count;
  };

  const addNoteForSelection = async (content: string) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const note = content.trim();
    if (!note) throw new Error('笔记内容不能为空');

    const selection = globalThis.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      throw new Error('请先选中文本');
    }

    const range = selection.getRangeAt(0);
    const rect = Array.from(range.getClientRects()).find((r) => r.width > 1 && r.height > 1);
    if (!rect) throw new Error('未找到可锚定区域');

    const target = globalThis.document
      ?.elementFromPoint(rect.left + 1, rect.top + 1)
      ?.closest('.pdf-page') as HTMLElement | null;
    if (!target) throw new Error('未找到页面锚点');
    const pageNumber = Number(target.dataset.pageNumber || '0');
    if (!pageNumber) throw new Error('未找到页面编号');

    const pageRect = target.getBoundingClientRect();
    const x = Math.max(rect.left - pageRect.left, 0);
    const y = Math.max(rect.top - pageRect.top, 0);
    const width = Math.min(rect.width, pageRect.width - x);
    const height = Math.min(rect.height, pageRect.height - y);
    const selectedText = selection.toString().trim();

    await annotationCommands.create({
      document_id: pdfDocument.id,
      page_number: pageNumber,
      annotation_type: 'highlight',
      color: 'rgba(14, 165, 233, 0.25)',
      position_x: x,
      position_y: y,
      position_width: width,
      position_height: height,
      text: `${NOTE_PREFIX}${note}\n\n${selectedText}`,
    });

    renderHighlight(pageNumber, x, y, width, height, 'rgba(14, 165, 233, 0.25)');
    renderNoteCard(pageNumber, x, y, note);
    selection.removeAllRanges();
  };

  const pinNoteToCurrentPage = async (content: string) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const note = content.trim();
    if (!note) throw new Error('消息内容为空，无法固定');

    const pageNumber = Math.max(currentPage || 1, 1);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) {
      throw new Error('页面容器未就绪');
    }
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) {
      throw new Error('未找到当前页面');
    }

    const existingCards = pageEl.querySelectorAll('.pdf-note-card').length;
    const x = 20;
    const y = 24 + existingCards * 78;
    const width = 8;
    const height = 8;

    await annotationCommands.create({
      document_id: pdfDocument.id,
      page_number: pageNumber,
      annotation_type: 'highlight',
      color: 'rgba(14, 165, 233, 0.06)',
      position_x: x,
      position_y: y,
      position_width: width,
      position_height: height,
      text: `${NOTE_PREFIX}${note}`,
    });

    renderHighlight(pageNumber, x, y, width, height, 'rgba(14, 165, 233, 0.06)');
    renderNoteCard(pageNumber, x, y, note);
  };

  useEffect(() => {
    const scroller = globalThis.document?.getElementById(scrollContainerId);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(scroller instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) return;

    const updateCurrentPage = () => {
      const pageEls = containerEl.querySelectorAll<HTMLElement>('.pdf-page');
      if (!pageEls.length) return;
      const threshold = scroller.scrollTop + 40;
      let page = 1;
      pageEls.forEach((el, idx) => {
        if (el.offsetTop <= threshold) page = idx + 1;
      });
      setCurrentPage(Math.min(Math.max(page, 1), totalPages || page));
    };

    updateCurrentPage();
    scroller.addEventListener('scroll', updateCurrentPage, { passive: true });
    return () => scroller.removeEventListener('scroll', updateCurrentPage);
  }, [scrollContainerId, containerId, totalPages]);

  const jumpToPage = (pageNumber: number) => {
    const scroller = globalThis.document?.getElementById(scrollContainerId);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(scroller instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) return;
    const target = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!target) return;
    scroller.scrollTo({ top: Math.max(target.offsetTop - 16, 0), behavior: 'smooth' });
  };

  const flashPage = (pageNumber: number) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;
    pageEl.classList.remove('pdf-page-focus');
    // restart animation
    void pageEl.offsetWidth;
    pageEl.classList.add('pdf-page-focus');
    setTimeout(() => pageEl.classList.remove('pdf-page-focus'), 1600);
  };

  const jumpToCitation = (pageNumber: number) => {
    jumpToPage(pageNumber);
    setTimeout(() => flashPage(pageNumber), 220);
  };

  return {
    isRendering,
    renderError,
    totalPages,
    currentPage,
    outline,
    jumpToPage,
    jumpToCitation,
    highlightSelection,
    addNoteForSelection,
    pinNoteToCurrentPage,
  };
}
