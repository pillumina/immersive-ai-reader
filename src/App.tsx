import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { AIPanel } from '@/components/layout/AIPanel';
import { TopBar, AppTab } from '@/components/layout/TopBar';
import { LibraryView } from '@/components/features/LibraryView';
import { SettingsModal } from '@/components/features/SettingsModal';
import { Toast } from '@/components/ui/Toast';
import { TagManagePopup } from '@/components/ui/TagManagePopup';
import { L2AIPopover } from '@/components/capture/L2AIPopover';
import { L3NoteEditor } from '@/components/capture/L3NoteEditor';
import { MiniAIWindow } from '@/components/capture/MiniAIWindow';
import { CaptureDrawer } from '@/components/capture/CaptureDrawer';
import { FocusStatusBar } from '@/components/capture/FocusStatusBar';
import type { CaptureItem } from '@/components/capture/CaptureItem';
import type { BackendAnnotation } from '@/lib/tauri/commands';
import { usePDF } from '@/hooks/usePDF';
import { usePDFThumbnails } from '@/hooks/usePDFThumbnails';
import { useAI } from '@/hooks/useAI';
import { useSettings } from '@/hooks/useSettings';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCanvasRendering } from '@/hooks/useCanvasRendering';
import { FocusModeProvider, useFocusMode } from '@/hooks/useFocusMode';
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
  return (
    <FocusModeProvider>
      <AppInner />
    </FocusModeProvider>
  );
}

