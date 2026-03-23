import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { AIPanel } from '@/components/layout/AIPanel';
import { TopBar, AppTab } from '@/components/layout/TopBar';
import { LibraryView } from '@/components/features/LibraryView';
import { SettingsModal } from '@/components/features/SettingsModal';
import { Toast } from '@/components/ui/Toast';
import { usePDF } from '@/hooks/usePDF';
import { usePDFThumbnails } from '@/hooks/usePDFThumbnails';
import { useAI } from '@/hooks/useAI';
import { useSettings } from '@/hooks/useSettings';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasRendering } from '@/hooks/useCanvasRendering';
import { AIConfig } from '@/types/settings';
import { aiCommands, annotationCommands, tagCommands } from '@/lib/tauri';
import { PDFDocument } from '@/types/document';
import { extractTextFromPageRanges, findChapterForPage, buildChapterList, ChapterInfo } from '@/lib/pdf/parser';
import { ChapterSelector } from '@/components/features/ChapterSelector';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const AI_CARD_PREFIX = '__AICARD__|';
  const {
    currentDocument,
    documents,
    openPDFFile,
    restoreLastDocument,
    selectDocument,
    deleteDocument,
    relinkDocument,
    loadDocuments,
    loadLibraries,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    updateDocumentLibrary,
    error: pdfError,
    isLoading: pdfLoading,
  } = usePDF();
  const {
    aiConfig,
    activeProfile,
    profiles,
    uiSettings,
    updateUiSettings,
    loadSettings,
    saveActiveProfile,
    createNewProfile,
    switchProfile,
    deleteProfile,
    renameProfile,
  } = useSettings();

  // ─── Tab management ────────────────────────────────────────────
  const [tabs, setTabs] = useState<AppTab[]>([{ id: 'library', label: 'Library', type: 'library' }]);
  const [activeTabId, setActiveTabId] = useState('library');

  // ─── Library management state ────────────────────────────────
  const [libraries, setLibraries] = useState<any[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<PDFDocument[]>([]);
  const recentDocIdsRef = useRef<Set<string>>(new Set());

  const openDocTab = useCallback((doc: PDFDocument) => {
    const tabId = `doc-${doc.id}`;
    setTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: doc.fileName, type: 'document', documentId: doc.id }];
    });
    setActiveTabId(tabId);
    // Track recents
    recentDocIdsRef.current.delete(doc.id);
    const newSet = new Set([doc.id, ...recentDocIdsRef.current]);
    recentDocIdsRef.current = newSet;
    // Keep only the 8 most recent
    setRecentDocuments(
      documents.filter((d) => newSet.has(d.id)).slice(0, 8)
    );
  }, [documents]);

  const handleCloseTab = useCallback((tabId: string) => {
    if (tabId === 'library') return;
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('library');
    }
  }, [activeTabId]);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    if (tabId !== 'library' && tabId.startsWith('doc-')) {
      const docId = tabId.replace('doc-', '');
      void selectDocument(docId);
    }
  }, [selectDocument]);

  // ─── UI state ─────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesAnnotations, setNotesAnnotations] = useState<any[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [noteInputOpen, setNoteInputOpen] = useState(false);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const noteInputPositionRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const noteInputPageRef = useRef<number | undefined>(undefined);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Array<{ id: string; type: 'text' | 'note'; content: string; page?: number }>>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [splitActive, setSplitActive] = useState(false);
  const [comparePageSignal, setComparePageSignal] = useState<number | null>(null);
  const [comparePaneCommand, setComparePaneCommand] = useState<{
    page: number;
    openSplit?: boolean;
    reason?: 'evidence' | 'reference' | 'compare';
    nonce: number;
  } | null>(null);
  const [chapterSelectorOpen, setChapterSelectorOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // ─── Canvas rendering ────────────────────────────────────────
  const {
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
  } = useCanvasRendering(
    activeTabId === 'library' ? '' : 'pdf-scroll-container',
    activeTabId === 'library' ? '' : 'pdf-pages-container',
    currentDocument,
    zoomLevel,
    (messageId: string) => setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId))
  );

  const { thumbnails, isLoading: thumbnailsLoading } = usePDFThumbnails(
    currentDocument?.fileBlob ?? null,
    totalPages
  );

  const aiContext = useMemo(() => ({
    currentPage,
    documentTitle: currentDocument?.fileName || '',
  }), [currentPage, currentDocument?.fileName]);

  // Build chapter list from outline for the ChapterSelector
  const chapterList = useMemo(() => {
    if (!outline || outline.length === 0 || !totalPages) return [] as ChapterInfo[];
    return buildChapterList(outline, totalPages);
  }, [outline, totalPages]);

  // Find the current chapter based on scroll position
  const currentChapter = useMemo(() => {
    if (!currentPage || chapterList.length === 0) return null;
    return findChapterForPage(currentPage, outline) || null;
  }, [currentPage, chapterList, outline]);

  const getAIContext = useMemo(() => {
    return () => ({
      ...aiContext,
      selectedText: globalThis.getSelection?.()?.toString().trim() || '',
    });
  }, [aiContext]);

  const {
    messages,
    isLoading: aiLoading,
    error: aiError,
    pendingRouteConfirmation,
    routePreferenceStats,
    sendMessage,
    explainTerm,
    retryAssistantMessage,
    confirmPendingRoute,
    dismissPendingRoute,
    clearRoutePreferenceMemory,
    stopGeneration,
    loadHistory,
  } = useAI(
    currentDocument?.id || '',
    aiConfig,
    getAIContext,
    { rememberRoutePreferenceAcrossSessions: uiSettings.rememberRoutePreferenceAcrossSessions }
  );

  // ─── Load data on mount ───────────────────────────────────────
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  useEffect(() => {
    void (async () => {
      const libs = await loadLibraries();
      setLibraries(libs);
    })();
  }, [loadLibraries]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void (async () => {
      try {
        const tags = await tagCommands.getAll();
        setAllTags(tags.map((t: any) => t.name));
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    void restoreLastDocument();
  }, [restoreLastDocument]);

  useEffect(() => {
    if (currentDocument) {
      void loadHistory();
    }
  }, [currentDocument, loadHistory]);

  // ─── Load notes for Notes Manager ───────────────────────────
  useEffect(() => {
    const loadNotes = async () => {
      if (!currentDocument?.id) {
        setNotesAnnotations([]);
        return;
      }
      try {
        const annotations = await annotationCommands.getByDocument(currentDocument.id);
        setNotesAnnotations(annotations);
      } catch (err) {
        console.error('Failed to load annotations:', err);
        setNotesAnnotations([]);
      }
    };
    void loadNotes();
  }, [currentDocument?.id]);

  // ─── Load pinned AI cards ────────────────────────────────────
  useEffect(() => {
    const refresh = async () => {
      if (!currentDocument?.id) {
        setPinnedMessageIds([]);
        return;
      }
      try {
        const annotations = await annotationCommands.getByDocument(currentDocument.id);
        const ids = annotations
          .map((a: any) => (typeof a.text === 'string' ? a.text : ''))
          .filter((text: string) => text.startsWith(AI_CARD_PREFIX))
          .map((text: string) => {
            const raw = text.slice(AI_CARD_PREFIX.length);
            const messageId = raw.split('\n\n')[0]?.trim();
            return messageId || '';
          })
          .filter((id: string) => !!id);
        setPinnedMessageIds(Array.from(new Set(ids)));
      } catch {
        setPinnedMessageIds([]);
      }
    };
    void refresh();
  }, [currentDocument?.id, AI_CARD_PREFIX]);

  // ─── Toast on errors ─────────────────────────────────────────
  useEffect(() => {
    if (renderError) setToast({ message: renderError, type: 'error' });
  }, [renderError]);

  useEffect(() => {
    const handler = () => setToast({ message: 'AI card removed from canvas', type: 'success' });
    globalThis.addEventListener('ai-card-unpinned', handler);
    return () => globalThis.removeEventListener('ai-card-unpinned', handler);
  }, []);

  // Listen for note card delete from canvas
  useEffect(() => {
    const handler = (e: Event) => {
      const { annotationId } = (e as CustomEvent<{ annotationId: string }>).detail;
      void handleDeleteNote(annotationId);
    };
    globalThis.document?.addEventListener('note-card-delete-app', handler);
    return () => globalThis.document?.removeEventListener('note-card-delete-app', handler);
  }, []);

  // Listen for text/note attachments from canvas
  useEffect(() => {
    const onText = (e: Event) => {
      const { content, page } = (e as CustomEvent<{ content: string; page?: number }>).detail;
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type: 'text', content, page },
      ]);
    };
    const onNote = (e: Event) => {
      const { content, page } = (e as CustomEvent<{ content: string; page?: number }>).detail;
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type: 'note', content, page },
      ]);
    };
    globalThis.document?.addEventListener('text-attachment-drop', onText);
    globalThis.document?.addEventListener('note-attachment-drop', onNote);
    return () => {
      globalThis.document?.removeEventListener('text-attachment-drop', onText);
      globalThis.document?.removeEventListener('note-attachment-drop', onNote);
    };
  }, []);

  useEffect(() => {
    if (pdfError) setToast({ message: pdfError, type: 'error' });
  }, [pdfError]);

  useEffect(() => {
    if (aiError) setToast({ message: aiError, type: 'error' });
  }, [aiError]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleUpload = async () => {
    try {
      setToast({ message: 'Opening PDF file…', type: 'info' });
      await openPDFFile();
      setToast({ message: 'PDF loaded successfully!', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load PDF';
      setToast({ message, type: 'error' });
    }
  };

  const handleSaveSettings = async (nextConfig: AIConfig, profileName?: string) => {
    await saveActiveProfile(nextConfig, profileName);
    setToast({ message: 'AI settings saved', type: 'success' });
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  const handleZoomByFactor = (factor: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev * factor, 0.3), 3));
  };
  const handleResetZoom = () => setZoomLevel(1);

  // Escape closes TOC, context menus, etc. handled by individual components;
  // this catches any remaining open state at the app level.
  const handleEscape = () => {
    // Handled by individual components via their own keydown/close handlers.
  };

  const handleHighlightSelection = async () => {
    try {
      const count = await highlightSelection();
      setToast({ message: `Added ${count} highlight${count > 1 ? 's' : ''}`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to highlight selection';
      setToast({ message, type: 'info' });
    }
  };

  const handleAddNoteSelection = (position?: { x: number; y: number }, targetPageNumber?: number) => {
    setNoteInputOpen(true);
    noteInputPositionRef.current = position;
    noteInputPageRef.current = targetPageNumber;
  };

  useKeyboardShortcuts({
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetZoom: handleResetZoom,
    onJumpToPage: jumpToPage,
    onCloseTab: handleCloseTab,
    onEscape: handleEscape,
    onHighlight: handleHighlightSelection,
    onNewNote: () => handleAddNoteSelection(),
    activeTabId,
    currentPage,
    totalPages,
  });

  const handleNoteInputSubmit = async (note: string) => {
    setNoteInputOpen(false);
    if (!note.trim()) return;
    try {
      const created = await addNoteForSelection(note, noteInputPositionRef.current, noteInputPageRef.current);
      noteInputPositionRef.current = undefined;
      noteInputPageRef.current = undefined;
      if (created) {
        setNotesAnnotations((prev) => [created, ...prev]);
      }
      setToast({ message: 'Note added', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add note';
      setToast({ message, type: 'info' });
    }
  };
  const handleSummarize = () => {
    if (!currentDocument) {
      setToast({ message: 'No document loaded', type: 'info' });
      return;
    }
    if (!currentDocument.fileBlob) {
      setToast({ message: 'Document file not available', type: 'error' });
      return;
    }
    setChapterSelectorOpen(true);
  };

  const handleSummarizeChapters = async (selectedChapters: ChapterInfo[]) => {
    setChapterSelectorOpen(false);
    if (!currentDocument?.fileBlob || selectedChapters.length === 0) {
      return;
    }

    setToast({ message: 'Extracting chapter text…', type: 'info' });
    try {
      const pageRanges = selectedChapters.map((c) => ({
        startPage: c.startPage,
        endPage: c.endPage,
      }));
      const text = await extractTextFromPageRanges(currentDocument.fileBlob, pageRanges);
      if (!text || text.length < 50) {
        setToast({ message: 'Could not extract text from selected chapters', type: 'error' });
        return;
      }

      // Limit text per chapter (roughly 4000 chars per chapter to stay within token limits)
      const maxCharsPerChapter = 4000;
      const truncatedText = text.length > maxCharsPerChapter * selectedChapters.length
        ? text.slice(0, maxCharsPerChapter * selectedChapters.length) + '…'
        : text;

      // Build chapter-aware prompt
      const chapterTitles = selectedChapters.map((c) => c.title).join(', ');
      const pageRangeStr = selectedChapters.length === 1
        ? `pages ${selectedChapters[0].startPage}–${selectedChapters[0].endPage}`
        : `${selectedChapters.length} chapters`;

      const prompt = `You are summarizing "${chapterTitles}" (${pageRangeStr}) from the document "${currentDocument.fileName}".

Content:
${truncatedText}

Provide a summary covering:
1. Key findings and contributions
2. Methodology (if applicable)
3. Limitations
4. Practical takeaways

Use citations [ref:pN] where N is the page number. Focus only on the provided content.`;
      void sendMessage(prompt);
    } catch (err) {
      console.error('Failed to extract text for summarize:', err);
      setToast({ message: 'Failed to extract chapter text', type: 'error' });
    }
  };
  const handleTranslateSelection = () => {
    const text = globalThis.getSelection?.()?.toString().trim();
    if (!text) {
      setToast({ message: 'Select some text first', type: 'info' });
      return;
    }
    void sendMessage(`Translate the following text into Chinese, preserve technical terms in English when needed, and provide concise explanation:\n\n${text}`);
  };
  const handleExplainTerm = async () => {
    const term = globalThis.getSelection?.()?.toString().trim();
    if (!term) {
      setToast({ message: 'Select a term first', type: 'info' });
      return;
    }
    await explainTerm(term);
  };
  const handleExportNotes = async () => {
    if (!currentDocument) {
      setToast({ message: 'No document loaded', type: 'info' });
      return;
    }
    try {
      const annotations = await annotationCommands.getByDocument(currentDocument.id);
      const lines = [
        `# Notes Export - ${currentDocument.fileName}`,
        '',
        `Generated at: ${new Date().toISOString()}`,
        '',
      ];
      annotations.forEach((a: any, idx: number) => {
        const rawText = typeof a.text === 'string' ? a.text : '';
        const isNote = rawText.startsWith('__NOTE__|');
        const note = isNote ? rawText.slice('__NOTE__|'.length).split('\n\n')[0] : '';
        const selected = isNote ? rawText.slice('__NOTE__|'.length).split('\n\n').slice(1).join('\n\n') : rawText;
        lines.push(`## ${idx + 1}. Page ${a.page_number}`);
        lines.push(`- Type: ${isNote ? 'note' : a.annotation_type}`);
        lines.push(`- Position: x=${Math.round(a.position_x)}, y=${Math.round(a.position_y)}, w=${Math.round(a.position_width)}, h=${Math.round(a.position_height)}`);
        if (note) lines.push(`- Note: ${note}`);
        if (selected) lines.push(`- Text: ${selected}`);
        lines.push('');
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDocument.fileName.replace(/\.pdf$/i, '')}-notes.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ message: 'Notes exported', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export notes';
      setToast({ message, type: 'error' });
    }
  };

  const handleDeleteNote = async (annotationId: string) => {
    try {
      // Delete from DB first — only update UI on success
      await annotationCommands.delete(annotationId);
      setNotesAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      setToast({ message: 'Note deleted', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete note';
      setToast({ message, type: 'error' });
      throw error;
    }
  };

  const handleUpdateNote = async (annotationId: string, newContent: string) => {
    try {
      const annotation = notesAnnotations.find((a) => a.id === annotationId);
      if (!annotation) throw new Error('Annotation not found');
      const oldText = typeof annotation.text === 'string' ? annotation.text : '';
      const selectedText = oldText.includes('\n\n') ? oldText.split('\n\n').slice(1).join('\n\n') : '';
      const newText = `__NOTE__|${newContent}${selectedText ? '\n\n' + selectedText : ''}`;
      await annotationCommands.updateText(annotationId, newText);
      setNotesAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, text: newText } : a))
      );
      setToast({ message: 'Note updated', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update note';
      setToast({ message, type: 'error' });
      throw error;
    }
  };
  const handlePinMessageToCanvas = async (messageId: string, pageHint?: number) => {
    const target = messages.find((m) => m.id === messageId && m.role === 'assistant');
    if (!target?.content?.trim()) {
      setToast({ message: 'No message content to pin', type: 'info' });
      return;
    }
    try {
      await pinNoteToCurrentPage(target.content, {
        kind: 'ai-card',
        messageId,
        pageNumber: pageHint,
      });
      setPinnedMessageIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
      const resolvedPage = pageHint || currentPage;
      setToast({ message: `Pinned as AI card to page ${resolvedPage}`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pin message';
      setToast({ message, type: 'error' });
    }
  };
  const handleLocateCanvasCard = (messageId: string) => {
    const found = locateAiCardByMessageId(messageId);
    if (!found) {
      setToast({ message: 'No pinned AI card found for this message', type: 'info' });
    }
  };
  const handleUnpinFromCanvas = async (messageId: string) => {
    try {
      await unpinAiCardByMessageId(messageId);
      // Toast is shown via the 'ai-card-unpinned' event listener below.
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unpin';
      setToast({ message, type: 'error' });
    }
  };
  const handleJumpToCitation = (page: number) => {
    jumpToCitation(page);
    setComparePageSignal(page);
    setComparePaneCommand({
      page,
      openSplit: true,
      reason: 'evidence',
      nonce: Date.now(),
    });
  };
  const handleSendToRightPane = (messageId: string, pageHint?: number) => {
    const target = messages.find((m) => m.id === messageId && m.role === 'assistant');
    if (!target) {
      setToast({ message: 'Message not found', type: 'info' });
      return;
    }
    const fallbackPageFromContent = (() => {
      const match = target.content.match(/\[ref:p(\d+)\]|\[p(\d+)\]/i);
      const page = Number(match?.[1] || match?.[2] || '0');
      return Number.isFinite(page) && page > 0 ? page : null;
    })();
    const targetPage = pageHint || fallbackPageFromContent || currentPage || 1;
    setComparePaneCommand({
      page: targetPage,
      openSplit: true,
      reason: 'reference',
      nonce: Date.now(),
    });
    setToast({ message: `Verify source · page ${targetPage}`, type: 'success' });
  };
  const handleDropAICard = (
    payload: { messageId: string; content: string; pageHint?: number },
    clientX: number,
    clientY: number
  ) => {
    void (async () => {
      try {
        await dropAICardAtPoint(
          payload.content,
          payload.messageId,
          clientX,
          clientY,
          payload.pageHint
        );
        setPinnedMessageIds((prev) => (
          prev.includes(payload.messageId) ? prev : [...prev, payload.messageId]
        ));
        setToast({ message: 'AI card dropped to canvas', type: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to drop AI card';
        setToast({ message, type: 'error' });
      }
    })();
  };

  // ─── Library handlers ────────────────────────────────────────
  const handleCreateLibrary = async (name: string) => {
    try {
      const lib = await createLibrary(name);
      setLibraries((prev) => [...prev, lib]);
      setToast({ message: `Library "${name}" created`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create library';
      setToast({ message, type: 'error' });
    }
  };

  const handleDeleteLibrary = async (id: string) => {
    try {
      await deleteLibrary(id);
      setLibraries((prev) => prev.filter((l) => l.id !== id));
      if (selectedLibraryId === id) setSelectedLibraryId(null);
      setToast({ message: 'Library deleted', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete library';
      setToast({ message, type: 'error' });
    }
  };

  const handleRenameLibrary = async (id: string, name: string) => {
    try {
      const lib = libraries.find((l) => l.id === id);
      if (!lib) return;
      await updateLibrary(id, name, lib.color);
      setLibraries((prev) => prev.map((l) => l.id === id ? { ...l, name } : l));
      setToast({ message: `Renamed to "${name}"`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename library';
      setToast({ message, type: 'error' });
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await deleteDocument(id);
      void loadDocuments();
      if (selectedDocumentId === id) setSelectedDocumentId(null);
      setToast({ message: 'Document removed', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      setToast({ message, type: 'error' });
    }
  };

  const handleUpdateDocLibrary = async (docId: string, libraryId: string | null) => {
    try {
      await updateDocumentLibrary(docId, libraryId);
      void loadDocuments();
      setToast({ message: 'Document moved', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move document';
      setToast({ message, type: 'error' });
    }
  };

  const handleClearRecent = () => {
    recentDocIdsRef.current = new Set();
    setRecentDocuments([]);
  };

  // ─── Render ──────────────────────────────────────────────────
  const isLibraryTab = activeTabId === 'library';

  return (
    <div
      data-theme={uiSettings.theme}
      className={`flex flex-col h-screen overflow-hidden ${uiSettings.theme ? '' : 'bg-white'}`}
    >
      {/* Top bar */}
      <TopBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />

      {/* Main content area — always rendered, visibility toggled via CSS */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Library view — always in DOM, shown when library tab active */}
        <div className={`absolute inset-0 transition-opacity duration-150 ${isLibraryTab ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <LibraryView
            documents={documents}
            libraries={libraries}
            allTags={allTags}
            recentDocuments={recentDocuments}
            selectedLibraryId={selectedLibraryId}
            selectedDocumentId={selectedDocumentId}
            onSelectLibrary={(id) => { setSelectedLibraryId(id); setSelectedDocumentId(null); }}
            onSelectDocument={setSelectedDocumentId}
            onCreateLibrary={handleCreateLibrary}
            onDeleteLibrary={handleDeleteLibrary}
            onRenameLibrary={handleRenameLibrary}
            onDeleteDocument={handleDeleteDocument}
            onUpdateDocumentLibrary={handleUpdateDocLibrary}
            onOpenDocument={openDocTab}
            onUpload={handleUpload}
            onClearRecent={handleClearRecent}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* Document reader — always in DOM, shown when document tab active */}
        <main className={`flex flex-1 min-h-0 transition-opacity duration-150 ${!isLibraryTab ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          {!focusMode && sidebarOpen && (
            <Sidebar
              onUpload={handleUpload}
              onOpenSettings={() => setSettingsOpen(true)}
              onToggleSidebar={() => setSidebarOpen(false)}
              documents={documents}
              currentDocumentId={currentDocument?.id}
              onSelectDocument={async (id) => {
                await selectDocument(id);
                const existingTab = tabs.find((t) => t.documentId === id);
                if (existingTab) setActiveTabId(existingTab.id);
              }}
              onDeleteDocument={async (id) => {
                await handleDeleteDocument(id);
                const tabId = `doc-${id}`;
                setTabs((prev) => prev.filter((t) => t.id !== tabId));
                if (activeTabId === tabId) setActiveTabId('library');
              }}
              onRelinkDocument={relinkDocument}
              totalPages={totalPages}
              currentPage={currentPage}
              onJumpToPage={jumpToPage}
              thumbnails={thumbnails}
              thumbnailsLoading={thumbnailsLoading}
            />
          )}

          {/* Collapsed sidebar strip */}
          {!focusMode && !sidebarOpen && (
            <div className="w-11 border-r border-[#e7e5e4] bg-white flex flex-col items-center py-3 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#78716c] hover:bg-[#f5f5f4] hover:text-[#1c1917] transition-colors"
                title="Show sidebar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>
                </svg>
              </button>
            </div>
          )}

          <MainCanvas
            zoomLevel={zoomLevel}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomByFactor={handleZoomByFactor}
            hasDocument={!!currentDocument}
            isLoading={pdfLoading || isRendering}
            currentPage={currentPage}
            totalPages={totalPages}
            outline={outline}
            onJumpToPage={jumpToPage}
            onHighlightSelection={handleHighlightSelection}
            onAddNoteSelection={handleAddNoteSelection}
            onExplainSelection={() => { void handleExplainTerm(); }}
            onDropAICard={handleDropAICard}
            documentId={currentDocument?.id}
            onToggleFocusMode={() => setFocusMode((v) => !v)}
            isFocusMode={focusMode}
            comparePageSignal={comparePageSignal}
            comparePaneCommand={comparePaneCommand}
            onSplitModeChange={setSplitActive}
            pdfFileBlob={currentDocument?.fileBlob ?? null}
          />

          {!focusMode && !splitActive && (
            <AIPanel
              messages={messages}
              isLoading={aiLoading}
              showPerfHints={uiSettings.showChatPerfHints}
              defaultInputMode={uiSettings.chatInputModeDefault}
              onSendMessage={(content, mode) => { void sendMessage(content, mode || 'auto'); }}
              onExplainTerm={() => { void handleExplainTerm(); }}
              onRetryMessage={(messageId, mode) => { void retryAssistantMessage(messageId, mode); }}
              onStopGeneration={stopGeneration}
              onPinToCanvas={handlePinMessageToCanvas}
              onUnpinFromCanvas={handleUnpinFromCanvas}
              onLocateCanvasCard={handleLocateCanvasCard}
              onSendToRightPane={handleSendToRightPane}
              onSummarize={handleSummarize}
              onTranslateSelection={handleTranslateSelection}
              onExportNotes={handleExportNotes}
              onJumpToCitation={handleJumpToCitation}
              notesAnnotations={notesAnnotations}
              onDeleteNote={handleDeleteNote}
              onUpdateNote={handleUpdateNote}
              onJumpToPage={(page) => {
                jumpToPage(page);
                setComparePageSignal(page);
                setComparePaneCommand({
                  page,
                  openSplit: true,
                  reason: 'reference',
                  nonce: Date.now(),
                });
              }}
              pendingRouteConfirmation={pendingRouteConfirmation}
              onConfirmRouteAsChat={() => { void confirmPendingRoute('chat'); }}
              onConfirmRouteAsDoc={() => { void confirmPendingRoute('doc'); }}
              onDismissRouteConfirm={dismissPendingRoute}
              pinnedMessageIds={pinnedMessageIds}
              attachments={attachments}
              onAddAttachment={(a) => setAttachments((prev) => [...prev, { ...a, id: crypto.randomUUID() }])}
              onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              width={panelWidth}
              isCollapsed={isPanelCollapsed}
              onWidthChange={setPanelWidth}
              onCollapse={(collapsed) => setIsPanelCollapsed(collapsed)}
            />
          )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profiles={profiles}
        activeProfileId={activeProfile?.id || ''}
        onSwitchProfile={switchProfile}
        onCreateProfile={createNewProfile}
        onDeleteProfile={async (profileId) => {
          try {
            await deleteProfile(profileId);
            setToast({ message: 'Profile deleted', type: 'success' });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete profile';
            setToast({ message, type: 'error' });
          }
        }}
        onRenameProfile={renameProfile}
        showChatPerfHints={uiSettings.showChatPerfHints}
        onToggleChatPerfHints={(enabled) => updateUiSettings({ showChatPerfHints: enabled })}
        chatInputModeDefault={uiSettings.chatInputModeDefault}
        onChangeChatInputModeDefault={(mode) => updateUiSettings({ chatInputModeDefault: mode })}
        routePreferenceStats={routePreferenceStats}
        routePreferenceScopeLabel={
          currentDocument?.fileName || 'global scope (no active document)'
        }
        routePreferenceScopeDetail={currentDocument?.id || undefined}
        onClearRoutePreferenceMemory={clearRoutePreferenceMemory}
        rememberRoutePreferenceAcrossSessions={uiSettings.rememberRoutePreferenceAcrossSessions}
        onToggleRememberRoutePreferenceAcrossSessions={(enabled) =>
          updateUiSettings({ rememberRoutePreferenceAcrossSessions: enabled })
        }
        currentTheme={uiSettings.theme}
        onChangeTheme={(theme) => updateUiSettings({ theme })}
        onSaveActiveProfile={handleSaveSettings}
        onTestConnectivity={async (config) => {
          return await aiCommands.testConnectivity(
            config.provider,
            config.endpoint,
            config.model,
            config.apiKey
          );
        }}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {chapterSelectorOpen && (
        <ChapterSelector
          chapters={chapterList}
          currentChapter={currentChapter}
          totalPages={totalPages}
          onConfirm={handleSummarizeChapters}
          onCancel={() => setChapterSelectorOpen(false)}
        />
      )}

      {noteInputOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e7e5e4] p-5 w-[360px] flex flex-col gap-3 animate-in fade-in zoom-in-95">
            <p className="text-sm font-semibold text-[#1c1917]">Add Note</p>
            <input
              ref={noteInputRef}
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-[#e7e5e4] text-sm text-[#1c1917] bg-[#fafaf9] focus:outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]/30 transition-colors"
              placeholder="Your note..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNoteInputSubmit(noteInputRef.current?.value ?? '');
                }
                if (e.key === 'Escape') setNoteInputOpen(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
                onClick={() => setNoteInputOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#c2410c] text-white hover:bg-[#9a3412] transition-colors"
                onClick={() => handleNoteInputSubmit(noteInputRef.current?.value ?? '')}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
