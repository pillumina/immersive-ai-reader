import { useEffect, useRef, useState, useCallback } from 'react';
import { annotationCommands, documentCommands, tagCommands } from '@/lib/tauri';
import { PdfOutlineItem, renderPagesToContainer } from '@/lib/pdf/renderer';
import { pretextLineCache } from '@/lib/pdf/pretext-line-cache';
import { getHighlightRects as getPretextHighlightRects } from '@/lib/pdf/pretext-hit-test';
import { PDFDocument } from '@/types/document';
import { simpleMarkdownToHtml } from '@/utils/markdown';
import type { Tag } from '@/types/annotation';
import { TAG_PRESET_COLORS, PRESET_TAGS } from '@/types/annotation';

export interface CanvasThemeColors {
  aiAccent: string;
  noteAccent: string;
  deleteBtnDefault: string;
  deleteBtnHover: string;
  statusText: string;
  connectorStroke: string;
  skeletonWave: string;
  skeletonWaveEnd: string;
}

export function useCanvasRendering(
  scrollContainerId: string,
  containerId: string,
  pdfDocument: PDFDocument | null,
  zoomLevel: number,
  onPinnedIdsChange?: (messageId: string) => void,
  onHighlightDoubleClick?: (annotationId: string, pageNumber: number) => void,
  /** Called once after the first page renders, passing the rendered page width in pixels.
   *  Used by App to calculate and apply fit-to-width zoom on initial load. */
  onFirstPageRendered?: (pageWidth: number) => void,
  /** Called whenever zoom is applied (either automatic or user-initiated).
   *  @param isAutomatic - true if zoom was set by auto-fit, false if by user action.
   *  Used by App to track whether user has manually overridden auto-fit. */
  onZoomApplied?: (isAutomatic: boolean) => void,
  themeColors?: CanvasThemeColors,
) {
  const renderJobIdRef = useRef(0);
  const latestZoomRef = useRef(zoomLevel);
  const latestPdfDocRef = useRef(pdfDocument);
  const lastSavedPageRef = useRef<number | null>(null);
  const lazyCleanupRef = useRef<(() => void) | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagCacheRef = useRef<Map<string, Tag[]>>(new Map());
  const tagChipRenderersRef = useRef<Map<string, (tags: Tag[]) => void>>(new Map());
  /** Debounces onBatchRendered calls so rapid lazy renders don't spam loadStoredHighlights. */
  const batchRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Stores the current zoomLevel at the time the debounce was set (to avoid stale closure in async). */
  const zoomDebounceZoomRef = useRef<number>(1);
  /** Track if initial fit-to-width zoom has been applied. */
  const initialZoomSetRef = useRef(false);
  /** Stores the fit-to-width zoom value set by App (used to detect auto vs manual zoom). */
  const fitToWidthZoomRef = useRef<number>(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // themeColors (from useCanvasColors) reads CSS variables via getComputedStyle,
  // so it is always theme-aware. Spread it FIRST — our hardcoded fallbacks only
  // apply when themeColors doesn't provide a value (i.e., before the hook mounts).
  const mergedColors: CanvasThemeColors = {
    ...themeColors,
    aiAccent: '#7c3aed',
    noteAccent: '#0d9488',
    deleteBtnDefault: '#d4d4d4',
    deleteBtnHover: '#dc2626',
    statusText: '#78716c',
    connectorStroke: '#0d9488',
    skeletonWave: '#f5f5f4',
    skeletonWaveEnd: 'rgba(255,255,255,0.55)',
  };
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

    // Clean up all card/highlight elements in a single DOM pass.
    containerEl.querySelectorAll<HTMLElement>(
      '.pdf-note-card, .pdf-ai-card, .pdf-highlight'
    ).forEach((el) => {
      if (el.classList.contains('pdf-note-card') || el.classList.contains('pdf-ai-card')) {
        const cleanup = (el as HTMLElement & { _dragCleanup?: () => void })._dragCleanup;
        if (cleanup) cleanup();
      }
      el.remove();
    });
    // Clear stale tag chip renderer entries
    tagChipRenderersRef.current.clear();
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


  // ─── Inline tag editor ────────────────────────────────────────────────────────

  const openInlineTagEditor = (
    tagArea: HTMLElement,
    currentTags: Tag[],
    onAdd: (name: string, color: string) => void,
    onClose: () => void,
    allTags: Tag[],
  ) => {
    tagArea.innerHTML = '';

    const editor = document.createElement('div');
    editor.className = 'canvas-tag-editor';

    const inputRow = document.createElement('div');
    inputRow.className = 'canvas-tag-editor-input-row';

    const input = document.createElement('input');
    input.className = 'canvas-tag-editor-input';
    input.placeholder = 'Tag name...';
    input.autocomplete = 'off';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'canvas-tag-editor-confirm';
    confirmBtn.textContent = 'Add';
    confirmBtn.disabled = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'canvas-tag-editor-cancel';
    cancelBtn.innerHTML = '&times;';
    cancelBtn.title = 'Cancel (Esc)';

    inputRow.appendChild(input);
    inputRow.appendChild(confirmBtn);
    inputRow.appendChild(cancelBtn);

    const palette = document.createElement('div');
    palette.className = 'canvas-tag-color-palette';
    let selectedColor = '#6B7280';
    TAG_PRESET_COLORS.forEach((color) => {
      const dot = document.createElement('button');
      dot.className = 'canvas-tag-color-dot' + (color === selectedColor ? ' is-selected' : '');
      dot.style.background = color;
      dot.title = color;
      dot.type = 'button';
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        palette.querySelectorAll('.canvas-tag-color-dot').forEach((d) => d.classList.remove('is-selected'));
        dot.classList.add('is-selected');
        selectedColor = color;
      });
      palette.appendChild(dot);
    });

    const suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'canvas-tag-suggestions';

    editor.appendChild(inputRow);
    editor.appendChild(palette);
    editor.appendChild(suggestionsEl);
    tagArea.appendChild(editor as HTMLElement);

    const showSuggestions = (query: string) => {
      suggestionsEl.innerHTML = '';
      const filtered = allTags.filter(
        (t) => t.name.toLowerCase().includes(query.toLowerCase()) && !currentTags.some((ct) => ct.id === t.id)
      );
      const toShow = query.trim()
        ? filtered.slice(0, 5)
        : PRESET_TAGS.filter((pt) => !currentTags.some((ct) => ct.name === pt.name)).slice(0, 5);
      toShow.forEach((t) => {
        const s = document.createElement('button');
        s.className = 'canvas-tag-suggestion';
        s.style.background = t.color + '18';
        s.style.borderColor = t.color + '44';
        s.style.color = t.color;
        s.type = 'button';
        s.textContent = t.name;
        s.addEventListener('click', (e) => {
          e.stopPropagation();
          onAdd(t.name, t.color);
          onClose();
        });
        suggestionsEl.appendChild(s);
      });
    };

    showSuggestions('');

    const doAdd = () => {
      const name = input.value.trim();
      if (!name) return;
      onAdd(name, selectedColor);
      onClose();
    };

    input.addEventListener('input', () => {
      const val = input.value.trim();
      confirmBtn.disabled = !val;
      showSuggestions(val);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    });

    confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); doAdd(); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); onClose(); });

    requestAnimationFrame(() => input.focus());
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
    card.className = `pdf-note-card${kind === 'ai-card' ? ' pdf-ai-card' : ''}`;

    // Colored left-border accent
    const accentColor = kind === 'ai-card' ? mergedColors.aiAccent : mergedColors.noteAccent;
    card.style.borderLeft = `3px solid ${accentColor}`;

    // Absolute position within scroll container
    const pageOffsetTop = pageEl.offsetTop;
    card.style.left = `${Math.max(x + 8, 8)}px`;
    card.style.top = `${pageOffsetTop + Math.max(y + 8, 8)}px`;

    // ── Card header ───────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'canvas-card-header';

    const typeLabel = document.createElement('div');
    typeLabel.className = 'canvas-card-type';
    typeLabel.style.color = accentColor;

    const dot = document.createElement('span');
    dot.className = 'canvas-card-type-dot';
    dot.style.background = accentColor;
    dot.style.boxShadow = `0 0 4px ${accentColor}66`;

    const typeText = document.createElement('span');
    typeText.textContent = kind === 'ai-card' ? 'AI Card' : 'Note';

    typeLabel.appendChild(dot);
    typeLabel.appendChild(typeText);

    const dragHandle = document.createElement('button');
    dragHandle.className = 'canvas-card-drag-hint';
    dragHandle.type = 'button';
    dragHandle.title = 'Drag to reposition';
    dragHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;

    // Delete button (only for note cards)
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'canvas-card-delete-btn';
    deleteBtn.title = 'Delete note';
    deleteBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    deleteBtn.style.cssText = `background:none;border:none;cursor:pointer;color:${mergedColors.deleteBtnDefault};font-size:13px;line-height:1;padding:2px;border-radius:4px;transition:color 0.12s,background 0.12s;opacity:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
    deleteBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      const annotationId = options?.annotationId;
      card.remove();
      // Clean up connector SVG line if present
      if (annotationId) {
        const connectorEl = containerEl.querySelector<SVGElement>(`#connector-${annotationId}`);
        if (connectorEl) connectorEl.remove();
        globalThis.document?.dispatchEvent(new CustomEvent('note-card-delete-app', {
          detail: { annotationId },
          bubbles: true,
        }));
      }
    });
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.color = mergedColors.deleteBtnHover;
      deleteBtn.style.background = 'rgba(239,68,68,0.08)';
    });
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.color = mergedColors.deleteBtnDefault;
      deleteBtn.style.background = 'transparent';
    });
    // Show delete on card hover
    card.addEventListener('mouseenter', () => { deleteBtn.style.opacity = '1'; });
    card.addEventListener('mouseleave', () => { deleteBtn.style.opacity = '0'; });

    header.appendChild(typeLabel);
    header.appendChild(deleteBtn);
    header.appendChild(dragHandle);
    card.appendChild(header);

    // ── Tag area ──────────────────────────────────────────
    const tagArea = document.createElement('div');
    tagArea.className = 'note-card-tag-area';

    let cardTags: Tag[] = options?.tags
      ? [...options.tags]
      : (options?.annotationId ? (tagCacheRef.current.get(options.annotationId) || []) : []);

    const renderTagChips = (tags: Tag[]) => {
      tagArea.innerHTML = '';
      cardTags = tags;

      tags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'note-card-tag-chip';
        chip.style.background = `${tag.color}1a`;
        chip.style.borderColor = `${tag.color}55`;
        chip.style.color = tag.color;
        chip.textContent = tag.name;
        chip.title = `${tag.name} — click to manage`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (options?.annotationId) {
            document.dispatchEvent(new CustomEvent('open-card-tag-popup', {
              detail: { annotationId: options.annotationId },
              bubbles: true,
            }));
          }
        });
        tagArea.appendChild(chip);
      });

      if (options?.annotationId) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'note-card-tag-add';
        addBtn.innerHTML = `+ Add tag`;
        addBtn.title = 'Add tag';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
          openInlineTagEditor(
            tagArea,
            cardTags,
            async (name, color) => {
              if (!options.annotationId) return;
              try {
                await tagCommands.addToAnnotation(options.annotationId, name, color);
                const updated = await tagCommands.getByAnnotation(options.annotationId);
                const mapped = updated.map((t) => ({ id: t.id, name: t.name, color: t.color }));
                tagCacheRef.current.set(options.annotationId, mapped);
                renderTagChips(mapped);
                tagChipRenderersRef.current.get(options.annotationId)?.(mapped);
                globalThis.document?.dispatchEvent(new CustomEvent('card-tags-changed', {
                  detail: { annotationId: options.annotationId, tags: mapped },
                  bubbles: true,
                }));
              } catch (err) {
                console.error('Failed to add tag:', err);
              }
            },
            () => renderTagChips(cardTags),
            [],
          );
        });
        tagArea.appendChild(addBtn);
      }
    };

    if (options?.annotationId) {
      tagChipRenderersRef.current.set(options.annotationId, renderTagChips);
      renderTagChips(cardTags);
    }

    card.appendChild(tagArea);

    // ── AI card ───────────────────────────────────────────
    if (kind === 'ai-card') {
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
        globalThis.dispatchEvent(new CustomEvent('ai-open-message', { detail: { messageId: options.messageId } }));
      });

      actions.appendChild(openBtn);
      actions.appendChild(expandBtn);

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

      card.appendChild(body);
      card.appendChild(actions);

      if (options?.messageId) {
        card.dataset.messageId = options.messageId;
        if (options.annotationId) card.dataset.annotationId = options.annotationId;
        card.title = 'Drag to reposition';

        let dragging = false;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;
        let lastLeft = 0;
        let lastTop = 0;
        let didDrag = false;
        const pendingDragRafRef = { current: 0 };

        const onPointerMove = (evt: PointerEvent) => {
          if (!dragging) return;
          const dx = evt.clientX - startClientX;
          const dy = evt.clientY - startClientY;
          if (Math.abs(dx) + Math.abs(dy) > 3) didDrag = true;
          if (!hasActivatedDrag && didDrag) {
            hasActivatedDrag = true;
            card.classList.add('is-dragging');
          }
          if (!hasActivatedDrag) return;
          const containerRect = containerEl.getBoundingClientRect();
          const maxLeft = Math.max(containerRect.width - card.offsetWidth - 8, 8);
          const maxTop = Math.max(containerRect.height - card.offsetHeight - 8, 8);
          lastLeft = Math.min(Math.max(startLeft + dx, 8), maxLeft);
          lastTop = Math.min(Math.max(startTop + dy, 8), maxTop);
          // Batch DOM writes via RAF to avoid layout thrashing at 60fps
          pendingDragRafRef.current = requestAnimationFrame(() => {
            card.style.left = `${lastLeft}px`;
            card.style.top = `${lastTop}px`;
          });
        };

        const stopDrag = () => {
          dragging = false;
          card.classList.remove('is-dragging');
          globalThis.removeEventListener('pointermove', onPointerMove);
          globalThis.removeEventListener('pointerup', onPointerUp);
          if (pendingDragRafRef.current) cancelAnimationFrame(pendingDragRafRef.current);
        };

        const onPointerUp = async () => {
          if (!dragging) return;
          stopDrag();
          const nextX = Math.max(lastLeft, 0);
          const nextY = Math.max(lastTop, 0);
          try {
            if (options.annotationId) await annotationCommands.updatePosition(options.annotationId, nextX, nextY);
          } catch {
            card.style.left = `${startLeft}px`;
            card.style.top = `${startTop}px`;
          }
          if (didDrag) {
            card.dataset.dragged = '1';
            globalThis.setTimeout(() => { if (card.dataset.dragged === '1') delete card.dataset.dragged; }, 120);
          }
        };

        let hasActivatedDrag = false;

        const pointerDownHandler = (evt: PointerEvent) => {
          if (evt.button !== 0) return;
          if ((evt.target as HTMLElement)?.closest('.pdf-ai-card-action')) return;
          dragging = true;
          hasActivatedDrag = false;
          startClientX = evt.clientX;
          startClientY = evt.clientY;
          startLeft = card.offsetLeft;
          startTop = card.offsetTop;
          lastLeft = startLeft;
          lastTop = startTop;
          didDrag = false;
          globalThis.addEventListener('pointermove', onPointerMove);
          globalThis.addEventListener('pointerup', onPointerUp);
        };

        (card as HTMLElement & { _dragCleanup?: () => void; _connectorRafIds?: number[] })._dragCleanup = () => {
          stopDrag();
          card.removeEventListener('pointerdown', pointerDownHandler);
          // Cancel any pending RAFs for the connector line.
          const rafIds = (card as HTMLElement & { _connectorRafIds?: number[] })._connectorRafIds;
          if (rafIds) rafIds.forEach((id) => cancelAnimationFrame(id));
          // Clear any pending auto-save timer.
          const saveTimer = (card as HTMLElement & { _noteSaveTimer?: ReturnType<typeof setTimeout> | null })._noteSaveTimer;
          if (saveTimer) clearTimeout(saveTimer);
        };

        card.addEventListener('pointerdown', pointerDownHandler);
      }
    }

    // ── Note card ────────────────────────────────────────
    else {
      const displayEl = document.createElement('div');
      displayEl.className = 'note-card-display';
      displayEl.innerHTML = simpleMarkdownToHtml(content);

      const statusEl = document.createElement('div');
      statusEl.className = 'note-card-status';
      statusEl.style.cssText = `font-size:10px;opacity:0.5;margin:2px 10px 6px;color:${mergedColors.statusText};`;

      card.appendChild(displayEl);
      card.appendChild(statusEl);

      // Draw dashed connector line if this note is anchored to selected text
      // Defer until after renderHighlight has added the element to DOM
      if (options?.selectedText) {
        const annotationId = options.annotationId;
        const setupConnector = () => {
          const hlEl = pageEl.querySelector<HTMLElement>(`.pdf-highlight[data-annotation-id="${annotationId}"]`);
          if (!hlEl) return;
          const connectorId = `connector-${annotationId}`;
          let existingConnector = containerEl.querySelector<SVGElement>(`#${connectorId}`);
          if (!existingConnector) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = connectorId;
            svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2;';
            containerEl.appendChild(svg);
            existingConnector = svg;
          }
          const updateConnector = () => {
            const hlRect = hlEl.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const containerRect = containerEl.getBoundingClientRect();
            const x1 = hlRect.left - containerRect.left + hlRect.width / 2;
            const y1 = hlRect.top - containerRect.top + hlRect.height;
            const x2 = cardRect.left - containerRect.left;
            const y2 = cardRect.top - containerRect.top;
            existingConnector!.innerHTML = `
              <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                stroke="${mergedColors.connectorStroke}" stroke-width="1.5" stroke-dasharray="4 3" stroke-opacity="0.5" />
              <circle cx="${x1}" cy="${y1}" r="3" fill="${mergedColors.connectorStroke}" fill-opacity="0.5" />`;
          };
          updateConnector();
          const cardExt = card as HTMLElement & { _updateConnector?: () => void; _connectorId?: string; _connectorRafIds?: number[] };
          cardExt._updateConnector = updateConnector;
          cardExt._connectorId = connectorId;
          const rafId2 = requestAnimationFrame(setupConnector);
          cardExt._connectorRafIds = [rafId2];
        };
        requestAnimationFrame(setupConnector);
      }

      if (options?.annotationId) card.dataset.noteAnnotationId = options.annotationId;
      if (options?.selectedText) card.dataset.noteSelectedText = options.selectedText;
      card.dataset.notePageNumber = String(pageNumber);
      card.title = 'Double-click to edit. Drag to reposition.';

      let currentContent = content;
      let editing = false;

      // Extended card object to store timer refs that survive DOM removal.
      const cardExt = card as HTMLElement & {
        _updateConnector?: () => void;
        _connectorId?: string;
        _connectorRafIds?: number[];
        _noteSaveTimer?: ReturnType<typeof setTimeout> | null;
      };

      const doSave = async (text: string) => {
        const annotationId = card.dataset.noteAnnotationId;
        if (!annotationId) return;
        const selectedPart = card.dataset.noteSelectedText || '';
        const fullText = `${NOTE_PREFIX}${text}${selectedPart ? `\n\n${selectedPart}` : ''}`;
        try {
          await annotationCommands.updateText(annotationId, fullText);
        } catch (err) {
          // Show error to user via toast
          const msg = err instanceof Error ? err.message : 'Failed to save note';
          globalThis.document?.dispatchEvent(new CustomEvent('note-card-save-error', {
            detail: { message: msg },
            bubbles: true,
          }));
        }
      };

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
          if (cardExt._noteSaveTimer) { clearTimeout(cardExt._noteSaveTimer); cardExt._noteSaveTimer = null; }
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
          if (cardExt._noteSaveTimer) clearTimeout(cardExt._noteSaveTimer);
          if (val !== currentContent) {
            statusEl.textContent = 'saving...';
            cardExt._noteSaveTimer = setTimeout(async () => {
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
            if (cardExt._noteSaveTimer) { clearTimeout(cardExt._noteSaveTimer); cardExt._noteSaveTimer = null; }
            textarea.remove();
            displayEl.style.display = '';
            statusEl.textContent = '';
          }
          if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
            void saveAndExit();
          }
        });
      };

      card.addEventListener('dblclick', (evt) => {
        evt.stopPropagation();
        enterEdit();
      });

      // Whole-card drag — activates after real movement
      const pendingNoteDragRafRef = { current: 0 };
      const dragHandlers = { onMove: (_ev: PointerEvent) => {}, onUp: () => {} };
      card.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement)?.closest('.canvas-card-delete-btn, textarea, input')) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseFloat(card.style.left || '0');
        const origTop = parseFloat(card.style.top || '0');
        let moved = false;

        dragHandlers.onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            moved = true;
            card.classList.add('is-dragging');
          }
          if (!moved) return;
          if (pendingNoteDragRafRef.current) cancelAnimationFrame(pendingNoteDragRafRef.current);
          pendingNoteDragRafRef.current = requestAnimationFrame(() => {
            card.style.left = `${Math.max(origLeft + dx, 0)}px`;
            card.style.top = `${Math.max(origTop + dy, 0)}px`;
            // Batch the connector rect reads with the same RAF — reading 3 rects
            // outside RAF on every pointermove caused layout thrashing at 60fps
            (card as HTMLElement & { _updateConnector?: () => void })._updateConnector?.();
          });
        };

        const cleanup = () => {
          card.classList.remove('is-dragging');
          globalThis.document?.removeEventListener('pointermove', dragHandlers.onMove);
          globalThis.document?.removeEventListener('pointerup', dragHandlers.onUp);
          if (pendingNoteDragRafRef.current) cancelAnimationFrame(pendingNoteDragRafRef.current);
        };

        dragHandlers.onUp = async () => {
          cleanup();
          if (options?.annotationId) {
            await annotationCommands.updatePosition(
              options.annotationId,
              parseFloat(card.style.left || '0'),
              parseFloat(card.style.top || '0'),
            );
          }
        };

        globalThis.document?.addEventListener('pointermove', dragHandlers.onMove);
        globalThis.document?.addEventListener('pointerup', dragHandlers.onUp);
      });

      (card as HTMLElement & { _dragCleanup?: () => void })._dragCleanup = () => {
        card.classList.remove('is-dragging');
        globalThis.document?.removeEventListener('pointermove', dragHandlers.onMove);
        globalThis.document?.removeEventListener('pointerup', dragHandlers.onUp);
        // Clean up connector SVG line if present
        const connId = (card as HTMLElement & { _connectorId?: string })._connectorId;
        if (connId) {
          const connEl = containerEl.querySelector<SVGElement>(`#${connId}`);
          if (connEl) connEl.remove();
        }
      };
    }

    containerEl.appendChild(card);
  };


  const loadStoredHighlights = async (documentId: string) => {
    clearHighlights();
    const annotations = await annotationCommands.getByDocument(documentId);

    // Pre-load tags for all annotations that need them (single batch query, not N per-annotation queries)
    const annotationIds = annotations
      .filter((a) => {
        const text = typeof a.text === 'string' ? a.text : '';
        return text.startsWith(NOTE_PREFIX) || text.startsWith(AI_CARD_PREFIX);
      })
      .map((a) => a.id);

    if (annotationIds.length > 0) {
      try {
        const tagMap = await tagCommands.getAnnotationTagsBatch(annotationIds);
        for (const [id, tags] of Object.entries(tagMap)) {
          tagCacheRef.current.set(id, tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
        }
      } catch { /* silent — individual cards render without tags */ }
    }

    annotations
      .filter((a) => a.type === 'highlight')
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

  // Debounce timer for zoom changes
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track last zoom level that triggered a full re-render (for change detection)
  const lastRerenderZoomRef = useRef<number>(1);

  // Handle zoom changes — when zoom changes significantly, trigger a full re-render
  // for crisp PDF display at the new zoom level.
  // Uses refs to avoid stale closure issues in the debounced async callback.
  useEffect(() => {
    latestZoomRef.current = zoomLevel;
    latestPdfDocRef.current = pdfDocument;

    if (!pdfDocument || !containerId) return;

    // Clear any pending debounce
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current);
    }

    // Skip tiny changes (< 5%) to avoid excessive re-rendering
    const zoomChange = Math.abs(zoomLevel - lastRerenderZoomRef.current) / lastRerenderZoomRef.current;
    if (zoomChange < 0.05 && lastRerenderZoomRef.current !== 1) {
      return;
    }

    // Capture values in refs at debounce time (avoid stale closure in async)
    const debouncedZoomLevel = zoomLevel;
    zoomDebounceZoomRef.current = debouncedZoomLevel;

    // Debounce zoom re-renders to coalesce rapid zooming
    zoomDebounceRef.current = setTimeout(() => {
      // Use refs to get current values (not closure values)
      const currentPdfDoc = latestPdfDocRef.current;
      const currentZoom = zoomDebounceZoomRef.current;
      const currentScrollContainerId = scrollContainerId;

      const containerEl = globalThis.document?.getElementById(containerId);
      const scrollEl = currentScrollContainerId
        ? globalThis.document?.getElementById(currentScrollContainerId)
        : null;
      if (!containerEl || !scrollEl || !currentPdfDoc) return;

      // Save scroll position as ratio (before clearing)
      const scrollRatio = scrollEl.scrollTop / Math.max(scrollEl.scrollHeight - scrollEl.clientHeight, 1);

      // Clear container to force re-render at new zoom level
      containerEl.textContent = '';

      // Advance job ID to cancel any in-flight render
      renderJobIdRef.current += 1;
      const jobId = renderJobIdRef.current;

      (async () => {
        if (!currentPdfDoc?.fileBlob) return;
        if (jobId !== renderJobIdRef.current) return;

        setIsRendering(true);
        setRenderError(null);

        try {
          const file = currentPdfDoc.fileBlob instanceof File
            ? currentPdfDoc.fileBlob
            : new File([currentPdfDoc.fileBlob], currentPdfDoc.fileName, { type: 'application/pdf' });

          // Cancel previous lazy cleanup
          lazyCleanupRef.current?.();
          lazyCleanupRef.current = null;

          const result = await renderPagesToContainer(file, containerEl, {
            scale: 1.25,
            zoomLevel: currentZoom,
            shouldCancel: () => jobId !== renderJobIdRef.current,
            scrollContainerId: currentScrollContainerId,
            onBatchRendered: () => {
              if (batchRenderTimerRef.current) clearTimeout(batchRenderTimerRef.current);
              batchRenderTimerRef.current = setTimeout(() => {
                void loadStoredHighlights(currentPdfDoc.id);
              }, 100);
            },
          });

          if (jobId !== renderJobIdRef.current) return;

          setTotalPages(result.totalPages);
          setOutline(result.outline);
          lazyCleanupRef.current = result.cleanup ?? null;

          await loadStoredHighlights(currentPdfDoc.id);

          // Restore scroll position after render completes
          requestAnimationFrame(() => {
            if (scrollEl && jobId === renderJobIdRef.current) {
              const newScrollTop = scrollRatio * (scrollEl.scrollHeight - scrollEl.clientHeight);
              scrollEl.scrollTop = Math.max(0, newScrollTop);
            }
          });

          lastRerenderZoomRef.current = currentZoom;
          // Notify App about zoom application: automatic (fit-to-width) or manual (user action)
          const isAutomatic = Math.abs(currentZoom - fitToWidthZoomRef.current) < 0.001;
          onZoomApplied?.(isAutomatic);
        } catch (err) {
          if (jobId !== renderJobIdRef.current) return;
          console.error('[zoom-rerender] Error:', err);
          const message = err instanceof Error ? err.message : 'Failed to render PDF';
          setRenderError(message);
        } finally {
          if (jobId === renderJobIdRef.current) {
            setIsRendering(false);
          }
        }
      })();
    }, 300);

    return () => {
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
        zoomDebounceRef.current = null;
      }
    };
  }, [containerId, scrollContainerId, pdfDocument, zoomLevel]);

  // Render pages when document changes.
  useEffect(() => {
    if (!pdfDocument) return;
    // Reset initial zoom flag when document changes
    initialZoomSetRef.current = false;
    renderJobIdRef.current += 1;
    const jobId = renderJobIdRef.current;

    const renderDocument = async () => {
      if (!containerId || !pdfDocument) {
        setIsRendering(false);
        return;
      }
      // Cancel any previous render's lazy cleanup before starting a new one.
      lazyCleanupRef.current?.();
      lazyCleanupRef.current = null;
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
        // Read theme-aware colors so the shimmer adapts to dark/sepia/warm-dark modes.
        const root = document.documentElement;
        const cs = getComputedStyle(root);
        const skeletonBase = cs.getPropertyValue('--color-bg-hover').trim() || '#f5f5f4';
        const skeletonAccent = cs.getPropertyValue('--color-border-subtle').trim() || '#fafaf9';
        const waveColor = cs.getPropertyValue('--color-text-muted').trim() || '#78716c';
        for (let i = 0; i < 2; i++) {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'width: 612px; margin: 0 auto 16px; position: relative; padding-top: 129.4%;';
          const skeleton = document.createElement('div');
          skeleton.className = 'pdf-page-skeleton';
          skeleton.style.cssText = 'position: absolute; inset: 0;';
          const shimmer = document.createElement('div');
          shimmer.style.cssText = [
            'position: absolute; inset: 0;',
            `background: linear-gradient(135deg, ${skeletonBase} 0%, ${skeletonAccent} 100%);`,
          ].join('');
          const wave = document.createElement('div');
          wave.style.cssText = [
            'position: absolute; inset: 0;',
            `background: linear-gradient(90deg, transparent 0%, ${waveColor}33 50%, transparent 100%);`,
            'animation: skeletonShimmer 1.8s ease-in-out infinite;',
          ].join('');
          shimmer.appendChild(wave);
          skeleton.appendChild(shimmer);
          wrapper.appendChild(skeleton);
          containerEl.appendChild(wrapper);
          skeletonEls.push(skeleton);
        }

        // Render all pages
        if (!pdfDocument.fileBlob) {
          throw new Error('当前文档未包含本地文件内容，请重新上传 PDF');
        }

        const file = pdfDocument.fileBlob instanceof File
          ? pdfDocument.fileBlob
          : new File([pdfDocument.fileBlob], pdfDocument.fileName, { type: 'application/pdf' });

        const result = await Promise.race([
          renderPagesToContainer(file, containerEl, {
            scale: 1.25,
            zoomLevel,
            shouldCancel: () => jobId !== renderJobIdRef.current,
            scrollContainerId,
            // Re-apply highlights after each lazy batch renders so newly visible
            // pages also show their highlights (including correctly hiding deleted ones).
            onBatchRendered: () => {
              // Debounce: coalesce rapid batch completions into a single reload after 100ms.
              if (batchRenderTimerRef.current) clearTimeout(batchRenderTimerRef.current);
              batchRenderTimerRef.current = setTimeout(() => {
                void loadStoredHighlights(pdfDocument.id);
              }, 100);
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('PDF rendering timeout')), 30000)
          ),
        ]);
        if (jobId !== renderJobIdRef.current) return;

        setTotalPages(result.totalPages);
        setCurrentPage(pdfDocument.lastPage ?? 1);
        setOutline(result.outline);
        lazyCleanupRef.current = result.cleanup ?? null;

        await loadStoredHighlights(pdfDocument.id);

        // Notify App about first page render for fit-to-width calculation (once per document)
        if (initialZoomSetRef.current === false) {
          // Use requestAnimationFrame to ensure page element has dimensions
          requestAnimationFrame(() => {
            const firstPageEl = containerEl.querySelector<HTMLElement>('.pdf-page[data-page-number="1"]');
            if (firstPageEl) {
              onFirstPageRendered?.(firstPageEl.offsetWidth);
            }
          });
          initialZoomSetRef.current = true;
        }
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
    // Return cleanup that cancels the lazy renderer and clears the IntersectionObserver.
    return () => {
      lazyCleanupRef.current?.();
      lazyCleanupRef.current = null;
      if (batchRenderTimerRef.current) { clearTimeout(batchRenderTimerRef.current); batchRenderTimerRef.current = null; }
    };
  }, [containerId, pdfDocument]);

  // ── Pretext-based highlight rect computation ──

  /** Compute Pretext highlight rects for a single page element. */
  const getPretextRectsForPage = (
    pageEl: HTMLElement,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): DOMRect[] | null => {
    if (!pdfDocument) return null;
    const fingerprint = `${pdfDocument.fileName}@${pdfDocument.fileSize}`;
    const pageNumber = Number(pageEl.dataset.pageNumber || '0');
    if (!pageNumber) return null;

    const layout = pretextLineCache.get(fingerprint, pageNumber);
    if (!layout || layout.lines.length === 0) return null;

    const pageRect = pageEl.getBoundingClientRect();
    // Convert viewport-relative coords to page-relative
    const prStartX = startX - pageRect.left;
    const prStartY = startY - pageRect.top;
    const prEndX = endX - pageRect.left;
    const prEndY = endY - pageRect.top;

    const colInfo = layout.columnInfo;
    const pretextRects = getPretextHighlightRects(
      layout, prStartX, prStartY, prEndX, prEndY,
      colInfo.isMultiColumn ? colInfo : undefined,
    );
    if (pretextRects.length === 0) return null;

    // Convert page-relative rects back to viewport-relative
    return pretextRects.map((r) =>
      new DOMRect(r.left + pageRect.left, r.top + pageRect.top, r.width, r.height)
    );
  };

  /** Try to compute highlight rects from Pretext line data. Supports cross-page selection. */
  const tryGetPretextRects = (range: Range): DOMRect[] | null => {
    if (!pdfDocument) return null;
    const rect = range.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    // Find start and end page elements
    const startPageEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
      ?.closest('.pdf-page') as HTMLElement | null;
    const endPageEl = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)
      ?.closest('.pdf-page') as HTMLElement | null;

    if (!startPageEl || !endPageEl) return null;

    const startPageNum = Number(startPageEl.dataset.pageNumber || '0');
    const endPageNum = Number(endPageEl.dataset.pageNumber || '0');

    // Single page: fast path
    if (startPageNum === endPageNum || startPageNum === 0 || endPageNum === 0) {
      const pageEl = startPageEl || endPageEl;
      if (!pageEl) return null;
      return getPretextRectsForPage(pageEl, rect.left, rect.top, rect.right, rect.bottom);
    }

    // Cross-page: process each page separately
    // Normalize page order (backward selection has startContainer after endContainer)
    const lo = Math.min(startPageNum, endPageNum);
    const hi = Math.max(startPageNum, endPageNum);
    const firstPageEl = lo === startPageNum ? startPageEl : endPageEl;
    const lastPageEl = hi === startPageNum ? startPageEl : endPageEl;

    const allRects: DOMRect[] = [];
    const container = document.getElementById(containerId);
    if (!container) return null;

    for (let pn = lo; pn <= hi; pn++) {
      const pageEl = container.querySelector(`.pdf-page[data-page-number="${pn}"]`) as HTMLElement | null;
      if (!pageEl) continue;

      const pageRect = pageEl.getBoundingClientRect();
      // Clip the selection bounding rect to this page's viewport bounds
      const clipStartX = pageEl === firstPageEl ? rect.left : pageRect.left;
      const clipStartY = pageEl === firstPageEl ? rect.top : pageRect.top;
      const clipEndX = pageEl === lastPageEl ? rect.right : pageRect.right;
      const clipEndY = pageEl === lastPageEl ? rect.bottom : pageRect.bottom;

      const pageRects = getPretextRectsForPage(pageEl, clipStartX, clipStartY, clipEndX, clipEndY);
      if (pageRects) allRects.push(...pageRects);
    }

    return allRects.length > 0 ? allRects : null;
  };

  /** Fallback: compute merged highlight rects from range.getClientRects(). */
  const getMergedClientRects = (range: Range): DOMRect[] => {
    const rawRects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 1 && rect.height > 1
    );
    if (rawRects.length === 0) return [];

    // Merge adjacent rects per line (±2px tolerance)
    const LINE_TOLERANCE = 2;
    const lineBuckets: DOMRect[][] = [];
    for (const rect of rawRects) {
      const y = rect.top;
      let placed = false;
      for (const bucket of lineBuckets) {
        if (Math.abs(bucket[0].top - y) <= LINE_TOLERANCE) {
          bucket.push(rect);
          placed = true;
          break;
        }
      }
      if (!placed) lineBuckets.push([rect]);
    }

    const mergedRects: DOMRect[] = [];
    for (const bucket of lineBuckets) {
      bucket.sort((a, b) => a.left - b.left);
      let cur = bucket[0];
      for (let i = 1; i < bucket.length; i++) {
        const r = bucket[i];
        if (r.left - cur.right <= 3) {
          cur = new DOMRect(
            Math.min(cur.left, r.left),
            Math.min(cur.top, r.top),
            Math.max(cur.right, r.right) - Math.min(cur.left, r.left),
            Math.max(cur.bottom, r.bottom) - Math.min(cur.top, r.top),
          );
        } else {
          mergedRects.push(cur);
          cur = r;
        }
      }
      mergedRects.push(cur);
    }
    return mergedRects;
  };

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

    // ── Try Pretext-based highlight rects (precise, column-aware) ──
    const pretextRects = tryGetPretextRects(range);
    const mergedRects: DOMRect[] = pretextRects ?? getMergedClientRects(range);

    if (mergedRects.length === 0) {
      throw new Error('未找到可高亮的文本区域');
    }

    // Collect rect data first (sync), then create all annotations in parallel
    const pendingAnnotations: Array<{
      pageNumber: number; x: number; y: number; width: number; height: number;
    }> = [];

    for (const rect of mergedRects) {
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
      pendingAnnotations.push({ pageNumber, x, y, width, height });
    }

    if (pendingAnnotations.length === 0) {
      throw new Error('未找到可高亮的文本区域');
    }

    // Create all annotations in parallel (no await per-item)
    const created = await Promise.all(
      pendingAnnotations.map(({ pageNumber, x, y, width, height }) =>
        annotationCommands.create({
          document_id: pdfDocument.id,
          page_number: pageNumber,
          annotation_type: 'highlight',
          color,
          position_x: x,
          position_y: y,
          position_width: width,
          position_height: height,
          text,
        })
      )
    );

    // Render all highlights (sync DOM ops)
    for (let i = 0; i < pendingAnnotations.length; i++) {
      const { pageNumber, x, y, width, height } = pendingAnnotations[i];
      renderHighlight(pageNumber, x, y, width, height, color, created[i]?.id);
    }

    selection.removeAllRanges();
    return pendingAnnotations.length;
  };

  const addNoteForSelection = async (
    content: string,
    position: { x: number; y: number } | undefined,
    targetPageNumber: number | undefined,
    /** Text captured from DOM selection before toolbar cleared it */
    capturedSelectedText?: string,
    capturedRange?: { left: number; top: number; width: number; height: number; pageNumber: number }
  ) => {
    if (!pdfDocument) throw new Error('请先上传或选择文档');
    const note = content.trim();
    if (!note) throw new Error('笔记内容不能为空');

    const selection = globalThis.getSelection?.();
    const domHasSelection = selection && selection.rangeCount > 0 && !selection.isCollapsed;

    let pageNumber: number;
    let x: number;
    let y: number;
    let width: number;
    let height: number;
    let selectedText = '';
    const hasSelection = domHasSelection || !!capturedSelectedText;

    if (hasSelection) {
      // Anchored note: attached to selected text
      // Try DOM selection first, fall back to captured range
      let rangeRect: DOMRect | undefined;
      let targetPageEl: HTMLElement | null = null;

      if (domHasSelection) {
        const range = selection!.getRangeAt(0);
        rangeRect = Array.from(range.getClientRects()).find((r) => r.width > 1 && r.height > 1);
        if (rangeRect) {
          targetPageEl = globalThis.document
            ?.elementFromPoint(rangeRect.left + 1, rangeRect.top + 1)
            ?.closest('.pdf-page') as HTMLElement | null;
        }
      }

      // Fall back to captured range from before selection was cleared
      if (!rangeRect && capturedRange) {
        rangeRect = {
          left: capturedRange.left,
          top: capturedRange.top,
          width: capturedRange.width,
          height: capturedRange.height,
        } as DOMRect;
        const containerEl = globalThis.document?.getElementById(containerId);
        targetPageEl = containerEl?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${capturedRange.pageNumber}"]`) ?? null;
      }

      if (!rangeRect) throw new Error('未找到可锚定区域');
      if (!targetPageEl) throw new Error('未找到页面锚点');

      pageNumber = Number(targetPageEl.dataset.pageNumber || '0');
      if (!pageNumber) throw new Error('未找到页面编号');

      const pageRect = targetPageEl.getBoundingClientRect();
      x = Math.max(rangeRect.left - pageRect.left, 0);
      y = Math.max(rangeRect.top - pageRect.top, 0);
      width = Math.min(rangeRect.width, pageRect.width - x);
      height = Math.min(rangeRect.height, pageRect.height - y);
      selectedText = capturedSelectedText ?? selection!.toString().trim();
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
      renderHighlight(pageNumber, x, y, width, height, 'rgba(14, 165, 233, 0.25)', createdNote?.id);
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
      color: kind === 'ai-card' ? 'rgba(168, 85, 247, 0.40)' : 'rgba(14, 165, 233, 0.20)',
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
      (a) => typeof a.text === 'string' && a.text.startsWith(prefix)
    );
    if (!aiAnnotation?.id) throw new Error('未找到对应的 AI 卡片');
    await annotationCommands.delete(aiAnnotation.id);
    tagChipRenderersRef.current.delete(aiAnnotation.id);
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

  // Double-click on highlight → open L3 note editor (via callback)
  useEffect(() => {
    if (!onHighlightDoubleClick) return;
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!containerEl) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const highlightEl = target.closest('.pdf-highlight') as HTMLElement | null;
      if (!highlightEl) return;
      const annotationId = highlightEl.dataset.annotationId;
      const pageEl = highlightEl.closest('.pdf-page') as HTMLElement | null;
      const pageNumber = pageEl ? Number(pageEl.dataset.pageNumber || '1') : 1;
      if (annotationId) {
        onHighlightDoubleClick(annotationId, pageNumber);
      }
    };

    containerEl.addEventListener('dblclick', handler);
    return () => containerEl.removeEventListener('dblclick', handler);
  }, [containerId, onHighlightDoubleClick]);

  const jumpToPage = (pageNumber: number) => {
    // Update UI state immediately so sidebar red-dot moves without waiting for scroll.
    setCurrentPage(pageNumber);

    const scroller = globalThis.document?.getElementById(scrollContainerId);
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(scroller instanceof HTMLElement) || !(containerEl instanceof HTMLElement)) return;

    // First try rendered page element.
    let target = containerEl.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);
    // Fall back to skeleton placeholder (lazy rendering — page not yet rendered).
    if (!target) {
      target = containerEl.querySelector<HTMLElement>(`.pdf-page-skeleton[data-page-number="${pageNumber}"]`);
    }
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

  // Remove a tag chip renderer entry from the Map (prevents memory leak on delete).
  const clearCardRenderer = (annotationId: string) => {
    tagChipRenderersRef.current.delete(annotationId);
  };

  // Remove a capture (highlight, note card, or AI card) from the DOM by annotationId.
  // Used by the CaptureDrawer to sync deletion with the canvas.
  const removeCapture = (annotationId: string) => {
    const containerEl = globalThis.document?.getElementById(containerId);
    if (!(containerEl instanceof HTMLElement)) return;

    // Remove the highlight element if present
    const highlightEl = containerEl.querySelector<HTMLElement>(`.pdf-highlight[data-annotation-id="${annotationId}"]`);
    if (highlightEl) highlightEl.remove();

    // Remove the note/AI card if present and call its cleanup
    const noteCardEl = containerEl.querySelector<HTMLElement>(`.pdf-note-card[data-annotation-id="${annotationId}"]`);
    if (noteCardEl) {
      const cleanup = (noteCardEl as HTMLElement & { _dragCleanup?: () => void })._dragCleanup;
      if (cleanup) cleanup();
      noteCardEl.remove();
    }

    // Remove the AI card if present
    const aiCardEl = containerEl.querySelector<HTMLElement>(`.pdf-ai-card[data-annotation-id="${annotationId}"]`);
    if (aiCardEl) aiCardEl.remove();

    clearCardRenderer(annotationId);
  };

  /** Update the stored fit-to-width zoom value (called by App when it calculates fit-to-width). */
  const setFitToWidthZoom = useCallback((zoom: number) => {
    fitToWidthZoomRef.current = zoom;
  }, []);

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
    clearCardRenderer,
    removeCapture,
    setFitToWidthZoom,
  };
}
