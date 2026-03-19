import { useEffect, useRef, useState } from 'react';
import { annotationCommands } from '@/lib/tauri';
import { PdfOutlineItem, renderPagesToContainer } from '@/lib/pdf/renderer';
import { PDFDocument } from '@/types/document';
import { simpleMarkdownToHtml } from '@/utils/markdown';

export function useCanvasRendering(
  scrollContainerId: string,
  containerId: string,
  pdfDocument: PDFDocument | null,
  zoomLevel: number,
  onUnpin?: (messageId: string) => void,
) {
  const renderJobIdRef = useRef(0);
  const latestZoomRef = useRef(zoomLevel);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const NOTE_PREFIX = '__NOTE__|';
  const AI_CARD_PREFIX = '__AICARD__|';

  const clearHighlights = () => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;

    // Clean up event listeners before removing elements
    containerEl.querySelectorAll('.pdf-note-card').forEach((el) => {
      const cleanup = (el as HTMLElement & { _dragCleanup?: () => void })._dragCleanup;
      if (cleanup) cleanup();
      el.remove();
    });
    containerEl.querySelectorAll('.pdf-highlight').forEach((el) => el.remove());
  };

  const renderHighlight = (
    pageNumber: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    annotationId?: string
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
    if (annotationId) highlight.dataset.annotationId = annotationId;
    pageEl.appendChild(highlight);
  };

  const renderNoteCard = (
    pageNumber: number,
    x: number,
    y: number,
    content: string,
    options?: { messageId?: string; annotationId?: string; kind?: 'note' | 'ai-card'; selectedText?: string }
  ) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;

    const card = document.createElement('div');
    const kind = options?.kind || 'note';
    card.className = `pdf-note-card ${kind === 'ai-card' ? 'pdf-ai-card' : ''}`;
    card.style.left = `${Math.max(x + 8, 8)}px`;
    card.style.top = `${Math.max(y + 8, 8)}px`;
    if (kind === 'ai-card') {
      const header = document.createElement('div');
      header.className = 'pdf-ai-card-header';
      header.textContent = 'AI Card';
      const body = document.createElement('div');
      body.className = 'pdf-ai-card-body';
      body.innerHTML = simpleMarkdownToHtml(content);
      const actions = document.createElement('div');
      actions.className = 'pdf-ai-card-actions';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'pdf-ai-card-action';
      openBtn.textContent = 'Open Chat';
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'pdf-ai-card-action';
      expandBtn.textContent = 'Expand';
      actions.appendChild(openBtn);
      actions.appendChild(expandBtn);
      // Add Unpin button for AI cards
      if (options?.messageId && onUnpin) {
        const unpinBtn = document.createElement('button');
        unpinBtn.type = 'button';
        unpinBtn.className = 'pdf-ai-card-action pdf-ai-card-unpin';
        unpinBtn.textContent = 'Unpin';
        unpinBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          onUnpin(options.messageId!);
        });
        actions.appendChild(unpinBtn);
      }
      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(actions);

      let expanded = false;
      expandBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        expanded = !expanded;
        body.classList.toggle('is-expanded', expanded);
        expandBtn.textContent = expanded ? 'Collapse' : 'Expand';
      });
      openBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        if (!options?.messageId) return;
        globalThis.dispatchEvent(
          new CustomEvent('ai-open-message', {
            detail: { messageId: options.messageId },
          })
        );
      });
    } else {
      const displayEl = document.createElement('div');
      displayEl.className = 'note-card-display';
      displayEl.innerHTML = simpleMarkdownToHtml(content);
      card.appendChild(displayEl);

      let currentContent = content;
      let editing = false;

      const enterEdit = () => {
        if (editing) return;
        editing = true;
        const textarea = document.createElement('textarea');
        textarea.className = 'note-card-editor';
        textarea.value = currentContent;
        displayEl.style.display = 'none';
        card.appendChild(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const saveAndExit = async () => {
          if (!editing) return;
          editing = false;
          const newContent = textarea.value.trim();
          textarea.remove();
          displayEl.style.display = '';
          if (newContent && newContent !== currentContent) {
            currentContent = newContent;
            displayEl.innerHTML = simpleMarkdownToHtml(newContent);
            const annotationId = card.dataset.noteAnnotationId;
            if (annotationId) {
              const selectedPart = card.dataset.noteSelectedText || '';
              const fullText = `${NOTE_PREFIX}${newContent}${selectedPart ? `\n\n${selectedPart}` : ''}`;
              try {
                await annotationCommands.updateText(annotationId, fullText);
              } catch {
                // silent – local display is already updated
              }
            }
          }
        };

        textarea.addEventListener('blur', () => { void saveAndExit(); });
        textarea.addEventListener('keydown', (evt) => {
          if (evt.key === 'Escape') {
            editing = false;
            textarea.remove();
            displayEl.style.display = '';
          }
          if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
            void saveAndExit();
          }
        });
      };

      if (options?.annotationId) {
        card.dataset.noteAnnotationId = options.annotationId;
      }
      if (options?.selectedText) {
        card.dataset.noteSelectedText = options.selectedText;
      }

      card.addEventListener('dblclick', (evt) => {
        evt.stopPropagation();
        enterEdit();
      });
      card.style.cursor = 'default';
      card.title = 'Double-click to edit. Drag to canvas.';

      // Make note cards draggable to canvas
      card.draggable = true;
      card.dataset.notePageNumber = String(pageNumber);
      card.addEventListener('dragstart', (evt) => {
        if (!(evt instanceof DragEvent)) return;
        const notePayload = {
          id: options?.annotationId || `note-${Date.now()}`,
          annotationId: options?.annotationId || '',
          content,
          selectedText: options?.selectedText || '',
          pageNumber,
        };
        evt.dataTransfer?.setData('application/x-note-card', JSON.stringify(notePayload));
        evt.dataTransfer?.setData('text/plain', `__NOTECARD__${JSON.stringify(notePayload)}`);
        evt.dataTransfer!.effectAllowed = 'copy';
      });
    }
    if (kind === 'ai-card' && options?.messageId) {
      card.dataset.messageId = options.messageId;
      if (options.annotationId) {
        card.dataset.annotationId = options.annotationId;
      }
      card.title = 'Drag to reposition';
      const attachDrag = () => {
        const annotationId = options.annotationId;
        let dragging = false;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;
        let lastLeft = 0;
        let lastTop = 0;
        let didDrag = false;

        const onPointerMove = (evt: PointerEvent) => {
          if (!dragging) return;
          const pageRect = pageEl.getBoundingClientRect();
          const dx = evt.clientX - startClientX;
          const dy = evt.clientY - startClientY;
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            didDrag = true;
          }
          const maxLeft = Math.max(pageRect.width - card.offsetWidth - 8, 8);
          const maxTop = Math.max(pageRect.height - card.offsetHeight - 8, 8);
          lastLeft = Math.min(Math.max(startLeft + dx, 8), maxLeft);
          lastTop = Math.min(Math.max(startTop + dy, 8), maxTop);
          card.style.left = `${lastLeft}px`;
          card.style.top = `${lastTop}px`;
        };

        // Cleanup function to prevent memory leaks
        const cleanup = () => {
          dragging = false;
          card.classList.remove('pdf-ai-card-dragging');
          globalThis.removeEventListener('pointermove', onPointerMove);
        };

        const onPointerUp = async () => {
          if (!dragging) return;
          cleanup();
          // Card uses +8 visual offset from annotation anchor.
          const nextX = Math.max(lastLeft - 8, 0);
          const nextY = Math.max(lastTop - 8, 0);
          try {
            if (annotationId) await annotationCommands.updatePosition(annotationId, nextX, nextY);
          } catch {
            card.style.left = `${startLeft}px`;
            card.style.top = `${startTop}px`;
          }
          if (didDrag) {
            card.dataset.dragged = '1';
            globalThis.setTimeout(() => {
              if (card.dataset.dragged === '1') delete card.dataset.dragged;
            }, 120);
          }
        };

        // Store handler reference for cleanup
        const pointerDownHandler = (evt: PointerEvent) => {
          if (evt.button !== 0) return;
          const targetEl = evt.target as HTMLElement | null;
          if (targetEl?.closest('.pdf-ai-card-action')) return;
          dragging = true;
          startClientX = evt.clientX;
          startClientY = evt.clientY;
          startLeft = card.offsetLeft;
          startTop = card.offsetTop;
          lastLeft = startLeft;
          lastTop = startTop;
          didDrag = false;
          card.classList.add('pdf-ai-card-dragging');
          globalThis.addEventListener('pointermove', onPointerMove);
          // Use explicit listener instead of { once: true } for better cleanup control
          globalThis.addEventListener('pointerup', onPointerUp);
        };

        // Store cleanup function on card for later removal
        (card as HTMLElement & { _dragCleanup?: () => void })._dragCleanup = () => {
          cleanup();
          card.removeEventListener('pointerdown', pointerDownHandler);
        };

        card.addEventListener('pointerdown', pointerDownHandler);
      };
      attachDrag();
    }
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
        const isAiCard = textValue.startsWith(AI_CARD_PREFIX);
        const noteRaw = isNote ? textValue.slice(NOTE_PREFIX.length) : '';
        const noteContent = isNote ? noteRaw.split('\n\n')[0] : '';
        const aiRaw = isAiCard ? textValue.slice(AI_CARD_PREFIX.length) : '';
        const aiParts = isAiCard ? aiRaw.split('\n\n') : [];
        const aiMessageId = isAiCard ? (aiParts[0] || '').trim() : '';
        const aiContent = isAiCard ? aiParts.slice(1).join('\n\n').trim() : '';

        renderHighlight(
          Number(a.page_number),
          Number(a.position_x),
          Number(a.position_y),
          Number(a.position_width),
          Number(a.position_height),
          a.color || (
            isAiCard
              ? 'rgba(168, 85, 247, 0.18)'
              : isNote
                ? 'rgba(14, 165, 233, 0.25)'
                : 'rgba(255, 235, 59, 0.35)'
          ),
          (isAiCard || isNote) ? a.id : undefined
        );
        if (isNote && noteContent) {
          const noteSelectedText = isNote ? noteRaw.split('\n\n').slice(1).join('\n\n') : '';
          renderNoteCard(
            Number(a.page_number),
            Number(a.position_x),
            Number(a.position_y),
            noteContent,
            { annotationId: a.id, selectedText: noteSelectedText }
          );
        }
        if (isAiCard && aiContent) {
          renderNoteCard(
            Number(a.page_number),
            Number(a.position_x),
            Number(a.position_y),
            aiContent,
            { messageId: aiMessageId, annotationId: a.id, kind: 'ai-card' }
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
            scale: 1.25,
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
    const hasSelection = selection && selection.rangeCount > 0 && !selection.isCollapsed;

    let pageNumber: number;
    let x: number;
    let y: number;
    let width: number;
    let height: number;
    let selectedText = '';

    if (hasSelection) {
      // Anchored note: attached to selected text
      const range = selection!.getRangeAt(0);
      const rect = Array.from(range.getClientRects()).find((r) => r.width > 1 && r.height > 1);
      if (!rect) throw new Error('未找到可锚定区域');

      const target = globalThis.document
        ?.elementFromPoint(rect.left + 1, rect.top + 1)
        ?.closest('.pdf-page') as HTMLElement | null;
      if (!target) throw new Error('未找到页面锚点');

      pageNumber = Number(target.dataset.pageNumber || '0');
      if (!pageNumber) throw new Error('未找到页面编号');

      const pageRect = target.getBoundingClientRect();
      x = Math.max(rect.left - pageRect.left, 0);
      y = Math.max(rect.top - pageRect.top, 0);
      width = Math.min(rect.width, pageRect.width - x);
      height = Math.min(rect.height, pageRect.height - y);
      selectedText = selection!.toString().trim();
    } else {
      // Free-floating note: anchored to current page
      const containerEl = globalThis.document?.getElementById(containerId);
      pageNumber = currentPage || 1;

      const pageEl = containerEl?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
      if (!pageEl) throw new Error('未找到当前页面');

      // Stack cards vertically to avoid overlap
      const existingCards = pageEl.querySelectorAll('.pdf-note-card').length;
      x = 20;
      y = 24 + existingCards * 78;
      width = 8;
      height = 8;
    }

    const createdNote = await annotationCommands.create({
      document_id: pdfDocument.id,
      page_number: pageNumber,
      annotation_type: 'highlight',
      color: 'rgba(14, 165, 233, 0.25)',
      position_x: x,
      position_y: y,
      position_width: width,
      position_height: height,
      text: selectedText ? `${NOTE_PREFIX}${note}\n\n${selectedText}` : `${NOTE_PREFIX}${note}`,
    });

    if (hasSelection) {
      renderHighlight(pageNumber, x, y, width, height, 'rgba(14, 165, 233, 0.25)');
    }
    renderNoteCard(pageNumber, x, y, note, { annotationId: createdNote?.id, selectedText });
    selection?.removeAllRanges();
  };

  const pinNoteToCurrentPage = async (
    content: string,
    options?: { pageNumber?: number; messageId?: string; kind?: 'note' | 'ai-card' }
  ) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const note = content.trim();
    if (!note) throw new Error('消息内容为空，无法固定');

    const pageNumber = Math.max(options?.pageNumber || currentPage || 1, 1);
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

    const kind = options?.kind || 'note';
    const textPayload = kind === 'ai-card'
      ? `${AI_CARD_PREFIX}${options?.messageId || ''}\n\n${note}`
      : `${NOTE_PREFIX}${note}`;
    const created = await annotationCommands.create({
      document_id: pdfDocument.id,
      page_number: pageNumber,
      annotation_type: 'highlight',
      color: kind === 'ai-card' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(14, 165, 233, 0.06)',
      position_x: x,
      position_y: y,
      position_width: width,
      position_height: height,
      text: textPayload,
    });

    renderHighlight(
      pageNumber,
      x,
      y,
      width,
      height,
      kind === 'ai-card' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(14, 165, 233, 0.06)',
      kind === 'ai-card' ? created?.id : undefined
    );
    renderNoteCard(pageNumber, x, y, note, {
      messageId: options?.messageId,
      annotationId: created?.id,
      kind,
    });
  };

  const dropAICardAtPoint = async (
    content: string,
    messageId: string,
    clientX: number,
    clientY: number,
    pageHint?: number
  ) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const note = content.trim();
    if (!note) throw new Error('消息内容为空，无法固定');

    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) {
      throw new Error('页面容器未就绪');
    }

    // Use pageHint if available (extracted from AI content citation), fallback to currentPage
    const resolvedPageNumber = pageHint || currentPage || 1;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${resolvedPageNumber}"]`);
    if (!pageEl) {
      throw new Error(`未找到页面 ${resolvedPageNumber}`);
    }

    const pageRect = pageEl.getBoundingClientRect();
    // Try to use drop coordinates if they land within the page bounds, otherwise center the card
    const isOverPage = clientX >= pageRect.left && clientX <= pageRect.right &&
                       clientY >= pageRect.top && clientY <= pageRect.bottom;
    const rawX = isOverPage ? clientX - pageRect.left : pageRect.width / 2;
    const rawY = isOverPage ? clientY - pageRect.top : pageRect.height / 2;
    const x = Math.max(rawX - 10, 8);
    const y = Math.max(rawY - 10, 8);
    const width = 8;
    const height = 8;
    const textPayload = `${AI_CARD_PREFIX}${messageId}\n\n${note}`;

    const created = await annotationCommands.create({
      document_id: pdfDocument.id,
      page_number: resolvedPageNumber,
      annotation_type: 'highlight',
      color: 'rgba(168, 85, 247, 0.18)',
      position_x: x,
      position_y: y,
      position_width: width,
      position_height: height,
      text: textPayload,
    });

    renderHighlight(resolvedPageNumber, x, y, width, height, 'rgba(168, 85, 247, 0.18)', created?.id);
    renderNoteCard(resolvedPageNumber, x, y, note, {
      messageId,
      annotationId: created?.id,
      kind: 'ai-card',
    });
    jumpToPage(resolvedPageNumber);
  };

  const unpinAiCardByMessageId = async (messageId: string) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const annotations = await annotationCommands.getByDocument(pdfDocument.id);
    const prefix = `${AI_CARD_PREFIX}${messageId}`;
    const aiAnnotation = annotations.find(
      (a: { text?: string }) => typeof a.text === 'string' && a.text.startsWith(prefix)
    );
    if (!aiAnnotation?.id) throw new Error('未找到对应的 AI 卡片');
    await annotationCommands.delete(aiAnnotation.id);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (containerEl instanceof HTMLElement) {
      const card = containerEl.querySelector<HTMLElement>(`.pdf-ai-card[data-message-id="${messageId}"]`);
      card?.remove();
      const highlight = containerEl.querySelector<HTMLElement>(`.pdf-highlight[data-annotation-id="${aiAnnotation.id}"]`);
      highlight?.remove();
    }
    onUnpin?.(messageId);
    // Fire custom event so App can show toast
    globalThis.dispatchEvent(new CustomEvent('ai-card-unpinned', { detail: { messageId } }));
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

  const locateAiCardByMessageId = (messageId: string) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return false;
    const card = containerEl.querySelector<HTMLElement>(`.pdf-ai-card[data-message-id="${messageId}"]`);
    if (!card) return false;
    const pageEl = card.closest<HTMLElement>('.pdf-page');
    const pageNumber = Number(pageEl?.dataset.pageNumber || '0');
    if (pageNumber > 0) {
      jumpToPage(pageNumber);
      setTimeout(() => flashPage(pageNumber), 220);
    }
    card.classList.remove('pdf-ai-card-focus');
    void card.offsetWidth;
    card.classList.add('pdf-ai-card-focus');
    setTimeout(() => card.classList.remove('pdf-ai-card-focus'), 1800);
    return true;
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
    dropAICardAtPoint,
    unpinAiCardByMessageId,
    locateAiCardByMessageId,
  };
}
