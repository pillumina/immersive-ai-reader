import { useEffect, useRef, useState } from 'react';
import { annotationCommands, documentCommands, tagCommands } from '@/lib/tauri';
import { PdfOutlineItem, renderPagesToContainer } from '@/lib/pdf/renderer';
import { PDFDocument } from '@/types/document';
import { simpleMarkdownToHtml } from '@/utils/markdown';
import { aiCardDragState } from '@/components/layout/AIPanel';
import type { Tag } from '@/types/annotation';

export function useCanvasRendering(
  scrollContainerId: string,
  containerId: string,
  pdfDocument: PDFDocument | null,
  zoomLevel: number,
  onPinnedIdsChange?: (messageId: string) => void,
) {
  const renderJobIdRef = useRef(0);
  const latestZoomRef = useRef(zoomLevel);
  const lastSavedPageRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagCacheRef = useRef<Map<string, Tag[]>>(new Map());
  const tagChipRenderersRef = useRef<Map<string, (tags: Tag[]) => void>>(new Map());
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pdfDocument?.lastPage ?? 1);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const NOTE_PREFIX = '__NOTE__|';
  const AI_CARD_PREFIX = '__AICARD__|';

  // Debounced save of reading progress to database.
  useEffect(() => {
    if (!pdfDocument?.id || currentPage === lastSavedPageRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await documentCommands.updateLastPage(pdfDocument.id, currentPage);
        lastSavedPageRef.current = currentPage;
      } catch (e) {
        console.warn('[reading-progress] save failed:', e);
      }
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [pdfDocument?.id, currentPage]);

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
    options?: { messageId?: string; annotationId?: string; kind?: 'note' | 'ai-card'; selectedText?: string; tags?: Tag[] }
  ) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;
    const pageEl = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!pageEl) return;

    const card = document.createElement('div');
    const kind = options?.kind || 'note';
    card.className = `pdf-note-card ${kind === 'ai-card' ? 'pdf-ai-card' : ''}`;

    // Absolute position within scroll container (card floats above pages, not clipped by page)
    const pageOffsetTop = pageEl.offsetTop;
    card.style.left = `${Math.max(x + 8, 8)}px`;
    card.style.top = `${pageOffsetTop + Math.max(y + 8, 8)}px`;

    // Tag area — shown when annotationId is present
    const tagArea = document.createElement('div');
    tagArea.className = 'note-card-tag-area';
    tagArea.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;align-items:center;min-height:22px;margin-bottom:5px;padding-bottom:5px;border-bottom:1px solid rgba(0,0,0,0.05);';

    // Always show "+" button when annotationId is present (even if no tags yet)
    const renderTagChips = (tags: Tag[]) => {
      tagArea.innerHTML = '';
      tags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'note-card-tag-chip';
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;height:16px;padding:0 4px;border-radius:4px;background:${tag.color}22;border:1px solid ${tag.color}55;color:${tag.color};font-size:9px;font-weight:500;cursor:pointer;user-select:none;white-space:nowrap;`;
        chip.textContent = tag.name;
        chip.title = `${tag.name} — click to manage`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (options?.annotationId) {
            globalThis.dispatchEvent(new CustomEvent('open-card-tag-popup', {
              detail: { annotationId: options.annotationId },
              bubbles: true,
            }));
          }
        });
        tagArea.appendChild(chip);
      });
      // Always render "+" button when annotationId is present
      if (options?.annotationId) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'note-card-tag-add';
        addBtn.style.cssText = 'display:inline-flex;align-items:center;gap:3px;height:18px;padding:0 5px;border-radius:4px;background:#f1f5f9;border:1px solid #e2e8f0;color:#94a3b8;font-size:10px;cursor:pointer;line-height:1;transition:background 0.1s,color 0.1s;white-space:nowrap;';
        addBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg> Add tag`;
        addBtn.title = 'Add tag';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (options?.annotationId) {
            globalThis.dispatchEvent(new CustomEvent('open-card-tag-popup', {
              detail: { annotationId: options.annotationId },
              bubbles: true,
            }));
          }
        });
        addBtn.addEventListener('mouseenter', () => {
          addBtn.style.background = '#e2e8f0';
          addBtn.style.color = '#0d9488';
          addBtn.style.borderColor = '#0d9488';
        });
        addBtn.addEventListener('mouseleave', () => {
          addBtn.style.background = '#f1f5f9';
          addBtn.style.color = '#94a3b8';
          addBtn.style.borderColor = '#e2e8f0';
        });
        tagArea.appendChild(addBtn);
      }
    };

    // Register renderer and initialize — always call to show "+" button
    if (options?.annotationId) {
      tagChipRenderersRef.current.set(options.annotationId, renderTagChips);
      const initialTags = options.tags || tagCacheRef.current.get(options.annotationId) || [];
      renderTagChips(initialTags);
    }

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
      // Add Unpin button for AI cards — calls handleCanvasUnpin which deletes from DB.
      if (options?.messageId) {
        const unpinBtn = document.createElement('button');
        unpinBtn.type = 'button';
        unpinBtn.className = 'pdf-ai-card-action pdf-ai-card-unpin';
        unpinBtn.textContent = 'Unpin';
        unpinBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          handleCanvasUnpin(options.messageId!);
        });
        actions.appendChild(unpinBtn);
      }
      card.appendChild(header);
      card.appendChild(tagArea);
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
      card.appendChild(tagArea);
      card.appendChild(displayEl);

      const statusEl = document.createElement('div');
      statusEl.className = 'note-card-status';
      statusEl.style.cssText = 'font-size:10px;opacity:0.55;margin-top:4px;color:#94a3b8;height:14px;';
      card.appendChild(statusEl);

      let currentContent = content;
      let editing = false;
      let saveTimer: ReturnType<typeof setTimeout> | null = null;

      const doSave = async (text: string) => {
        const annotationId = card.dataset.noteAnnotationId;
        if (!annotationId) return;
        const selectedPart = card.dataset.noteSelectedText || '';
        const fullText = `${NOTE_PREFIX}${text}${selectedPart ? `\n\n${selectedPart}` : ''}`;
        try {
          await annotationCommands.updateText(annotationId, fullText);
        } catch {
          // silent – local display is already updated
        }
      };

      const enterEdit = () => {
        if (editing) return;
        editing = true;
        const textarea = document.createElement('textarea');
        textarea.className = 'note-card-editor';
        textarea.value = currentContent;
        displayEl.style.display = 'none';
        statusEl.textContent = '';
        card.appendChild(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const saveAndExit = async () => {
          if (!editing) return;
          editing = false;
          if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
          const newContent = textarea.value.trim();
          textarea.remove();
          displayEl.style.display = '';
          if (newContent && newContent !== currentContent) {
            currentContent = newContent;
            displayEl.innerHTML = simpleMarkdownToHtml(newContent);
            statusEl.textContent = 'saving...';
            await doSave(newContent);
            statusEl.textContent = '';
          } else {
            statusEl.textContent = '';
          }
        };

        textarea.addEventListener('input', () => {
          const val = textarea.value.trim();
          if (saveTimer) clearTimeout(saveTimer);
          if (val !== currentContent) {
            statusEl.textContent = 'saving...';
            saveTimer = setTimeout(async () => {
              if (textarea.value.trim() !== currentContent) {
                await doSave(textarea.value.trim());
                currentContent = textarea.value.trim();
                displayEl.innerHTML = simpleMarkdownToHtml(currentContent);
              }
              statusEl.textContent = '';
            }, 500);
          }
        });
        textarea.addEventListener('blur', () => { void saveAndExit(); });
        textarea.addEventListener('keydown', (evt) => {
          if (evt.key === 'Escape') {
            editing = false;
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
            textarea.remove();
            displayEl.style.display = '';
            statusEl.textContent = '';
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
      card.style.cursor = 'pointer';
      card.title = 'Double-click to edit. Drag to reposition.';
      card.dataset.notePageNumber = String(pageNumber);

      // Action bar: edit + delete + drag handle
      const actionBar = document.createElement('div');
      actionBar.className = 'note-card-actions';
      actionBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding-top:4px;border-top:1px solid rgba(13,148,136,0.12)';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'note-card-edit-btn';
      editBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#94a3b8;font-size:13px;line-height:1;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:3px;transition:color 0.1s,background 0.1s;opacity:0;transition:opacity 0.15s;color:#94a3b8';
      editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      editBtn.title = 'Edit note';
      editBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        enterEdit();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'note-card-del-btn';
      deleteBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#94a3b8;font-size:13px;line-height:1;padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:3px;transition:color 0.1s,background 0.1s;opacity:0;transition:opacity 0.15s';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete note';
      deleteBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const annotationId = options?.annotationId;
        // Remove card from DOM immediately (synchronous)
        card.remove();
        // Notify App to delete from DB
        if (annotationId) {
          globalThis.document?.dispatchEvent(new CustomEvent('note-card-delete-app', {
            detail: { annotationId },
            bubbles: true,
          }));
        }
      });
      deleteBtn.addEventListener('mouseenter', () => {
        (deleteBtn as HTMLElement).style.color = '#ef4444';
        (deleteBtn as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
      });
      deleteBtn.addEventListener('mouseleave', () => {
        (deleteBtn as HTMLElement).style.color = '#94a3b8';
        (deleteBtn as HTMLElement).style.background = 'transparent';
      });

      // Whole-card drag (no need for a tiny drag handle)
      card.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        // Don't drag if user is trying to select text or click a button
        if ((e.target as HTMLElement).closest('button, textarea, input')) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseFloat(card.style.left || '0');
        const origTop = parseFloat(card.style.top || '0');
        let moved = false;

        // Set note drag state for AIPanel to detect
        aiCardDragState.payload = { type: 'note', content, page: pageNumber };
        aiCardDragState.isDragging = true;

        const onMove = (ev: PointerEvent) => {
          if (!moved && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
            moved = true;
          }
          card.style.cursor = 'grabbing';
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          // Unconstrained drag within container
          card.style.left = `${Math.max(origLeft + dx, 0)}px`;
          card.style.top = `${Math.max(origTop + dy, 0)}px`;

          // Check if over AIPanel — dispatch note-attachment-drop
          const panelEl = globalThis.document?.querySelector<HTMLElement>('#ai-panel-scroll, aside[class*="flex-col"]');
          if (panelEl && ev.clientX >= panelEl.getBoundingClientRect().left) {
            globalThis.document?.dispatchEvent(new CustomEvent('note-attachment-drop', {
              detail: { content, page: pageNumber },
              bubbles: true,
            }));
            aiCardDragState.payload = null;
            aiCardDragState.isDragging = false;
            cleanup();
          }
        };
        const onUp = () => {
          cleanup();
          card.style.cursor = 'default';
          if (!moved && options?.annotationId) {
            void annotationCommands.updatePosition(
              options.annotationId,
              parseFloat(card.style.left || '0'),
              parseFloat(card.style.top || '0')
            );
          }
          aiCardDragState.payload = null;
          aiCardDragState.isDragging = false;
        };
        const cleanup = () => {
          globalThis.document?.removeEventListener('pointermove', onMove);
          globalThis.document?.removeEventListener('pointerup', onUp);
        };
        globalThis.document?.addEventListener('pointermove', onMove);
        globalThis.document?.addEventListener('pointerup', onUp);
      });

      card.addEventListener('mouseenter', () => {
        (editBtn as HTMLElement).style.opacity = '1';
        (deleteBtn as HTMLElement).style.opacity = '1';
      });
      card.addEventListener('mouseleave', () => {
        (editBtn as HTMLElement).style.opacity = '0';
        (deleteBtn as HTMLElement).style.opacity = '0';
      });

      actionBar.appendChild(editBtn);
      actionBar.appendChild(deleteBtn);
      card.appendChild(actionBar);
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
          const containerRect = containerEl.getBoundingClientRect();
          const dx = evt.clientX - startClientX;
          const dy = evt.clientY - startClientY;
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            didDrag = true;
          }
          // Unconstrained drag within container
          const maxLeft = Math.max(containerRect.width - card.offsetWidth - 8, 8);
          const maxTop = Math.max(containerRect.height - card.offsetHeight - 8, 8);
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
          // Save the current visual position directly — the +8 offset is
          // already baked into card.style.left at render time, so on reload
          // the card will render at the exact same spot.
          const nextX = Math.max(lastLeft, 0);
          const nextY = Math.max(lastTop, 0);
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
    containerEl.appendChild(card);
  };

  const loadStoredHighlights = async (documentId: string) => {
    clearHighlights();
    const annotations = await annotationCommands.getByDocument(documentId);

    // Pre-load tags for all annotations that need them
    const annotationIds = annotations
      .filter((a) => {
        const text = typeof a.text === 'string' ? a.text : '';
        return text.startsWith(NOTE_PREFIX) || text.startsWith(AI_CARD_PREFIX);
      })
      .map((a) => a.id);

    // Batch load tags
    const tagResults = await Promise.all(
      annotationIds.map(async (id) => {
        try {
          const tags = await tagCommands.getByAnnotation(id);
          return { id, tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })) };
        } catch {
          return { id, tags: [] };
        }
      })
    );
    tagResults.forEach(({ id, tags }) => {
      if (tags.length > 0) tagCacheRef.current.set(id, tags);
    });

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
        const cachedTags = tagCacheRef.current.get(a.id) || [];

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
            { annotationId: a.id, selectedText: noteSelectedText, tags: cachedTags }
          );
        }
        if (isAiCard && aiContent) {
          renderNoteCard(
            Number(a.page_number),
            Number(a.position_x),
            Number(a.position_y),
            aiContent,
            { messageId: aiMessageId, annotationId: a.id, kind: 'ai-card', tags: cachedTags }
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
      if (!containerId || !pdfDocument) {
        setIsRendering(false);
        return;
      }
      setIsRendering(true);
      setRenderError(null);

      // Declare skeleton array before try so finally can close over it.
      const skeletonEls: HTMLElement[] = [];

      try {
        let containerEl = globalThis.document?.getElementById(containerId);
        if (!(containerEl instanceof HTMLElement)) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          containerEl = globalThis.document?.getElementById(containerId);
        }
        if (!(containerEl instanceof HTMLElement)) {
          throw new Error(`Container element not found: ${containerId}`);
        }

        // Skip re-render if pages are already rendered (e.g., tab switching back).
        if (containerEl.childNodes.length > 0) {
          setIsRendering(false);
          return;
        }

        // Show skeleton placeholders while PDF parses.
        for (let i = 0; i < 2; i++) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'width: 612px; margin: 0 auto 16px; position: relative; padding-top: 129.4%;';
          const skeleton = document.createElement('div');
          skeleton.className = 'pdf-page-skeleton';
          skeleton.style.cssText = 'position: absolute; inset: 0;';
          const shimmer = document.createElement('div');
          shimmer.style.cssText = [
            'position: absolute; inset: 0;',
            'background: linear-gradient(135deg, #fafaf9 0%, #f5f5f4 100%);',
          ].join('');
          const wave = document.createElement('div');
          wave.style.cssText = [
            'position: absolute; inset: 0;',
            'background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%);',
            'animation: skeletonShimmer 1.8s ease-in-out infinite;',
          ].join('');
          shimmer.appendChild(wave);
          skeleton.appendChild(shimmer);
          wrapper.appendChild(skeleton);
          containerEl.appendChild(wrapper);
          skeletonEls.push(skeleton);
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
        setCurrentPage(pdfDocument.lastPage ?? 1);
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
          // Remove skeleton placeholders added before render started.
          skeletonEls.forEach((el) => el.parentElement?.remove());
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

  const addNoteForSelection = async (
    content: string,
    position?: { x: number; y: number },
    targetPageNumber?: number
  ) => {
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
      // Free-floating note: use right-click position on the known page
      const containerEl = globalThis.document?.getElementById(containerId);
      const pn = targetPageNumber ?? currentPage ?? 1;
      const pageEl = containerEl?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pn}"]`);

      if (pageEl && position) {
        // Place at right-click viewport coords converted to page-relative
        const pageRect = pageEl.getBoundingClientRect();
        x = Math.max(position.x - pageRect.left, 8);
        y = Math.max(position.y - pageRect.top, 8);
        pageNumber = pn;
      } else {
        // Fallback: stack on current page
        const targetEl = pageEl ?? containerEl?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${currentPage ?? 1}"]`);
        if (!targetEl) throw new Error('未找到当前页面');
        pageNumber = Number(targetEl.dataset.pageNumber || '0') || currentPage || 1;
        const existingCards = targetEl.querySelectorAll('.pdf-note-card').length;
        x = 20;
        y = 24 + existingCards * 78;
      }
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
    return createdNote;
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
    onPinnedIdsChange?.(messageId);
    // Fire custom event so App can show toast
    globalThis.dispatchEvent(new CustomEvent('ai-card-unpinned', { detail: { messageId } }));
  };

  // Called by the canvas Unpin button — triggers the full deletion flow.
  const handleCanvasUnpin = async (messageId: string) => {
    try {
      await unpinAiCardByMessageId(messageId);
    } catch (error) {
      console.error('[canvas-unpin] failed:', error);
    }
  };

  useEffect(() => {
    const scroller = globalThis.document?.getElementById(scrollContainerId);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(scroller instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) return;

    // Use IntersectionObserver instead of scroll+RAF+querySelectorAll.
    // This fires only when a page actually enters/leaves the viewport — zero
    // cost when the user isn't scrolling — and requires no O(n) DOM traversal.
    const pageObserver = new IntersectionObserver(
      (entries) => {
        // Find the page closest to the top of the scroll container.
        let bestRatio = -1;
        let bestPage = totalPages || 1;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // intersectionRect / boundingClientRect gives us how "at top" this page is.
            const ratio = entry.intersectionRect.height / entry.boundingClientRect.height;
            if (ratio > bestRatio) {
              bestRatio = ratio;
              const pageNum = Number(
                (entry.target as HTMLElement).dataset.pageNumber || '1'
              );
              bestPage = pageNum;
            }
          }
        }
        if (bestRatio >= 0) {
          setCurrentPage(Math.min(Math.max(bestPage, 1), totalPages || bestPage));
        }
      },
      {
        root: scroller,
        // Trigger when the top of a page approaches within 100px of the viewport top.
        rootMargin: '-80px 0px -60% 0px',
        // Only need to observe a few pages — the observer fires on enter+leave.
        threshold: [0, 0.1, 0.5, 1.0],
      }
    );

    // Observe all rendered pages; re-collect when totalPages changes.
    const observe = () => {
      const pages = containerEl.querySelectorAll<HTMLElement>('.pdf-page');
      pages.forEach((p) => pageObserver.observe(p));
    };
    observe();

    return () => pageObserver.disconnect();
  }, [scrollContainerId, containerId, totalPages]);

  const jumpToPage = (pageNumber: number) => {
    const scroller = globalThis.document?.getElementById(scrollContainerId);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(scroller instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) return;
    const target = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    if (!target) return;
    // Use instant jump for large distances (PageUp/Down, TOC click, card pin).
    // Use smooth scroll for small nudges (arrow keys).
    const dist = Math.abs(target.offsetTop - 16 - scroller.scrollTop);
    scroller.scrollTo({ top: Math.max(target.offsetTop - 16, 0), behavior: dist > 300 ? 'auto' : 'smooth' });
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

  // Update tag chip display for a specific annotation (called by App after tag changes)
  const refreshCardTags = (annotationId: string, tags: Tag[]) => {
    tagCacheRef.current.set(annotationId, tags);
    const renderFn = tagChipRenderersRef.current.get(annotationId);
    if (renderFn) renderFn(tags);
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
    handleCanvasUnpin,
    locateAiCardByMessageId,
    refreshCardTags,
  };
}