function AppInner() {
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
  const [activeTabId, _setActiveTabId] = useState('library');
  /** Always-read ref to avoid stale closure in handleCloseTab */
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  /** Stable setter that also keeps activeTabIdRef in sync */
  const setActiveTabIdWithSync = useCallback((id: string) => {
    activeTabIdRef.current = id;
    _setActiveTabId(id);
  }, []);

  // ─── Library management state ────────────────────────────────
  const [libraries, setLibraries] = useState<any[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<PDFDocument[]>([]);
  const recentDocIdsRef = useRef<Set<string>>(new Set());
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  // Stable refs for functions defined later in the component (avoids TDZ).
  const handleDeleteDocRef = useRef<any>(null);

  // ─── Focus Mode ─────────────────────────────────────────────────
  const [sessionDurationSecs, setSessionDurationSecs] = useState(0);
  const {
    state: focusState,
    enterFocusMode,
    exitFocusMode,
    updateProgress,
    updateCaptureCounts,
    triggerSummary,
    toggleMiniAI,
    toggleCaptureDrawer,
    dismissResumePrompt,
    dismissSummary80,
  } = useFocusMode();
  /** Captured DOM range rect + page number from text selection before toolbar clears it */
  const noteInputCapturedRangeRef = useRef<{
    left: number; top: number; width: number; height: number; pageNumber: number;
  } | null>(null);

  // ─── Tag popup state ───────────────────────────────────────
  const [tagPopupAnnotationId, setTagPopupAnnotationId] = useState<string | null>(null);

  const openDocTab = useCallback((doc: PDFDocument) => {
    const tabId = `doc-${doc.id}`;
    setTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: doc.fileName, type: 'document', documentId: doc.id }];
    });
    setActiveTabIdWithSync(tabId);
    // Track recents
    recentDocIdsRef.current.delete(doc.id);
    const newSet = new Set([doc.id, ...recentDocIdsRef.current]);
    recentDocIdsRef.current = newSet;
    // Keep only the 8 most recent — use ref to avoid depending on documents state
    setRecentDocuments(
      documentsRef.current.filter((d) => newSet.has(d.id)).slice(0, 8)
    );
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    if (tabId === 'library') return;
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabIdRef.current === tabId) {
      setActiveTabIdWithSync('library');
    }
  }, []); // activeTabIdRef is always current via the ref

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabIdWithSync(tabId);
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
  /** Captured selection text from before the toolbar modal cleared it */
  const noteInputCapturedTextRef = useRef<string | undefined>(undefined);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Array<{ id: string; type: 'text' | 'note'; content: string; page?: number }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [splitActive, setSplitActive] = useState(false);
  const [comparePageSignal, setComparePageSignal] = useState<number | null>(null);
  const [comparePaneCommand, setComparePaneCommand] = useState<{
    page: number;
    openSplit?: boolean;
    reason?: 'evidence' | 'reference' | 'compare';
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
    refreshCardTags,
    clearCardRenderer,
    removeCapture,
  } = useCanvasRendering(
    activeTabId === 'library' ? '' : 'pdf-scroll-container',
    activeTabId === 'library' ? '' : 'pdf-pages-container',
    currentDocument,
    zoomLevel,
    (messageId: string) => setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId)),
    (annotationId: string) => {
      setL3Editor({ type: 'edit', annotationId });
    }
  );

  // Stable callbacks passed to AIPanel to prevent unnecessary re-renders
  const handleAIPanelJumpToPage = useCallback((page: number) => {
    jumpToPage(page);
    setComparePageSignal(page);
    setComparePaneCommand({ page, openSplit: true, reason: 'reference' });
  }, [jumpToPage]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

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

  const getAIContext = useCallback(() => ({
    ...aiContext,
    selectedText: globalThis.getSelection?.()?.toString().trim() || '',
  }), [aiContext]);

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

  const handleConfirmRouteAsChat = useCallback(() => { void confirmPendingRoute('chat'); }, [confirmPendingRoute]);
  const handleConfirmRouteAsDoc = useCallback(() => { void confirmPendingRoute('doc'); }, [confirmPendingRoute]);

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

  // Use a ref to always call the latest handleDeleteNote (avoids stale closure in event listener).
  const handleDeleteNoteRef = useRef<any>(null);

  // Listen for note card delete from canvas
  useEffect(() => {
    const handler = (e: Event) => {
      const { annotationId } = (e as CustomEvent<{ annotationId: string }>).detail;
      void handleDeleteNoteRef.current(annotationId);
    };
    globalThis.document?.addEventListener('note-card-delete-app', handler);
    return () => globalThis.document?.removeEventListener('note-card-delete-app', handler);
  }, []);

  // Listen for note card save errors from canvas
  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent<{ message: string }>).detail;
      setToast({ message, type: 'error' });
    };
    globalThis.document?.addEventListener('note-card-save-error', handler);
    return () => globalThis.document?.removeEventListener('note-card-save-error', handler);
  }, []);

  // Listen for document library update errors
  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent<{ message: string }>).detail;
      setToast({ message, type: 'error' });
    };
    globalThis.document?.addEventListener('document-library-update-error', handler);
    return () => globalThis.document?.removeEventListener('document-library-update-error', handler);
  }, []);

  // Listen for tag popup open from canvas cards
  useEffect(() => {
    const handler = (e: Event) => {
      const { annotationId } = (e as CustomEvent<{ annotationId: string }>).detail;
      setTagPopupAnnotationId(annotationId);
    };
    globalThis.document?.addEventListener('open-card-tag-popup', handler);
    return () => globalThis.document?.removeEventListener('open-card-tag-popup', handler);
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

  // ─── Focus Mode: 80% summary prompt trigger ───────────────────
  const [showFocus80Prompt, setShowFocus80Prompt] = useState(false);

  // ─── Capture data for Focus Mode ────────────────────────────────
  const NOTE_PREFIX = '__NOTE__|';
  const [captures, setCaptures] = useState<CaptureItem[]>([]);

  /** Convert a BackendAnnotation to a CaptureItem, or null if it's not a capture type */
  const annotationToCapture = useCallback(
    (a: BackendAnnotation): CaptureItem | null => {
      const rawText = typeof a.text === 'string' ? a.text : '';
      const page = Number(a.page_number) || 1;

      if (rawText.startsWith(NOTE_PREFIX)) {
        const after = rawText.slice(NOTE_PREFIX.length);
        const [noteContent] = after.split('\n\n');
        return {
          type: 'note',
          id: a.id,
          pageNumber: page,
          capturedAt: a.created_at,
          preview: noteContent,
          noteContent: noteContent,
          tags: [],
        };
      }

      if (rawText.startsWith(AI_CARD_PREFIX)) {
        const after = rawText.slice(AI_CARD_PREFIX.length);
        const parts = after.split('\n\n');
        const messageId = parts[0]?.trim() || '';
        const aiContent = parts.slice(1).join('\n\n');
        return {
          type: 'ai-response',
          id: a.id,
          pageNumber: page,
          capturedAt: a.created_at,
          preview: aiContent.slice(0, 120),
          aiContent: aiContent,
          messageId,
        };
      }

      // Plain highlight
      return {
        type: 'highlight',
        id: a.id,
        pageNumber: page,
        capturedAt: a.created_at,
        preview: rawText.slice(0, 200),
        highlightText: rawText,
      };
    },
    []
  );

  const loadCaptures = useCallback(async () => {
    if (!currentDocument?.id) { setCaptures([]); return; }
    try {
      const annotations = await annotationCommands.getByDocument(currentDocument.id);
      const items = annotations
        .filter((a) => a.type === 'highlight')
        .map(annotationToCapture)
        .filter((c): c is CaptureItem => c !== null);
      setCaptures(items);
    } catch (err) {
      console.error('[captures] load failed:', err);
    }
  }, [currentDocument?.id, annotationToCapture]);

  // ─── Focus Mode: session timer ────────────────────────────────
  useEffect(() => {
    if (!focusState.isActive) {
      setSessionDurationSecs(0);
      return;
    }
    const interval = setInterval(() => {
      setSessionDurationSecs((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [focusState.isActive]);

  // ─── Focus Mode: scroll-based progress tracking ───────────────
  const maxPercentageRef = useRef(0);
  const maxScrollTopRef = useRef(0);

  useEffect(() => {
    if (!focusState.isActive) {
      maxPercentageRef.current = 0;
      return;
    }
    const container = globalThis.document?.getElementById('pdf-scroll-container');
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const total = scrollHeight - clientHeight;
      if (total <= 0) return;
      const pct = Math.round((scrollTop / total) * 100);
      if (pct > maxPercentageRef.current) maxPercentageRef.current = pct;
      if (scrollTop > maxScrollTopRef.current) maxScrollTopRef.current = scrollTop;
      void updateProgress(currentPage ?? 1, scrollTop, maxPercentageRef.current);
      if (pct >= 80 && !focusState.summary80Shown && !focusState.summary80Visible) {
        setShowFocus80Prompt(true);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [focusState.isActive, focusState.summary80Shown, focusState.summary80Visible, currentPage, updateProgress]);

  // ─── Focus Mode: 80% summary trigger ─────────────────────────
  const handleUpload = useCallback(async () => {
    try {
      setToast({ message: 'Opening PDF file…', type: 'info' });
      await openPDFFile();
      setToast({ message: 'PDF loaded successfully!', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load PDF';
      setToast({ message, type: 'error' });
    }
  }, [openPDFFile]);

  const handleSidebarSelectDocument = useCallback(async (id: string) => {
    await selectDocument(id);
    const existingTab = tabs.find((t) => t.documentId === id);
    if (existingTab) setActiveTabIdWithSync(existingTab.id);
  }, [selectDocument, tabs]);

  const handleSidebarDeleteDocument = useCallback(async (id: string) => {
    // Use ref to avoid TDZ: handleDeleteDocument is defined later in the component.
    await handleDeleteDocRef.current(id);
    const tabId = `doc-${id}`;
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabIdWithSync('library');
  }, [tabs, activeTabId]); // handleDeleteDocRef is always stable

  const handleSaveSettings = async (nextConfig: AIConfig, profileName?: string) => {
    await saveActiveProfile(nextConfig, profileName);
    setToast({ message: 'AI settings saved', type: 'success' });
  };

  const handleDeleteProfile = useCallback(async (profileId: string) => {
    try {
      await deleteProfile(profileId);
      setToast({ message: 'Profile deleted', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete profile';
      setToast({ message, type: 'error' });
    }
  }, [deleteProfile]);

  const handleTestConnectivity = useCallback(async (config: {
    provider: string; endpoint: string; model: string; apiKey: string;
  }) => {
    return await aiCommands.testConnectivity(config.provider, config.endpoint, config.model, config.apiKey);
  }, []);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  const handleZoomByFactor = (factor: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev * factor, 0.3), 3));
  };
  const handleResetZoom = () => setZoomLevel(1);

  // Escape — exit Focus Mode if active, otherwise handled by individual components.
  const handleEscape = () => {
    if (focusState.isActive) {
      void exitFocusMode(currentPage ?? 1, maxScrollTopRef.current);
    }
  };

  const handleHighlightSelection = async () => {
    try {
      const count = await highlightSelection();
      if (count > 0 && focusState.isActive) {
        updateCaptureCounts(focusState.highlightsCount + count, focusState.notesCount, focusState.aiResponsesCount);
      }
      setToast({ message: `Added ${count} highlight${count > 1 ? 's' : ''}`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to highlight selection';
      setToast({ message, type: 'info' });
    }
  };

  /** L1 auto-highlight in Focus Mode — uses blue instead of yellow */
  const handleHighlightSelectionFocus = async () => {
    try {
      await highlightSelection('rgba(59, 130, 246, 0.2)');
    } catch {
      // Silent fail for auto-highlight; user can still use the toolbar
    }
  };

  /** L2 AI popover state — shown when L1 bubble is clicked */
  const [l2Popover, setL2Popover] = useState<{ position: { x: number; y: number }; text: string; page?: number } | null>(null);

  /** L3 note editor state */
  type L3EditorState =
    | { type: 'edit'; annotationId: string }
    | { type: 'new'; selectedText: string; pageNumber?: number }
    | null;
  const [l3Editor, setL3Editor] = useState<L3EditorState>(null);

  /** Handle L2 popover action — explain/translate/add-to-session/new-note */
  const handleL2Action = async (
    action: { type: string; text: string; page?: number }
  ) => {
    setL2Popover(null);
    switch (action.type) {
      case 'explain': {
        if (focusState.isActive) {
          setToast({ message: 'AI explanation will open in mini AI window', type: 'info' });
        }
        await explainTerm(action.text);
        break;
      }
      case 'translate': {
        if (focusState.isActive) {
          setToast({ message: 'Translation will open in mini AI window', type: 'info' });
        }
        await sendMessage(
          `Translate the following text${action.page ? ` from page ${action.page}` : ''}:\n\n${action.text}`,
          'term_light'
        );
        break;
      }
      case 'add-to-session': {
        // TODO(Phase 3): add to mini AI window input
        setToast({ message: '加入会话 — mini AI 窗口 Phase 3 实现', type: 'info' });
        break;
      }
      case 'new-note': {
        setL3Editor({ type: 'new', selectedText: action.text, pageNumber: action.page });
        break;
      }
      default:
        break;
    }
  };

  const handleAddNoteSelection = (
    position?: { x: number; y: number },
    targetPageNumber?: number,
    capturedText?: string,
    capturedRange?: { left: number; top: number; width: number; height: number; pageNumber: number }
  ) => {
    // Use text passed from toolbar/right-click if available, otherwise try DOM selection
    noteInputCapturedTextRef.current =
      capturedText ?? (() => {
        const sel = globalThis.getSelection?.();
        return (sel && !sel.isCollapsed) ? sel.toString().trim() : undefined;
      })();
    noteInputCapturedRangeRef.current = capturedRange ?? null;
    setNoteInputOpen(true);
    noteInputPositionRef.current = position;
    noteInputPageRef.current = targetPageNumber;
  };

  // ─── Capture Drawer handlers ─────────────────────────────────────
  const handleDeleteCapture = async (id: string) => {
    try {
      await annotationCommands.delete(id);
      setCaptures((prev) => prev.filter((c) => c.id !== id));
      removeCapture(id);
      setToast({ message: '已删除', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      setToast({ message, type: 'error' });
    }
  };

  const handleEditCapture = (item: CaptureItem) => {
    if (item.type === 'note') {
      setL3Editor({ type: 'edit', annotationId: item.id });
    } else if (item.type === 'highlight') {
      jumpToPage(item.pageNumber);
      setToast({ message: '跳转到高亮位置，选中文本后使用气泡按钮添加笔记', type: 'info' });
    }
    // AI responses: no edit support yet
  };

  // ─── Load captures when document changes ─────────────────────────
  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  // Refresh captures when notes are added via the note input modal
  useEffect(() => {
    if (notesAnnotations.length > 0) {
      void loadCaptures();
    }
  }, [notesAnnotations, loadCaptures]);

  useKeyboardShortcuts({
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetZoom: handleResetZoom,
    onJumpToPage: jumpToPage,
    onCloseTab: handleCloseTab,
    onEscape: handleEscape,
    onHighlight: handleHighlightSelection,
    onNewNote: () => handleAddNoteSelection(),
    onToggleFocusMode: () => {
      if (focusState.isActive) {
        void exitFocusMode(currentPage ?? 1, maxScrollTopRef.current);
      } else if (currentDocument?.id) {
        void enterFocusMode(currentDocument.id, currentPage ?? 1);
      }
    },
    onToggleMiniAI: toggleMiniAI,
    onToggleCaptureDrawer: toggleCaptureDrawer,
    activeTabId,
    currentPage,
    totalPages,
  });

  const handleNoteInputSubmit = async (note: string) => {
    setNoteInputOpen(false);
    if (!note.trim()) return;
    try {
      const created = await addNoteForSelection(
        note,
        noteInputPositionRef.current,
        noteInputPageRef.current,
        noteInputCapturedTextRef.current,
        noteInputCapturedRangeRef.current ?? undefined,
      );
      noteInputPositionRef.current = undefined;
      noteInputPageRef.current = undefined;
      noteInputCapturedTextRef.current = undefined;
      noteInputCapturedRangeRef.current = null;
      if (created) {
        setNotesAnnotations((prev) => [created, ...prev]);
        if (focusState.isActive) {
          updateCaptureCounts(focusState.highlightsCount, focusState.notesCount + 1, focusState.aiResponsesCount);
        }
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
      clearCardRenderer(annotationId);
      setToast({ message: 'Note deleted', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete note';
      setToast({ message, type: 'error' });
      // Don't re-throw — caller doesn't await this, would become unhandled rejection
    }
  };
  handleDeleteNoteRef.current = handleDeleteNote;

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
      // Don't re-throw — caller doesn't await this, would become unhandled rejection
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
      reason: 'evidence'
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
      reason: 'reference'
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
  handleDeleteDocRef.current = handleDeleteDocument;

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
          {!focusState.isActive && sidebarOpen && (
            <Sidebar
              onUpload={handleUpload}
              onOpenSettings={() => setSettingsOpen(true)}
              onToggleSidebar={() => setSidebarOpen(false)}
              documents={documents}
              currentDocumentId={currentDocument?.id}
              onSelectDocument={handleSidebarSelectDocument}
              onDeleteDocument={handleSidebarDeleteDocument}
              onRelinkDocument={relinkDocument}
              totalPages={totalPages}
              currentPage={currentPage}
              onJumpToPage={jumpToPage}
              thumbnails={thumbnails}
              thumbnailsLoading={thumbnailsLoading}
            />
          )}

          {/* Collapsed sidebar strip */}
          {!focusState.isActive && !sidebarOpen && (
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
            onToggleFocusMode={() => {
              if (focusState.isActive) {
                void exitFocusMode(currentPage ?? 1, maxScrollTopRef.current);
              } else if (currentDocument?.id) {
                void enterFocusMode(currentDocument.id, currentPage);
              }
            }}
            isFocusMode={focusState.isActive}
            onOpenL2Popover={(position, text, page) => {
              setL2Popover({ position, text, page });
            }}
            onHighlightSelectionFocus={handleHighlightSelectionFocus}
            comparePageSignal={comparePageSignal}
            comparePaneCommand={comparePaneCommand}
            onSplitModeChange={setSplitActive}
            pdfFileBlob={currentDocument?.fileBlob ?? null}
          />

          {!focusState.isActive && !splitActive && (
            <AIPanel
              messages={messages}
              isLoading={aiLoading}
              defaultInputMode={uiSettings.chatInputModeDefault}
              onSendMessage={(content, mode, attachments) => { void sendMessage(content, mode || 'auto', attachments); }}
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
              onJumpToPage={handleAIPanelJumpToPage}
              pendingRouteConfirmation={pendingRouteConfirmation}
              onConfirmRouteAsChat={handleConfirmRouteAsChat}
              onConfirmRouteAsDoc={handleConfirmRouteAsDoc}
              onDismissRouteConfirm={dismissPendingRoute}
              pinnedMessageIds={pinnedMessageIds}
              attachments={attachments}
              onRemoveAttachment={handleRemoveAttachment}
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
        onDeleteProfile={handleDeleteProfile}
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
        onTestConnectivity={handleTestConnectivity}
      />

      {tagPopupAnnotationId && (
        <TagManagePopup
          annotationId={tagPopupAnnotationId}
          onClose={() => setTagPopupAnnotationId(null)}
          onTagsChanged={(tags) => {
            if (refreshCardTags) {
              refreshCardTags(tagPopupAnnotationId, tags);
            }
          }}
        />
      )}

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

      {l2Popover && (
        <L2AIPopover
          position={l2Popover.position}
          text={l2Popover.text}
          page={l2Popover.page}
          isFocusMode={focusState.isActive}
          onAction={(action) => { void handleL2Action(action); }}
          onClose={() => setL2Popover(null)}
        />
      )}

      {l3Editor?.type === 'edit' && (
        <L3NoteEditor
          annotationId={l3Editor.annotationId}
          onClose={() => setL3Editor(null)}
          onSave={() => setL3Editor(null)}
        />
      )}

      {l3Editor?.type === 'new' && (
        <L3NoteEditor
          selectedText={l3Editor.selectedText}
          pageNumber={l3Editor.pageNumber}
          onClose={() => setL3Editor(null)}
          onAddNote={async (content, position, targetPage, capturedText) => {
            await addNoteForSelection(content, position, targetPage, capturedText);
          }}
        />
      )}

      {/* ── Focus Mode UI ─────────────────────────────────────────── */}

      {/* Resume session prompt */}
      {focusState.resumePromptVisible && focusState.resumeSession && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e7e5e4] p-5 w-[360px] flex flex-col gap-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <span className="text-lg">📖</span>
              <p className="text-sm font-semibold text-[#1c1917]">继续上次阅读</p>
            </div>
            <p className="text-[13px] text-[#78716c] leading-relaxed">
              上次阅读到第 <span className="font-semibold text-[#1c1917]">p{focusState.resumeSession.last_page}</span>，
              进度 <span className="font-semibold text-[#1c1917]">{Math.round(focusState.resumeSession.max_read_percentage ?? 0)}%</span>。
              {focusState.resumeSession.duration_minutes && (
                <> 学习了 <span className="font-semibold text-[#1c1917]">{focusState.resumeSession.duration_minutes} 分钟</span>。</>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
                onClick={() => {
                  dismissResumePrompt();
                }}
              >
                重新开始
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                onClick={() => {
                  if (focusState.resumeSession?.last_page) {
                    jumpToPage(focusState.resumeSession.last_page);
                  }
                  dismissResumePrompt();
                }}
              >
                继续阅读
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 80% summary prompt */}
      {showFocus80Prompt && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e7e5e4] p-5 w-[360px] flex flex-col gap-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <p className="text-sm font-semibold text-[#1c1917]">阅读进度达到 80%</p>
            </div>
            <p className="text-[13px] text-[#78716c] leading-relaxed">
              不错！你已经阅读了大部分内容。要不要生成一份总结来巩固所学？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
                onClick={() => {
                  setShowFocus80Prompt(false);
                  dismissSummary80();
                }}
              >
                稍后
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                onClick={() => {
                  setShowFocus80Prompt(false);
                  dismissSummary80();
                  triggerSummary();
                  setToast({ message: '正在准备生成总结…', type: 'info' });
                  void handleSummarize();
                }}
              >
                生成总结
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini AI Window */}
      {focusState.isActive && focusState.miniAIWindowOpen && (
        <MiniAIWindow
          messages={messages}
          isLoading={aiLoading}
          onSendMessage={(content) => { void sendMessage(content, 'auto', []); }}
          onStopGeneration={stopGeneration}
          onToggleMiniAI={toggleMiniAI}
          sessionDurationSecs={sessionDurationSecs}
        />
      )}

      {/* Capture Drawer */}
      {focusState.isActive && focusState.captureDrawerOpen && (
        <CaptureDrawer
          captures={captures}
          isOpen={focusState.captureDrawerOpen}
          onClose={toggleCaptureDrawer}
          onJumpTo={jumpToPage}
          onEditCapture={handleEditCapture}
          onDeleteCapture={handleDeleteCapture}
        />
      )}

      {/* Focus Status Bar */}
      {focusState.isActive && (
        <FocusStatusBar
          currentPage={currentPage ?? 1}
          totalPages={totalPages}
          maxProgress={focusState.maxProgress}
          highlightsCount={focusState.highlightsCount}
          notesCount={focusState.notesCount}
          aiResponsesCount={focusState.aiResponsesCount}
          sessionDurationSecs={sessionDurationSecs}
          onExitFocusMode={() => { void exitFocusMode(currentPage ?? 1, maxScrollTopRef.current); }}
        />
      )}
    </div>
  );
}

export default App;
